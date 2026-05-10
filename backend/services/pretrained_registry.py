"""
RS Dataset Factory - 预训练模型注册表

集中管理「内置」与「可下载」的 SOTA 分割 / 视觉模型，给前端「模型管理」页用。
设计目标：
  - 提供一个可读 + 可写的注册表，描述模型来源、架构、参数量、用途
  - 检测每个模型在 HF cache / 本地权重目录下是否已就绪
  - 提供下载接口（基于 HuggingFace Hub）
"""
from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Dict, List, Optional

# ====================================================================
# 注册表：6 个核心 SOTA 分割 / 视觉模型
# ====================================================================
# 每条记录字段:
#   id                : 唯一标识，前端按这个 id 触发下载/对比
#   display_name      : UI 显示名
#   family            : 'sam' | 'mask2former' | 'segformer' | 'oneformer' |
#                       'upernet' | 'dinov2' | 'remote_clip' | 'custom'
#   architecture      : 简明结构描述
#   backbone          : backbone 名（Swin-L, ConvNeXt, ViT-L, ...）
#   params            : 参数量字符串
#   train_dataset     : 预训练数据集
#   miou_or_metric    : 论文报告指标
#   paper             : 论文引用
#   hf_repo           : HuggingFace 模型仓库（None 表示非 HF）
#   local_path_var    : 如果是本地内置（非 HF），权重文件路径或环境变量名
#   tasks             : ['semantic_seg', 'panoptic_seg', 'feature_extract', ...]
#   tags              : ['indoor', 'outdoor', 'remote_sensing', 'open_vocab', ...]
#   description       : 一段简介，前端 tooltip 用
#   needs_download    : 是否需要联网下载（HF）
#   approx_size_mb    : 预估下载大小（MB）

PRETRAINED_REGISTRY: Dict[str, Dict] = {
    # -------- 1. SAM3：本仓库基础模型（已经内置） --------
    "sam3_default": {
        "id": "sam3_default",
        "display_name": "SAM3 (默认 / 本仓库)",
        "family": "sam",
        "architecture": "Segment Anything Model 3 (open-vocab)",
        "backbone": "ViT-H",
        "params": "636M",
        "train_dataset": "SAM3 dataset (Meta, 2024)",
        "miou_or_metric": "open-vocab segmentation, prompt-driven",
        "paper": "Meta AI - Segment Anything Model 3 (2024)",
        "hf_repo": None,  # 直接走 weights/sam3.pt
        "local_path_var": "weights/sam3.pt",
        "tasks": ["semantic_seg", "instance_seg", "open_vocab"],
        "tags": ["foundation", "open_vocab", "remote_sensing", "outdoor", "indoor"],
        "description": "本系统主力模型，支持开放词汇语义分割和实例分割，PRISM-A 推理策略基于此模型。",
        "needs_download": False,
        "approx_size_mb": 2400,
    },

    # -------- 2. Mask2Former Swin-L (ADE20K 150 类) --------
    "mask2former_swin_l_ade": {
        "id": "mask2former_swin_l_ade",
        "display_name": "Mask2Former-Swin-L (ADE20K)",
        "family": "mask2former",
        "architecture": "Mask2Former (universal segmentation) + Swin-Large backbone",
        "backbone": "Swin-Large",
        "params": "215M",
        "train_dataset": "ADE20K (150 classes, scene parsing)",
        "miou_or_metric": "56.1 mIoU (ADE20K val)",
        "paper": "Cheng et al., 'Masked-attention Mask Transformer for Universal Image Segmentation', CVPR 2022",
        "hf_repo": "facebook/mask2former-swin-large-ade-semantic",
        "local_path_var": None,
        "tasks": ["semantic_seg", "panoptic_seg"],
        "tags": ["closed_vocab", "ade20k", "indoor", "outdoor", "general"],
        "description": "通用场景分割 SOTA，含 building/road/water/grass/tree 等 150 类语义。常用作 Tier-2 类别精修。",
        "needs_download": True,
        "approx_size_mb": 850,
    },

    # -------- 3. SegFormer-B5 (ADE20K 150 类) --------
    "segformer_b5_ade": {
        "id": "segformer_b5_ade",
        "display_name": "SegFormer-B5 (ADE20K)",
        "family": "segformer",
        "architecture": "SegFormer (hierarchical Transformer + light MLP head)",
        "backbone": "MiT-B5",
        "params": "84M",
        "train_dataset": "ADE20K (150 classes)",
        "miou_or_metric": "51.8 mIoU (ADE20K val)",
        "paper": "Xie et al., 'SegFormer: Simple and Efficient Design for Semantic Segmentation with Transformers', NeurIPS 2021",
        "hf_repo": "nvidia/segformer-b5-finetuned-ade-640-640",
        "local_path_var": None,
        "tasks": ["semantic_seg"],
        "tags": ["closed_vocab", "ade20k", "lightweight", "fast"],
        "description": "高效率 Transformer 分割模型，参数量为 Mask2Former 的 1/3，推理速度快。同 ADE20K 类别集。",
        "needs_download": True,
        "approx_size_mb": 320,
    },

    # -------- 4. OneFormer Swin-L (ADE20K) --------
    "oneformer_swin_l_ade": {
        "id": "oneformer_swin_l_ade",
        "display_name": "OneFormer-Swin-L (ADE20K)",
        "family": "oneformer",
        "architecture": "OneFormer (single model for semantic + instance + panoptic)",
        "backbone": "Swin-Large",
        "params": "219M",
        "train_dataset": "ADE20K (150 classes, multi-task)",
        "miou_or_metric": "57.7 mIoU / 49.2 PQ",
        "paper": "Jain et al., 'OneFormer: One Transformer to Rule Universal Image Segmentation', CVPR 2023",
        "hf_repo": "shi-labs/oneformer_ade20k_swin_large",
        "local_path_var": None,
        "tasks": ["semantic_seg", "instance_seg", "panoptic_seg"],
        "tags": ["closed_vocab", "ade20k", "multi_task", "indoor", "outdoor"],
        "description": "多任务统一分割模型，可同时输出 semantic / instance / panoptic 三种结果，质量略高于 Mask2Former。",
        "needs_download": True,
        "approx_size_mb": 870,
    },

    # -------- 5. UperNet ConvNeXt-Small (ADE20K) --------
    "upernet_convnext_s_ade": {
        "id": "upernet_convnext_s_ade",
        "display_name": "UperNet-ConvNeXt-Small (ADE20K)",
        "family": "upernet",
        "architecture": "UperNet head + ConvNeXt-Small backbone",
        "backbone": "ConvNeXt-Small",
        "params": "60M",
        "train_dataset": "ADE20K (150 classes)",
        "miou_or_metric": "49.6 mIoU",
        "paper": "Liu et al., 'A ConvNet for the 2020s', CVPR 2022 (ConvNeXt) + Xiao et al., 'Unified Perceptual Parsing', ECCV 2018 (UperNet)",
        "hf_repo": "openmmlab/upernet-convnext-small",
        "local_path_var": None,
        "tasks": ["semantic_seg"],
        "tags": ["closed_vocab", "ade20k", "convnet", "lightweight"],
        "description": "纯卷积架构（ConvNeXt）+ UperNet 解码器，对边缘 / 纹理类目标（建筑屋顶、农田）有较好区分度。",
        "needs_download": True,
        "approx_size_mb": 250,
    },

    # -------- 6. DINOv2-Large (特征提取，用于自监督迁移) --------
    "dinov2_large": {
        "id": "dinov2_large",
        "display_name": "DINOv2-Large (Vision Backbone)",
        "family": "dinov2",
        "architecture": "DINOv2 self-supervised ViT-Large",
        "backbone": "ViT-L/14",
        "params": "300M",
        "train_dataset": "LVD-142M (自监督)",
        "miou_or_metric": "Linear probe top-1 86.3 (ImageNet)",
        "paper": "Oquab et al., 'DINOv2: Learning Robust Visual Features without Supervision', 2023",
        "hf_repo": "facebook/dinov2-large",
        "local_path_var": None,
        "tasks": ["feature_extract"],
        "tags": ["foundation", "self_supervised", "feature_backbone"],
        "description": "Meta 自监督 ViT 主干，可作为下游分割 / 检索任务的通用视觉特征提取器，零样本分类能力强。",
        "needs_download": True,
        "approx_size_mb": 1200,
    },
}


# ====================================================================
# 下载状态检测
# ====================================================================

def _hf_cache_root() -> Path:
    """HuggingFace 缓存根目录（默认 ~/.cache/huggingface/）"""
    env_cache = os.environ.get("HF_HOME") or os.environ.get("HUGGINGFACE_HUB_CACHE")
    if env_cache:
        return Path(env_cache)
    return Path.home() / ".cache" / "huggingface"


def is_hf_model_downloaded(repo_id: str) -> bool:
    """
    检测 HuggingFace 模型是否已经下载到本地缓存。
    HF Hub 的缓存目录结构: ~/.cache/huggingface/hub/models--{org}--{name}/snapshots/{hash}/
    """
    if not repo_id:
        return False
    cache_root = _hf_cache_root() / "hub"
    if not cache_root.exists():
        return False
    # 仓库目录名规则
    folder = "models--" + repo_id.replace("/", "--")
    target = cache_root / folder / "snapshots"
    if not target.exists():
        return False
    # 至少有一个 snapshot 目录且里面有文件
    for sub in target.iterdir():
        if sub.is_dir():
            try:
                # safetensors 或 bin 任一就算就绪
                files = list(sub.iterdir())
                if any(f.name.endswith((".safetensors", ".bin", ".pth", ".pt")) for f in files):
                    return True
                # 只有 config 没权重也不算
            except OSError:
                continue
    return False


def get_hf_cache_size(repo_id: str) -> int:
    """获取 HF 缓存中该 repo 的实际大小（bytes）"""
    if not repo_id:
        return 0
    cache_root = _hf_cache_root() / "hub"
    folder = "models--" + repo_id.replace("/", "--")
    target = cache_root / folder
    if not target.exists():
        return 0
    total = 0
    for root, _, files in os.walk(target):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def get_local_path_size(local_var: str) -> int:
    """获取本地权重文件大小（bytes）"""
    if not local_var:
        return 0
    # local_var 是相对仓库根的路径
    from backend.config import BASE_DIR
    p = Path(BASE_DIR) / local_var
    if not p.exists():
        return 0
    return p.stat().st_size


# ====================================================================
# 注册表查询接口
# ====================================================================

def list_pretrained() -> List[Dict]:
    """列出全部预训练模型，附加运行时状态字段"""
    out = []
    for entry in PRETRAINED_REGISTRY.values():
        meta = dict(entry)
        repo = entry.get("hf_repo")
        local_var = entry.get("local_path_var")
        if repo:
            downloaded = is_hf_model_downloaded(repo)
            actual_size = get_hf_cache_size(repo) if downloaded else 0
        elif local_var:
            actual_size = get_local_path_size(local_var)
            downloaded = actual_size > 0
        else:
            downloaded, actual_size = False, 0
        meta["downloaded"] = downloaded
        meta["actual_size_mb"] = round(actual_size / 1024 / 1024, 1) if actual_size else 0
        out.append(meta)
    return out


def get_pretrained(model_id: str) -> Optional[Dict]:
    return PRETRAINED_REGISTRY.get(model_id)


# ====================================================================
# 下载（HF Hub）
# ====================================================================

def download_pretrained(model_id: str) -> Dict:
    """
    触发预训练模型下载到 HF cache。同步执行，返回下载结果。
    
    对于已下载或本地内置模型，直接返回成功（idempotent）。
    """
    entry = PRETRAINED_REGISTRY.get(model_id)
    if not entry:
        raise ValueError(f"未注册的模型 id: {model_id}")
    repo = entry.get("hf_repo")
    if not repo:
        # 本地内置：检查文件存在即可
        local_var = entry.get("local_path_var")
        if local_var and get_local_path_size(local_var) > 0:
            return {
                "model_id": model_id,
                "status": "ready",
                "message": "本地内置模型已就绪",
                "size_mb": round(get_local_path_size(local_var) / 1024 / 1024, 1),
            }
        raise FileNotFoundError(f"本地内置模型 {local_var} 文件不存在")

    # HF 模型：调用 snapshot_download
    if is_hf_model_downloaded(repo):
        return {
            "model_id": model_id,
            "status": "ready",
            "message": f"{repo} 已存在于本地缓存",
            "size_mb": round(get_hf_cache_size(repo) / 1024 / 1024, 1),
        }

    from huggingface_hub import snapshot_download

    try:
        local_dir = snapshot_download(
            repo_id=repo,
            allow_patterns=["*.json", "*.txt", "*.safetensors", "*.bin", "*.model", "*.py"],
            ignore_patterns=["*.msgpack", "*.h5", "tf_model.h5", "*.ot"],
        )
        size = get_hf_cache_size(repo)
        return {
            "model_id": model_id,
            "status": "ready",
            "message": f"{repo} 下载完成（{round(size/1024/1024,1)} MB）",
            "size_mb": round(size / 1024 / 1024, 1),
            "local_dir": local_dir,
        }
    except Exception as e:
        raise RuntimeError(f"下载 {repo} 失败: {e}")


def remove_pretrained(model_id: str) -> Dict:
    """从 HF cache 移除已下载的模型"""
    entry = PRETRAINED_REGISTRY.get(model_id)
    if not entry:
        raise ValueError(f"未注册的模型 id: {model_id}")
    repo = entry.get("hf_repo")
    if not repo:
        raise ValueError("内置模型不支持删除")
    cache_root = _hf_cache_root() / "hub"
    folder = "models--" + repo.replace("/", "--")
    target = cache_root / folder
    if not target.exists():
        return {"model_id": model_id, "status": "not_found", "message": "未下载，无需删除"}
    shutil.rmtree(target, ignore_errors=True)
    return {"model_id": model_id, "status": "removed", "message": f"已删除 {repo} 缓存"}
