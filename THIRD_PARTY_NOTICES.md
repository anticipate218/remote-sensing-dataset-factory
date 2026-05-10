# Third-Party Notices / 第三方致谢与引用

本项目（RS Dataset Factory）使用、引用或集成了以下开源模型、代码与数据集。**对应的版权、许可与论文引用义务全部归属于各自的原作者**。本仓库以 MIT 协议发布的部分仅限于本项目自有代码（不含 `sam3/` 目录中的 Meta SAM 3 源码与所有需要单独下载的预训练权重）。

如发现遗漏或不准确，欢迎提 Issue / PR 修正。

---

## 1. 基础视觉分割模型（Vision Foundation / Segmentation Models）

### 1.1 Segment Anything Model 3 (SAM 3) — Meta AI
- **仓库**：https://github.com/facebookresearch/sam3
- **许可**：Apache License 2.0
- **代码分发**：本仓库 `sam3/` 目录直接来自 Meta 官方 SAM 3 仓库（保留原版权头 `# Copyright (c) Meta Platforms, Inc. and affiliates.`），用于本项目的开放词汇语义分割能力。
- **权重**：`weights/sam3.pt`（约 3.4 GB），从 Meta 官方渠道下载。
- **引用**：
  ```bibtex
  @article{ravi2024sam3,
    title   = {Segment Anything Model 3},
    author  = {Meta AI Research},
    year    = {2024},
    url     = {https://github.com/facebookresearch/sam3}
  }
  ```

### 1.2 Segment Anything (SAM) — Meta AI
- **仓库**：https://github.com/facebookresearch/segment-anything
- **许可**：Apache License 2.0
- **引用**：
  ```bibtex
  @article{kirillov2023segany,
    title   = {Segment Anything},
    author  = {Kirillov, Alexander and Mintun, Eric and Ravi, Nikhila and others},
    journal = {arXiv:2304.02643},
    year    = {2023}
  }
  ```

### 1.3 Mask2Former — Facebook (Meta) Research
- **HF**：`facebook/mask2former-swin-large-ade-semantic`
- **仓库**：https://github.com/facebookresearch/Mask2Former
- **许可**：MIT (code) / 见 HF 模型卡（weights）
- **引用**：
  ```bibtex
  @inproceedings{cheng2022mask2former,
    title     = {Masked-attention Mask Transformer for Universal Image Segmentation},
    author    = {Cheng, Bowen and Misra, Ishan and Schwing, Alexander G. and Kirillov, Alexander and Girdhar, Rohit},
    booktitle = {CVPR},
    year      = {2022}
  }
  ```

### 1.4 SegFormer — NVIDIA
- **HF**：`nvidia/segformer-b5-finetuned-ade-640-640`
- **仓库**：https://github.com/NVlabs/SegFormer
- **许可**：NVIDIA Source Code License-NC（非商用研究）/ HF 模型卡
- **引用**：
  ```bibtex
  @inproceedings{xie2021segformer,
    title     = {SegFormer: Simple and Efficient Design for Semantic Segmentation with Transformers},
    author    = {Xie, Enze and Wang, Wenhai and Yu, Zhiding and Anandkumar, Anima and Alvarez, Jose M. and Luo, Ping},
    booktitle = {NeurIPS},
    year      = {2021}
  }
  ```

### 1.5 OneFormer — SHI Lab
- **HF**：`shi-labs/oneformer_ade20k_swin_large`
- **仓库**：https://github.com/SHI-Labs/OneFormer
- **许可**：MIT
- **引用**：
  ```bibtex
  @inproceedings{jain2023oneformer,
    title     = {{OneFormer}: One Transformer to Rule Universal Image Segmentation},
    author    = {Jain, Jitesh and Li, Jiachen and Chiu, Mang Tik and Hassani, Ali and Orlov, Nikita and Shi, Humphrey},
    booktitle = {CVPR},
    year      = {2023}
  }
  ```

### 1.6 UperNet + ConvNeXt — OpenMMLab / Meta
- **HF**：`openmmlab/upernet-convnext-small`
- **仓库**：https://github.com/CSAILVision/unifiedparsing / https://github.com/facebookresearch/ConvNeXt
- **许可**：BSD / MIT
- **引用**：
  ```bibtex
  @inproceedings{xiao2018unified,
    title     = {Unified Perceptual Parsing for Scene Understanding},
    author    = {Xiao, Tete and Liu, Yingcheng and Zhou, Bolei and Jiang, Yuning and Sun, Jian},
    booktitle = {ECCV},
    year      = {2018}
  }
  @inproceedings{liu2022convnext,
    title     = {A {ConvNet} for the 2020s},
    author    = {Liu, Zhuang and Mao, Hanzi and Wu, Chao-Yuan and Feichtenhofer, Christoph and Darrell, Trevor and Xie, Saining},
    booktitle = {CVPR},
    year      = {2022}
  }
  ```

### 1.7 DINOv2 — Meta AI
- **HF**：`facebook/dinov2-large`
- **仓库**：https://github.com/facebookresearch/dinov2
- **许可**：Apache License 2.0
- **引用**：
  ```bibtex
  @article{oquab2023dinov2,
    title   = {{DINOv2}: Learning Robust Visual Features without Supervision},
    author  = {Oquab, Maxime and Darcet, Timoth{\'e}e and Moutakanni, Th{\'e}o and others},
    journal = {arXiv:2304.07193},
    year    = {2023}
  }
  ```

### 1.8 SegEarth-OV / SegEarth-OV-3 — 遥感开放词汇分割
- **仓库**：https://github.com/likyoo/SegEarth-OV
- **许可**：见仓库 LICENSE
- **说明**：本项目 PRISM-A 推理策略中的部分配置（`backend/config.py` 的 `SEGEARTH_STRATEGY`）参考了 SegEarth-OV-3 的官方默认值与 prob_thd 设置。
- **引用**：
  ```bibtex
  @article{li2024segearth,
    title   = {{SegEarth-OV}: Towards Training-Free Open-Vocabulary Segmentation for Remote Sensing Images},
    author  = {Li, Kaiyu and others},
    year    = {2024}
  }
  ```

---

## 2. 目标检测模型（Object Detection）

### 2.1 YOLOv8 / YOLOv8-OBB — Ultralytics
- **仓库**：https://github.com/ultralytics/ultralytics
- **许可**：**AGPL-3.0**（重要：商用需向 Ultralytics 申请商业许可）
- **权重**：`weights/yolov8/yolov8n.pt`、`weights/yolov8/yolov8s-obb.pt`
- **引用**：
  ```bibtex
  @software{ultralytics2023yolov8,
    author  = {Glenn Jocher and Ayush Chaurasia and Jing Qiu},
    title   = {Ultralytics {YOLOv8}},
    year    = {2023},
    url     = {https://github.com/ultralytics/ultralytics}
  }
  ```

---

## 3. 超分辨率模型（Super-Resolution）

### 3.1 Real-ESRGAN — Xintao Wang 等
- **仓库**：https://github.com/xinntao/Real-ESRGAN
- **许可**：BSD-3-Clause
- **权重**：`weights/realesrgan/RealESRGAN_x4plus.pth`、`weights/realesrgan/realesr-general-x4v3.pth`
- **引用**：
  ```bibtex
  @inproceedings{wang2021realesrgan,
    title     = {Real-{ESRGAN}: Training Real-World Blind Super-Resolution with Pure Synthetic Data},
    author    = {Wang, Xintao and Xie, Liangbin and Dong, Chao and Shan, Ying},
    booktitle = {ICCVW},
    year      = {2021}
  }
  ```

### 3.2 Satlas Super-Resolution — Allen Institute for AI
- **仓库**：https://github.com/allenai/satlas-super-resolution
- **许可**：MIT
- **权重**：`weights/realesrgan/satlas_esrgan_sr4.pth`
- **引用**：
  ```bibtex
  @article{satlas2023sr,
    title   = {Zooming Out on Zooming In: Advancing Super-Resolution for Remote Sensing},
    author  = {Allen Institute for AI},
    year    = {2023},
    url     = {https://github.com/allenai/satlas-super-resolution}
  }
  ```

### 3.3 TTST — Top-K Token Selective Transformer
- **仓库**：https://github.com/XY-boy/TTST
- **许可**：见原仓库（research / non-commercial）
- **权重**：`weights/ttst/ttst_4x.pth`
- **引用**：
  ```bibtex
  @article{xiao2024ttst,
    title  = {{TTST}: A Top-K Token Selective Transformer for Remote Sensing Image Super-Resolution},
    author = {Xiao, Yi and Yuan, Qiangqiang and Jiang, Kui and others},
    year   = {2024}
  }
  ```

---

## 4. 数据集模板（Class Preset Sources）

`backend/config.py` 中的 `CLASS_PRESETS` 提供了与下列公开数据集类别完全对齐的预设模板。**使用预设处理后的数据时，请按对应数据集的协议引用并遵守再分发限制。**

| 预设 ID | 数据集 | 引用 |
|---------|--------|------|
| `whu_building` | WHU Aerial Building Dataset | Ji et al., *Fully Convolutional Networks for Multi-source Building Extraction*, TGRS 2018 |
| `deepglobe_road` / `deepglobe_landcover` | DeepGlobe Challenge 2018 | Demir et al., *DeepGlobe 2018: A Challenge to Parse the Earth through Satellite Images*, CVPRW 2018 |
| `sen1floods11_water` | Sen1Floods11 | Bonafilia et al., *Sen1Floods11*, CVPRW 2020 |
| `loveda_urban` / `loveda_rural` | LoveDA | Wang et al., *LoveDA: A Remote Sensing Land-Cover Dataset for Domain Adaptive Semantic Segmentation*, NeurIPS 2021 |
| `isaid_objects` | iSAID / DOTA | Waqas Zamir et al., *iSAID: A Large-scale Dataset for Instance Segmentation in Aerial Images*, CVPRW 2019 |
| `isprs_potsdam` | ISPRS Potsdam / Vaihingen | ISPRS 2D Semantic Labeling Contest |
| `openearthmap` | OpenEarthMap | Xia et al., *OpenEarthMap: A Benchmark Dataset for Global High-Resolution Land Cover Mapping*, WACV 2023 |

---

## 5. 关键 Python / JS 依赖

主要依赖和它们的协议（完整列表见 `requirements.txt` 与 `frontend/package.json`）：

- **PyTorch** — BSD-style — https://pytorch.org/
- **FastAPI** — MIT — https://github.com/fastapi/fastapi
- **Uvicorn** — BSD-3-Clause — https://github.com/encode/uvicorn
- **Rasterio** — BSD-3-Clause — https://github.com/rasterio/rasterio
- **NumPy / SciPy / Matplotlib** — BSD — https://numpy.org / https://scipy.org / https://matplotlib.org
- **Pillow** — HPND — https://python-pillow.org/
- **Hugging Face Transformers / Hub** — Apache-2.0 — https://huggingface.co/
- **PyJWT** — MIT — https://github.com/jpadilla/pyjwt
- **React 18** — MIT — https://react.dev/
- **Ant Design 5** — MIT — https://ant.design/
- **Vite** — MIT — https://vitejs.dev/
- **Zustand / TanStack Query / Recharts / Framer Motion / Lucide / Three.js / Leaflet** — MIT — 各自官方仓库

---

如有任何引用、署名或协议相关问题，请通过 GitHub Issue 联系仓库作者。
