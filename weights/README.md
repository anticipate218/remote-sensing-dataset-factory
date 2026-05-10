# Model Weights / 模型权重

> ⚠️ **本目录默认为空**。仓库不分发任何第三方预训练权重（合计约 3.5 GB），请按下方说明自行下载到对应子目录。
>
> 完整下载指南、镜像、整理脚本：见 [`docs/MODEL_DOWNLOADS.md`](../docs/MODEL_DOWNLOADS.md)。

---

## 目录结构（下载后）

```
weights/
├── sam3.pt                       # ← Meta SAM 3 主干权重（约 3.4 GB）
├── realesrgan/
│   ├── RealESRGAN_x4plus.pth     # ← Real-ESRGAN 通用 4× 超分
│   ├── realesr-general-x4v3.pth  # ← Real-ESRGAN 通用 v3 4× 超分
│   └── satlas_esrgan_sr4.pth     # ← Satlas Super-Resolution（遥感专用）
├── ttst/
│   └── ttst_4x.pth               # ← TTST 4× 超分（遥感）
├── yolov8/
│   ├── yolov8n.pt                # ← Ultralytics YOLOv8-nano
│   └── yolov8s-obb.pt            # ← Ultralytics YOLOv8s-OBB（旋转框）
└── user_models/                  # ← 用户自训练模型（运行时生成，留空）
```

## 下载来源（官方）

| 文件 | 模型 | 作者 / License | 下载链接 |
|------|------|---------------|----------|
| `sam3.pt` | SAM 3 (Segment Anything 3) | Meta AI / Apache-2.0 | https://github.com/facebookresearch/sam3 |
| `RealESRGAN_x4plus.pth` | Real-ESRGAN | Xintao Wang et al. / BSD-3 | https://github.com/xinntao/Real-ESRGAN/releases |
| `realesr-general-x4v3.pth` | Real-ESRGAN | Xintao Wang et al. / BSD-3 | https://github.com/xinntao/Real-ESRGAN/releases |
| `satlas_esrgan_sr4.pth` | Satlas Super-Resolution | Allen Institute for AI / MIT | https://github.com/allenai/satlas-super-resolution |
| `ttst_4x.pth` | TTST (Top-K Token Selective Transformer) | Xiang et al. / non-commercial research | https://github.com/XY-boy/TTST |
| `yolov8n.pt` / `yolov8s-obb.pt` | YOLOv8 / YOLOv8-OBB | Ultralytics / AGPL-3.0 | https://github.com/ultralytics/ultralytics（首次推理时会自动下载） |

> 完整 BibTeX 引用见 [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)。

## HuggingFace Hub 下载（首次推理自动）

下列模型由 `huggingface_hub` 在首次调用时自动拉取到 `~/.cache/huggingface/hub/`，无需手动放到 `weights/`：

- `facebook/mask2former-swin-large-ade-semantic`
- `nvidia/segformer-b5-finetuned-ade-640-640`
- `shi-labs/oneformer_ade20k_swin_large`
- `openmmlab/upernet-convnext-small`
- `facebook/dinov2-large`

如需离线部署，可设置 `HF_HOME` 环境变量并预先 `huggingface-cli download <repo_id>`。
