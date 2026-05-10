# 模型权重下载指南 / Model Weights Download Guide

本仓库**不分发任何第三方预训练权重**。要让系统正常工作，请按下述说明手动下载到对应位置（合计约 3.5 GB）。

完整版权与引用见 [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)。

---

## 0. 一览表

| 必需 | 文件 | 模型 | 大小 | 目标路径 | License |
|:----:|------|------|------|----------|---------|
| ✅ | `sam3.pt` | Meta SAM 3 | ~3.4 GB | `weights/sam3.pt` | Apache-2.0 |
| ⚙️ 可选 | `RealESRGAN_x4plus.pth` | Real-ESRGAN | ~64 MB | `weights/realesrgan/` | BSD-3 |
| ⚙️ 可选 | `realesr-general-x4v3.pth` | Real-ESRGAN | ~5 MB | `weights/realesrgan/` | BSD-3 |
| ⚙️ 可选 | `satlas_esrgan_sr4.pth` | Satlas SR | ~128 MB | `weights/realesrgan/` | MIT |
| ⚙️ 可选 | `ttst_4x.pth` | TTST | ~71 MB | `weights/ttst/` | research |
| ⚙️ 可选 | `yolov8n.pt` | YOLOv8-nano | ~6 MB | `weights/yolov8/` | AGPL-3.0 |
| ⚙️ 可选 | `yolov8s-obb.pt` | YOLOv8s-OBB | ~22 MB | `weights/yolov8/` | AGPL-3.0 |
| 🤗 自动 | Mask2Former / SegFormer / OneFormer / UperNet / DINOv2 | HF Hub | ~2 GB | `~/.cache/huggingface/hub/` | 见各自模型卡 |

> ✅ = 启动后端最少需要 ; ⚙️ = 仅在使用对应功能（超分 / 旋转框检测 / 精修）时下载 ; 🤗 = 首次推理时由 `huggingface_hub` 自动拉取，无需手动操作。

---

## 1. SAM 3（**必需**）

> 本系统的核心分割模型。代码位于 `sam3/` 目录（直接来自 Meta 官方仓库）。

```bash
# 方法一：从 Meta 官方 GitHub Release（按 README 找最新链接）
# https://github.com/facebookresearch/sam3
# 下载后放到 weights/sam3.pt

# 方法二（推荐）：HuggingFace 镜像（如果存在官方/社区镜像）
huggingface-cli download <official-sam3-repo> sam3.pt --local-dir weights/
```

校验：
```bash
ls -lh weights/sam3.pt
# 期望约 3.2 GB（具体大小以官方为准）
```

License 与引用：参见 [`THIRD_PARTY_NOTICES.md` §1.1](../THIRD_PARTY_NOTICES.md#11-segment-anything-model-3-sam-3--meta-ai)。

---

## 2. 超分辨率模型（可选）

仅在使用「图像增强 / 超分」功能时需要。

### 2.1 Real-ESRGAN（通用 4×）

```bash
mkdir -p weights/realesrgan
cd weights/realesrgan

# 通用模型（自然图像）
curl -LO https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth

# 通用 v3（更鲁棒，更小）
curl -LO https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth
```

### 2.2 Satlas Super-Resolution（**遥感专用**，强烈推荐）

```bash
# 详见官方仓库 README 选择具体配置
git clone https://github.com/allenai/satlas-super-resolution
# 按官方说明转换或下载，最终放到 weights/realesrgan/satlas_esrgan_sr4.pth
```

### 2.3 TTST（Transformer 4×，遥感）

```bash
# 从作者 Google Drive / GitHub Release 下载，放到 weights/ttst/ttst_4x.pth
# https://github.com/XY-boy/TTST
```

---

## 3. YOLOv8（可选，旋转框检测）

```bash
mkdir -p weights/yolov8
cd weights/yolov8

# nano 通用检测
curl -LO https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt

# OBB（旋转框，用于遥感目标）
curl -LO https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8s-obb.pt
```

> ⚠️ **License 提醒**：YOLOv8 为 **AGPL-3.0**。商用必须从 Ultralytics 购买商业许可。仅供研究 / 个人使用时无此限制。

---

## 4. HuggingFace 模型（自动下载）

下列模型由前端「模型管理」页或后端首次推理时自动调用 `huggingface_hub.snapshot_download` 下载，无需手动操作：

```python
# 仓库 ID → 用途
"facebook/mask2former-swin-large-ade-semantic"  # 通用 ADE20K 150 类语义分割
"nvidia/segformer-b5-finetuned-ade-640-640"     # 同上，更轻量
"shi-labs/oneformer_ade20k_swin_large"          # 多任务统一分割
"openmmlab/upernet-convnext-small"              # ConvNeXt 卷积分割
"facebook/dinov2-large"                         # 自监督视觉特征
```

**离线 / 国内加速**：

```bash
# 选项 A：设置 HF 镜像
export HF_ENDPOINT=https://hf-mirror.com

# 选项 B：把 HF 缓存放到大盘
export HF_HOME=D:/hf_cache  # Windows
export HF_HOME=/data/hf_cache  # Linux

# 选项 C：预先下载到内网
huggingface-cli download facebook/mask2former-swin-large-ade-semantic
huggingface-cli download nvidia/segformer-b5-finetuned-ade-640-640
huggingface-cli download shi-labs/oneformer_ade20k_swin_large
huggingface-cli download openmmlab/upernet-convnext-small
huggingface-cli download facebook/dinov2-large
```

---

## 5. 验证清单

下载完毕后，应能看到（最低需求只要 `sam3.pt`）：

```
weights/
├── sam3.pt                              # 必需
├── realesrgan/
│   ├── RealESRGAN_x4plus.pth            # 可选
│   ├── realesr-general-x4v3.pth         # 可选
│   └── satlas_esrgan_sr4.pth            # 可选
├── ttst/
│   └── ttst_4x.pth                      # 可选
└── yolov8/
    ├── yolov8n.pt                       # 可选
    └── yolov8s-obb.pt                   # 可选
```

启动后端（`start_backend.bat` 或 `python -m uvicorn backend.main:app`）后访问 http://localhost:8000/api/models/pretrained 可看到每个模型的 `downloaded` 状态。
