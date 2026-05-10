"""
Standalone RRDBNet super-resolution inference.
Architecture matches basicsr's RRDBNet so Satlas / Real-ESRGAN weights load directly.
No dependency on basicsr or realesrgan packages.
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from typing import Optional, Tuple


# ── Architecture ──────────────────────────────────────────────

class ResidualDenseBlock(nn.Module):
    def __init__(self, num_feat=64, num_grow_ch=32):
        super().__init__()
        self.conv1 = nn.Conv2d(num_feat, num_grow_ch, 3, 1, 1)
        self.conv2 = nn.Conv2d(num_feat + num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv3 = nn.Conv2d(num_feat + 2 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv4 = nn.Conv2d(num_feat + 3 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv5 = nn.Conv2d(num_feat + 4 * num_grow_ch, num_feat, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, num_feat, num_grow_ch=32):
        super().__init__()
        self.rdb1 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb2 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb3 = ResidualDenseBlock(num_feat, num_grow_ch)

    def forward(self, x):
        out = self.rdb1(x)
        out = self.rdb2(out)
        out = self.rdb3(out)
        return out * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64,
                 num_block=23, num_grow_ch=32, scale=4):
        super().__init__()
        self.scale = scale
        self.conv_first = nn.Conv2d(num_in_ch, num_feat, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(num_feat, num_grow_ch) for _ in range(num_block)])
        self.conv_body = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_hr = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_last = nn.Conv2d(num_feat, num_out_ch, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        feat = self.conv_first(x)
        body_feat = self.conv_body(self.body(feat))
        feat = feat + body_feat
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


# ── Inference helper ──────────────────────────────────────────

class RRDBNetSR:
    """Tile-based RRDBNet super-resolution (no basicsr/realesrgan dependency)."""

    def __init__(self, weight_path: str, scale: int = 4,
                 tile: int = 256, tile_pad: int = 10, half: bool = False):
        self.scale = scale
        self.tile = tile
        self.tile_pad = tile_pad
        self.half = half
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        self.model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64,
                             num_block=23, num_grow_ch=32, scale=scale)
        state = torch.load(weight_path, map_location='cpu')
        if 'params_ema' in state:
            state = state['params_ema']
        elif 'params' in state:
            state = state['params']
        self.model.load_state_dict(state, strict=True)
        self.model.eval().to(self.device)
        if self.half:
            self.model.half()

    @torch.no_grad()
    def enhance(self, img_bgr: np.ndarray, outscale: Optional[int] = None
                ) -> Tuple[np.ndarray, None]:
        """
        Upscale a BGR uint8 image. Returns (result_bgr, None) for API compat.
        """
        if outscale is None:
            outscale = self.scale

        img = img_bgr.astype(np.float32) / 255.0
        img = torch.from_numpy(img[:, :, ::-1].copy()).permute(2, 0, 1).unsqueeze(0)
        img = img.to(self.device)
        if self.half:
            img = img.half()

        if self.tile > 0:
            output = self._tile_process(img)
        else:
            output = self.model(img)

        output = output.squeeze(0).float().clamp(0, 1).cpu()
        output = (output.permute(1, 2, 0).numpy()[:, :, ::-1] * 255).astype(np.uint8)

        if outscale != self.scale:
            h, w = output.shape[:2]
            new_h = int(h * outscale / self.scale)
            new_w = int(w * outscale / self.scale)
            import cv2
            output = cv2.resize(output, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)

        return output, None

    def _tile_process(self, img: torch.Tensor) -> torch.Tensor:
        _, _, h, w = img.shape
        tile = self.tile
        pad = self.tile_pad
        scale = self.scale

        out_h, out_w = h * scale, w * scale
        output = img.new_zeros((1, 3, out_h, out_w))

        tiles_y = math.ceil(h / tile)
        tiles_x = math.ceil(w / tile)

        for iy in range(tiles_y):
            for ix in range(tiles_x):
                ofs_y = min(iy * tile, h - tile) if h > tile else 0
                ofs_x = min(ix * tile, w - tile) if w > tile else 0

                input_start_y = max(ofs_y - pad, 0)
                input_start_x = max(ofs_x - pad, 0)
                input_end_y = min(ofs_y + tile + pad, h)
                input_end_x = min(ofs_x + tile + pad, w)

                tile_input = img[:, :, input_start_y:input_end_y, input_start_x:input_end_x]
                tile_output = self.model(tile_input)

                out_start_y = (ofs_y - input_start_y) * scale
                out_start_x = (ofs_x - input_start_x) * scale
                tile_h = min(tile, h - ofs_y)
                tile_w = min(tile, w - ofs_x)

                output[:, :,
                       ofs_y * scale: ofs_y * scale + tile_h * scale,
                       ofs_x * scale: ofs_x * scale + tile_w * scale] = \
                    tile_output[:, :,
                                out_start_y: out_start_y + tile_h * scale,
                                out_start_x: out_start_x + tile_w * scale]

        return output
