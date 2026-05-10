"""
TTST (Top-k Token Selective Transformer) super-resolution inference wrapper.
IEEE TIP 2024 - specifically designed for remote sensing imagery.
No dependency on basicsr.
"""

import math
import torch
import numpy as np
from typing import Optional, Tuple


class TTSTSR:
    """Tile-based TTST super-resolution inference."""

    def __init__(self, weight_path: str, scale: int = 4,
                 tile: int = 128, tile_pad: int = 8, half: bool = False):
        self.scale = scale
        self.tile = tile
        self.tile_pad = tile_pad
        self.half = half
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        from backend.utils.ttst_arch import TTST
        self.model = TTST(upscale=scale)

        state = torch.load(weight_path, map_location='cpu')
        # Handle DataParallel saved weights (keys start with 'module.')
        if any(k.startswith('module.') for k in state.keys()):
            state = {k.replace('module.', ''): v for k, v in state.items()}
        self.model.load_state_dict(state, strict=True)
        self.model.eval().to(self.device)
        if self.half:
            self.model.half()

    @torch.no_grad()
    def enhance(self, img_bgr: np.ndarray, outscale: Optional[int] = None
                ) -> Tuple[np.ndarray, None]:
        if outscale is None:
            outscale = self.scale

        # BGR uint8 -> RGB float [0,1] tensor
        img = img_bgr[:, :, ::-1].copy().astype(np.float32) / 255.0
        img = torch.from_numpy(img).permute(2, 0, 1).unsqueeze(0)
        img = img.to(self.device)
        if self.half:
            img = img.half()

        # Pad input to be divisible by window_size (8)
        _, _, h, w = img.shape
        pad_h = (8 - h % 8) % 8
        pad_w = (8 - w % 8) % 8
        if pad_h > 0 or pad_w > 0:
            img = torch.nn.functional.pad(img, (0, pad_w, 0, pad_h), mode='reflect')

        if self.tile > 0 and (img.shape[2] > self.tile or img.shape[3] > self.tile):
            output = self._tile_process(img)
        else:
            output = self.model(img)

        # Remove padding from output
        if pad_h > 0 or pad_w > 0:
            output = output[:, :, :h * self.scale, :w * self.scale]

        output = output.squeeze(0).float().clamp(0, 1).cpu()
        # RGB float -> BGR uint8
        output = (output.permute(1, 2, 0).numpy()[:, :, ::-1] * 255).astype(np.uint8)

        if outscale != self.scale:
            oh, ow = output.shape[:2]
            new_h = int(oh * outscale / self.scale)
            new_w = int(ow * outscale / self.scale)
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

                # Ensure tile dims are divisible by 8
                th = input_end_y - input_start_y
                tw = input_end_x - input_start_x
                pad_th = (8 - th % 8) % 8
                pad_tw = (8 - tw % 8) % 8

                tile_input = img[:, :, input_start_y:input_end_y, input_start_x:input_end_x]
                if pad_th > 0 or pad_tw > 0:
                    tile_input = torch.nn.functional.pad(tile_input, (0, pad_tw, 0, pad_th), mode='reflect')

                tile_output = self.model(tile_input)

                # Remove extra padding from tile output
                if pad_th > 0 or pad_tw > 0:
                    tile_output = tile_output[:, :, :th * scale, :tw * scale]

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
