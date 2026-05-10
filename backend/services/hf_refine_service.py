"""
RS Dataset Factory - HuggingFace 真实预训练 SOTA 精修服务

支持 inference_method:
  - hf_mask2former_ade : facebook/mask2former-swin-large-ade-semantic
  - hf_segformer_ade   : nvidia/segformer-b5-finetuned-ade-640-640

首次使用时模型权重自动下载到 ~/.cache/huggingface/，后续从本地加载。
推理时按 refiner["ade_indices"] 列表提取目标 ADE20K 索引的像素，再合并回原 mask。
"""
import os
import logging
import threading
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
from PIL import Image

logger = logging.getLogger(__name__)

# ================================================================
# ADE20K 150 类索引 → 名称（用于自动匹配 target_class_name）
# ================================================================
ADE20K_CLASS_NAMES: List[str] = [
    "wall", "building", "sky", "floor", "tree", "ceiling", "road", "bed",
    "windowpane", "grass", "cabinet", "sidewalk", "person", "earth", "door",
    "table", "mountain", "plant", "curtain", "chair", "car", "water", "painting",
    "sofa", "shelf", "house", "sea", "mirror", "rug", "field", "armchair",
    "seat", "fence", "desk", "rock", "wardrobe", "lamp", "bathtub", "railing",
    "cushion", "base", "box", "column", "signboard", "chest of drawers",
    "counter", "sand", "sink", "skyscraper", "fireplace", "refrigerator",
    "grandstand", "path", "stairs", "runway", "case", "pool table", "pillow",
    "screen door", "stairway", "river", "bridge", "bookcase", "blind",
    "coffee table", "toilet", "flower", "book", "hill", "bench", "countertop",
    "stove", "palm", "kitchen island", "computer", "swivel chair", "boat",
    "bar", "arcade machine", "hovel", "bus", "towel", "light", "truck",
    "tower", "chandelier", "awning", "streetlight", "booth", "television",
    "airplane", "dirt track", "apparel", "pole", "land", "bannister",
    "escalator", "ottoman", "bottle", "buffet", "poster", "stage", "van",
    "ship", "fountain", "conveyer belt", "canopy", "washer", "plaything",
    "swimming pool", "stool", "barrel", "basket", "waterfall", "tent", "bag",
    "minibike", "cradle", "oven", "ball", "food", "step", "tank", "trade name",
    "microwave", "pot", "animal", "bicycle", "lake", "dishwasher", "screen",
    "blanket", "sculpture", "hood", "sconce", "vase", "traffic light", "tray",
    "ashcan", "fan", "pier", "crt screen", "plate", "monitor", "bulletin board",
    "shower", "radiator", "glass", "clock", "flag",
]

# 关键词 → ADE20K 索引候选（用于 segformer "auto" 模式）
KEYWORD_TO_ADE_INDICES: Dict[str, List[int]] = {
    "building": [1, 25, 48],          # building, house, skyscraper
    "house":    [25, 1],
    "road":     [6, 11, 52, 90],      # road, sidewalk, path, dirt track
    "highway":  [6, 11],
    "street":   [6, 11],
    "water":    [21, 26, 60, 109, 113, 128],  # water, sea, river, pool, waterfall, lake
    "river":    [60, 21],
    "lake":     [128, 21],
    "pond":     [109, 21, 128],
    "ocean":    [26, 21],
    "sea":      [26, 21],
    "pool":     [109, 21],
    "vegetation": [4, 9, 17, 66, 72],  # tree, grass, plant, palm, bush
    "tree":     [4, 17, 72],
    "forest":   [4, 17],
    "grass":    [9, 29],
    "lawn":     [9, 29],
    "shrub":    [17, 72],
    "farmland": [13, 29, 46, 94],     # earth, field, sand, land
    "cropland": [29, 13],
    "field":    [29, 13],
    "rice":     [29, 21],              # rice paddy ≈ field + water
    "paddy":    [29, 21],
    "sand":     [46],
    "earth":    [13, 94],
    "bareland": [13, 46, 94],
    "soil":     [13, 94],
}


# ================================================================
# 模型缓存（单例 + 线程锁）
# ================================================================
_MODEL_CACHE: Dict[str, Dict] = {}
_LOAD_LOCK = threading.Lock()


def _get_device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


def _load_mask2former(hf_model: str) -> Dict:
    """加载 Mask2Former 模型（语义分割模式）"""
    from transformers import Mask2FormerForUniversalSegmentation, Mask2FormerImageProcessor

    if hf_model in _MODEL_CACHE:
        return _MODEL_CACHE[hf_model]

    with _LOAD_LOCK:
        if hf_model in _MODEL_CACHE:
            return _MODEL_CACHE[hf_model]

        device = _get_device()
        logger.info(f"[HF Refine] 首次加载 Mask2Former: {hf_model} → {device}")
        processor = Mask2FormerImageProcessor.from_pretrained(hf_model)
        model = Mask2FormerForUniversalSegmentation.from_pretrained(hf_model)
        model = model.to(device).eval()
        # FP16 加速（GPU only）
        if device == "cuda":
            try:
                model = model.half()
            except Exception as e:
                logger.warning(f"FP16 转换失败，回退 FP32: {e}")

        _MODEL_CACHE[hf_model] = {
            "kind": "mask2former",
            "processor": processor,
            "model": model,
            "device": device,
        }
        logger.info(f"[HF Refine] Mask2Former 加载完成 (device={device})")
        return _MODEL_CACHE[hf_model]


def _load_segformer(hf_model: str) -> Dict:
    """加载 SegFormer 模型"""
    from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor

    if hf_model in _MODEL_CACHE:
        return _MODEL_CACHE[hf_model]

    with _LOAD_LOCK:
        if hf_model in _MODEL_CACHE:
            return _MODEL_CACHE[hf_model]

        device = _get_device()
        logger.info(f"[HF Refine] 首次加载 SegFormer: {hf_model} → {device}")
        processor = SegformerImageProcessor.from_pretrained(hf_model)
        model = SegformerForSemanticSegmentation.from_pretrained(hf_model)
        model = model.to(device).eval()
        if device == "cuda":
            try:
                model = model.half()
            except Exception as e:
                logger.warning(f"FP16 转换失败: {e}")

        _MODEL_CACHE[hf_model] = {
            "kind": "segformer",
            "processor": processor,
            "model": model,
            "device": device,
        }
        logger.info(f"[HF Refine] SegFormer 加载完成 (device={device})")
        return _MODEL_CACHE[hf_model]


# ================================================================
# 推理：滑窗预测（兼容大图）
# ================================================================
def _infer_semantic_seg(
    bundle: Dict,
    image_rgb: np.ndarray,
    crop_size: int = 640,
    overlap: float = 0.25,
    progress_callback=None,
) -> np.ndarray:
    """
    使用 HuggingFace 模型对整幅图做语义分割，输出 HxW 的 class id 数组。
    通过滑窗 + 平均 logits 聚合（防止边界效应）。
    """
    h, w = image_rgb.shape[:2]
    kind = bundle["kind"]
    processor = bundle["processor"]
    model = bundle["model"]
    device = bundle["device"]
    use_fp16 = (device == "cuda" and next(model.parameters()).dtype == torch.float16)

    num_classes = model.config.num_labels  # 150 for ADE20K

    # 累积 logits（CPU float32 节省 GPU 显存）
    logits_sum = np.zeros((num_classes, h, w), dtype=np.float32)
    logits_cnt = np.zeros((h, w), dtype=np.float32)

    # 构造滑窗坐标
    stride = max(int(crop_size * (1 - overlap)), 1)
    xs = list(range(0, max(w - crop_size, 0) + 1, stride))
    ys = list(range(0, max(h - crop_size, 0) + 1, stride))
    if xs[-1] + crop_size < w:
        xs.append(max(w - crop_size, 0))
    if ys[-1] + crop_size < h:
        ys.append(max(h - crop_size, 0))

    crops = [(x, y) for y in ys for x in xs]
    total = len(crops)
    logger.info(f"[HF Refine] 滑窗推理 {total} 个 crop, crop_size={crop_size}, stride={stride}")

    for idx, (x, y) in enumerate(crops):
        x2 = min(x + crop_size, w)
        y2 = min(y + crop_size, h)
        x1 = max(x2 - crop_size, 0)
        y1 = max(y2 - crop_size, 0)
        patch = image_rgb[y1:y2, x1:x2]

        pil = Image.fromarray(patch)
        inputs = processor(images=pil, return_tensors="pt")
        # FP16 输入
        for k, v in inputs.items():
            if isinstance(v, torch.Tensor):
                if use_fp16 and v.dtype == torch.float32:
                    v = v.half()
                inputs[k] = v.to(device)

        with torch.no_grad():
            outputs = model(**inputs)

        # 提取语义 logits（按模型类型不同）
        if kind == "mask2former":
            # Mask2Former 返回 mask_queries + class_queries
            # 用 processor 后处理获得 semantic segmentation [H_out, W_out]
            target_size = (y2 - y1, x2 - x1)
            seg = processor.post_process_semantic_segmentation(
                outputs, target_sizes=[target_size]
            )[0]  # tensor [H, W] of class ids
            # 转为 one-hot logits（用 100 表示该类置信，避免 0 = ambiguous）
            seg_np = seg.detach().cpu().numpy().astype(np.int64)
            patch_logits = np.full((num_classes, target_size[0], target_size[1]), -10.0, dtype=np.float32)
            for c in range(num_classes):
                patch_logits[c][seg_np == c] = 5.0
        elif kind == "segformer":
            # SegFormer 直接返回 logits [B, C, H/4, W/4]
            seg_logits = outputs.logits.float().cpu().numpy()[0]  # [C, h_o, w_o]
            target_size = (y2 - y1, x2 - x1)
            # 上采样到 patch 尺寸
            patch_logits = np.zeros((num_classes, target_size[0], target_size[1]), dtype=np.float32)
            from PIL import Image as PILImage
            for c in range(num_classes):
                resized = PILImage.fromarray(seg_logits[c]).resize(
                    (target_size[1], target_size[0]), PILImage.BILINEAR
                )
                patch_logits[c] = np.array(resized, dtype=np.float32)
        else:
            raise ValueError(f"Unsupported model kind: {kind}")

        logits_sum[:, y1:y2, x1:x2] += patch_logits
        logits_cnt[y1:y2, x1:x2] += 1

        if progress_callback:
            done_pct = (idx + 1) / total * 100
            progress_callback(idx + 1, total, f"HF 推理 {idx+1}/{total} ({done_pct:.0f}%)")

    # 归一化（每像素被多少个 crop 覆盖）
    logits_cnt = np.maximum(logits_cnt, 1)
    logits_avg = logits_sum / logits_cnt[None, :, :]

    # argmax → class id
    seg_map = logits_avg.argmax(axis=0).astype(np.int32)
    return seg_map


# ================================================================
# 主入口：refine_via_hf
# ================================================================
def refine_via_hf(
    image_rgb: np.ndarray,
    invalid_mask: np.ndarray,
    original_mask: np.ndarray,
    target_class_idx: int,
    refiner: Dict,
    target_class_name: str = "target",
    extra_context: Optional[Dict] = None,
    progress_callback=None,
    boundary_mode: bool = False,
    boundary_radius_px: int = 120,
    max_delta_ratio: float = 8.0,
) -> Tuple[np.ndarray, Dict]:
    """
    使用 HuggingFace 预训练 SOTA 模型精修单类别。

    refiner 必填字段：
      - hf_model        : HF 模型名（如 "facebook/mask2former-swin-large-ade-semantic"）
      - inference_method: "hf_mask2former_ade" | "hf_segformer_ade"
      - ade_indices     : 目标类对应的 ADE20K 索引列表（空 → 由 target_class_name 自动匹配）
    """
    method = refiner.get("inference_method", "")
    hf_model = refiner.get("hf_model")
    if not hf_model:
        raise ValueError(f"精修器 {refiner['id']} 缺少 hf_model 字段")

    # 加载模型
    if method == "hf_mask2former_ade":
        if progress_callback:
            progress_callback(0, 100, f"加载 Mask2Former 权重（首次需下载约 800MB）...")
        bundle = _load_mask2former(hf_model)
    elif method == "hf_segformer_ade":
        if progress_callback:
            progress_callback(0, 100, f"加载 SegFormer 权重（首次需下载约 320MB）...")
        bundle = _load_segformer(hf_model)
    else:
        raise ValueError(f"未知 HF 推理方法: {method}")

    # 解析目标 ADE20K 索引
    ade_indices = list(refiner.get("ade_indices") or [])
    if not ade_indices:
        # 根据 target_class_name 自动匹配（用于 SegFormer general 模式）
        name_lower = target_class_name.lower()
        for kw, indices in KEYWORD_TO_ADE_INDICES.items():
            if kw in name_lower:
                ade_indices = indices
                break
        if not ade_indices:
            # fallback：在 ADE20K 类名中找最相似
            for i, n in enumerate(ADE20K_CLASS_NAMES):
                if n in name_lower or name_lower in n:
                    ade_indices = [i]
                    break

    if not ade_indices:
        # 无法匹配，回退为 PRISM
        from backend.services.refine_service import _refine_prism_single
        logger.warning(
            f"[HF Refine] 无法为类别 \"{target_class_name}\" 匹配 ADE20K 索引，回退到 PRISM-A"
        )
        return _refine_prism_single(
            image_rgb=image_rgb,
            invalid_mask=invalid_mask,
            original_mask=original_mask,
            target_class_idx=target_class_idx,
            refiner=refiner,
            target_class_name=target_class_name,
            extra_context=extra_context,
            progress_callback=progress_callback,
            boundary_mode=boundary_mode,
            boundary_radius_px=boundary_radius_px,
            max_delta_ratio=max_delta_ratio,
        )

    matched_class_names = [ADE20K_CLASS_NAMES[i] for i in ade_indices if i < len(ADE20K_CLASS_NAMES)]
    logger.info(
        f"[HF Refine] {refiner['name']} → 目标类 \"{target_class_name}\" "
        f"匹配 ADE20K 索引 {ade_indices} ({matched_class_names})"
    )

    # 推理
    seg_map = _infer_semantic_seg(
        bundle=bundle,
        image_rgb=image_rgb,
        crop_size=640,
        overlap=0.25,
        progress_callback=progress_callback,
    )

    # 提取目标类二值掩膜
    refined_binary = np.isin(seg_map, ade_indices) & ~invalid_mask

    # 形态学后处理
    from backend.services.refine_service import _binary_morphology, _apply_safeguards_and_merge
    post_cfg = refiner.get("post_process", {})
    refined_binary = _binary_morphology(refined_binary, post_cfg)
    refined_binary = refined_binary & ~invalid_mask

    log_prefix = f"[HF {bundle['kind'].upper()}]"
    return _apply_safeguards_and_merge(
        original_mask=original_mask,
        refined_binary=refined_binary,
        target_class_idx=target_class_idx,
        refiner=refiner,
        presence_scores={"hf_indices": ade_indices, "hf_class_names": matched_class_names},
        boundary_mode=boundary_mode,
        boundary_radius_px=boundary_radius_px,
        max_delta_ratio=max_delta_ratio,
        log_prefix=log_prefix,
    )
