"""
RS Dataset Factory - 类别精修服务
为预测结果中的特定语义类别提供两类精修能力：

Tier 1: PRISM-A 单类别精修（基于 SegEarth-OV-3 自有权重）
  - inference_method = "prism_single"
  - 单一目标类（不再把多 prompt 当作多类别），融合用户提示词与领域提示词为 ONE 富文本
  - Strategy A：use_transformer_decoder=True + use_sem_seg=True + use_presence_score=True
  - 默认无边界限制（最强 PRISM）；可选边界模式

Tier 2: HuggingFace 真实预训练 SOTA 权重精修
  - inference_method = "hf_mask2former_ade" | "hf_segformer_ade" | "hf_oneformer_coco"
  - 下载真实预训练 checkpoint（Mask2Former-Swin-L / SegFormer-B5 / OneFormer），
    在 ADE20K / COCO-Stuff 上训练后提取目标类别索引

学术背景：
  - SegEarth-OV-3 (本仓库, 2025)             open-vocabulary aerial seg
  - Mask2Former (Cheng et al., CVPR 2022)    universal seg backbone
  - SegFormer (Xie et al., NeurIPS 2021)     transformer-based seg
  - OneFormer (Jain et al., CVPR 2023)       task-aware unified seg
  - ADE20K (Zhou et al., 2017)               150 类语义场景
  - COCO-Stuff (Caesar et al., 2018)         133 类 panoptic
"""
import os
import sys
import numpy as np
from typing import Dict, List, Optional, Tuple
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))


# ================================================================
# ADE20K 150 类别 → 我们关心的目标类别索引（HuggingFace Mask2Former / SegFormer 用此索引）
# 完整列表见 https://huggingface.co/datasets/scene_parse_150
# ================================================================
ADE20K_BUILDING = [1, 25, 48]               # building, house, skyscraper
ADE20K_ROAD = [6, 11, 52, 90]               # road, sidewalk, path, dirt-track
ADE20K_WATER = [21, 26, 60, 109, 113, 128]  # water, sea, river, pool, waterfall, lake
ADE20K_VEGETATION = [4, 9, 17, 66, 72]      # tree, grass, plant, palm, bush
ADE20K_FARMLAND = [13, 29, 46, 94]          # earth, field, sand, land

# ================================================================
# 精修器登录表
# 两类 inference_method:
#   - "prism_single"           : SegEarth-OV-3 + Strategy A 单类别精修
#   - "hf_mask2former_ade"     : 下载 Mask2Former-Swin-Large ADE20K 真实预训练权重
#   - "hf_segformer_ade"       : 下载 SegFormer-B5 ADE20K 真实预训练权重
#   - "gpt_boundary"           : GPT 视觉 + SAM3 边界精修（已有）
# ================================================================
REFINER_REGISTRY: Dict[str, Dict] = {
    # ============================================================
    # TIER 1 — PRISM-A 单类别精修（最强开放词汇方案，无需下载）
    # ============================================================
    "building_prism": {
        "id": "building_prism",
        "name": "建筑物精修 · PRISM-A 单类别",
        "description": "SegEarth-OV-3 单类别 PRISM-A：融合多个建筑物领域提示词为 ONE 富文本，Transformer Decoder + Semantic + Presence Score 全开",
        "icon": "fa-building",
        "color": "#74f7fd",
        "category": "building",
        "tier": 1,
        "match_keywords": ["building", "house", "roof", "建筑", "房屋", "建筑物"],
        "paper": "SegEarth-OV-3 PRISM (本仓库, 2025) + WHU/SpaceNet/LoveDA prompt design",
        "repo": "https://github.com/likyoo/SegEarth-OV",
        "architecture": "SegEarth-OV-3 backbone + PRISM-A (mask + semantic fusion, presence-modulated)",
        "inference_method": "prism_single",
        "rich_prompt": "building rooftop, residential house, apartment, commercial structure, warehouse, factory shed, urban building footprint",
        "prob_thd": 0.4,  # 对齐 cfg_whu_aerial.py / cfg_whu_sat_II.py
        "post_process": {"morph_open": 3, "morph_close": 5, "min_area": 80, "fill_holes": True},
    },
    "road_prism": {
        "id": "road_prism",
        "name": "道路精修 · PRISM-A 单类别",
        "description": "SegEarth-OV-3 单类别 PRISM-A：融合公路 / 街道 / 小径多尺度提示词",
        "icon": "fa-road",
        "color": "#74fabd",
        "category": "road",
        "tier": 1,
        "match_keywords": ["road", "highway", "street", "道路", "公路"],
        "paper": "SegEarth-OV-3 PRISM + DeepGlobe/CHN6-CUG prompt design",
        "repo": "https://github.com/likyoo/SegEarth-OV",
        "architecture": "SegEarth-OV-3 + PRISM-A single-class with multi-scale road prompts",
        "inference_method": "prism_single",
        "rich_prompt": "road highway, asphalt street, paved lane, dirt road, urban expressway, intersection",
        "prob_thd": 0.4,  # 对齐 cfg_deepglobe_road.py
        "post_process": {"morph_open": 2, "morph_close": 8, "min_area": 100, "fill_holes": False},
    },
    "water_prism": {
        "id": "water_prism",
        "name": "水体精修 · PRISM-A 单类别",
        "description": "SegEarth-OV-3 单类别 PRISM-A：融合河流/湖泊/水塘/泳池多类水体提示词",
        "icon": "fa-water",
        "color": "#5bc7fa",
        "category": "water",
        "tier": 1,
        "match_keywords": ["water", "river", "lake", "pond", "水"],
        "paper": "SegEarth-OV-3 PRISM + Sen1Floods11 prompt design",
        "repo": "https://github.com/likyoo/SegEarth-OV",
        "architecture": "SegEarth-OV-3 + PRISM-A single-class with hydrographic prompts",
        "inference_method": "prism_single",
        "rich_prompt": "water body, river, lake, pond, reservoir, swimming pool water surface",
        "prob_thd": 0.5,  # 水体易过分割（蓝色屋顶/阴影），用更严阈值
        "post_process": {"morph_open": 4, "morph_close": 6, "min_area": 200, "fill_holes": True},
    },
    "vegetation_prism": {
        "id": "vegetation_prism",
        "name": "植被精修 · PRISM-A 单类别",
        "description": "SegEarth-OV-3 单类别 PRISM-A：融合森林/树冠/草地/灌木提示词",
        "icon": "fa-tree",
        "color": "#4ade80",
        "category": "vegetation",
        "tier": 1,
        "match_keywords": ["vegetation", "forest", "grass", "tree", "植被", "森林", "草"],
        "paper": "SegEarth-OV-3 PRISM + GlobeLand30/LoveDA prompt design",
        "repo": "https://github.com/likyoo/SegEarth-OV",
        "architecture": "SegEarth-OV-3 + PRISM-A single-class with vegetation taxonomy",
        "inference_method": "prism_single",
        "rich_prompt": "vegetation, forest tree canopy, grassland, shrubs, park lawn, woodland",
        "prob_thd": 0.4,
        "post_process": {"morph_open": 3, "morph_close": 5, "min_area": 100, "fill_holes": True},
    },
    "farmland_prism": {
        "id": "farmland_prism",
        "name": "农田精修 · PRISM-A 单类别",
        "description": "SegEarth-OV-3 单类别 PRISM-A：融合耕地/水稻田/麦田提示词",
        "icon": "fa-wheat-awn",
        "color": "#f0c040",
        "category": "farmland",
        "tier": 1,
        "match_keywords": ["farmland", "cropland", "rice", "paddy", "agriculture", "农田", "耕地"],
        "paper": "SegEarth-OV-3 PRISM + LoveDA-Agriculture prompt design",
        "repo": "https://github.com/likyoo/SegEarth-OV",
        "architecture": "SegEarth-OV-3 + PRISM-A single-class with agriculture taxonomy",
        "inference_method": "prism_single",
        "rich_prompt": "cropland, farmland, rice paddy field, wheat field, agricultural plot, plowed soil",
        "prob_thd": 0.4,
        "post_process": {"morph_open": 3, "morph_close": 5, "min_area": 150, "fill_holes": True},
    },

    # ============================================================
    # TIER 2 — HuggingFace 真实预训练 SOTA 权重（首次使用自动下载）
    # ============================================================
    "building_mask2former_ade": {
        "id": "building_mask2former_ade",
        "name": "建筑物精修 · Mask2Former-Swin-L (ADE20K)",
        "description": "下载 Facebook Mask2Former Swin-Large 在 ADE20K (150 类) 上的官方预训练权重，提取 building/house/skyscraper 像素",
        "icon": "fa-building",
        "color": "#5bc7fa",
        "category": "building",
        "tier": 2,
        "match_keywords": ["building", "house"],
        "paper": "Mask2Former (Cheng et al., CVPR 2022) + ADE20K (Zhou et al., 2017)",
        "repo": "https://huggingface.co/facebook/mask2former-swin-large-ade-semantic",
        "architecture": "Mask2Former (Swin-Large backbone) - 215M params, 56.1 mIoU on ADE20K",
        "inference_method": "hf_mask2former_ade",
        "hf_model": "facebook/mask2former-swin-large-ade-semantic",
        "ade_indices": ADE20K_BUILDING,
        "post_process": {"morph_open": 2, "morph_close": 4, "min_area": 60, "fill_holes": True},
    },
    "road_mask2former_ade": {
        "id": "road_mask2former_ade",
        "name": "道路精修 · Mask2Former-Swin-L (ADE20K)",
        "description": "下载 Mask2Former Swin-Large ADE20K 权重，提取 road/sidewalk/path/dirt-track 像素",
        "icon": "fa-road",
        "color": "#4ade80",
        "category": "road",
        "tier": 2,
        "match_keywords": ["road", "highway", "street"],
        "paper": "Mask2Former (Cheng et al., CVPR 2022) + ADE20K",
        "repo": "https://huggingface.co/facebook/mask2former-swin-large-ade-semantic",
        "architecture": "Mask2Former (Swin-Large backbone) - 215M params",
        "inference_method": "hf_mask2former_ade",
        "hf_model": "facebook/mask2former-swin-large-ade-semantic",
        "ade_indices": ADE20K_ROAD,
        "post_process": {"morph_open": 2, "morph_close": 6, "min_area": 100, "fill_holes": False},
    },
    "water_mask2former_ade": {
        "id": "water_mask2former_ade",
        "name": "水体精修 · Mask2Former-Swin-L (ADE20K)",
        "description": "下载 Mask2Former ADE20K 权重，提取 water/sea/river/pool/lake/waterfall 像素",
        "icon": "fa-water",
        "color": "#74f7fd",
        "category": "water",
        "tier": 2,
        "match_keywords": ["water", "river", "lake", "pond"],
        "paper": "Mask2Former (Cheng et al., CVPR 2022) + ADE20K",
        "repo": "https://huggingface.co/facebook/mask2former-swin-large-ade-semantic",
        "architecture": "Mask2Former (Swin-Large backbone) - 215M params",
        "inference_method": "hf_mask2former_ade",
        "hf_model": "facebook/mask2former-swin-large-ade-semantic",
        "ade_indices": ADE20K_WATER,
        "post_process": {"morph_open": 3, "morph_close": 5, "min_area": 200, "fill_holes": True},
    },
    "vegetation_mask2former_ade": {
        "id": "vegetation_mask2former_ade",
        "name": "植被精修 · Mask2Former-Swin-L (ADE20K)",
        "description": "下载 Mask2Former ADE20K 权重，提取 tree/grass/plant/palm/bush 像素",
        "icon": "fa-tree",
        "color": "#74fabd",
        "category": "vegetation",
        "tier": 2,
        "match_keywords": ["vegetation", "forest", "grass", "tree"],
        "paper": "Mask2Former (Cheng et al., CVPR 2022) + ADE20K",
        "repo": "https://huggingface.co/facebook/mask2former-swin-large-ade-semantic",
        "architecture": "Mask2Former (Swin-Large backbone) - 215M params",
        "inference_method": "hf_mask2former_ade",
        "hf_model": "facebook/mask2former-swin-large-ade-semantic",
        "ade_indices": ADE20K_VEGETATION,
        "post_process": {"morph_open": 3, "morph_close": 4, "min_area": 80, "fill_holes": True},
    },
    "farmland_mask2former_ade": {
        "id": "farmland_mask2former_ade",
        "name": "农田/裸地精修 · Mask2Former-Swin-L (ADE20K)",
        "description": "下载 Mask2Former ADE20K 权重，提取 earth/field/sand/land 像素",
        "icon": "fa-wheat-awn",
        "color": "#f0c040",
        "category": "farmland",
        "tier": 2,
        "match_keywords": ["farmland", "cropland", "field"],
        "paper": "Mask2Former (Cheng et al., CVPR 2022) + ADE20K",
        "repo": "https://huggingface.co/facebook/mask2former-swin-large-ade-semantic",
        "architecture": "Mask2Former (Swin-Large backbone) - 215M params",
        "inference_method": "hf_mask2former_ade",
        "hf_model": "facebook/mask2former-swin-large-ade-semantic",
        "ade_indices": ADE20K_FARMLAND,
        "post_process": {"morph_open": 3, "morph_close": 4, "min_area": 150, "fill_holes": True},
    },

    # ============================================================
    # TIER 1-B — PRISM-A 单类别（专属任务/数据集对齐）
    #   — 同 Tier 1，但提示词更针对特定子场景（如城市航拍密集建筑、深色屋顶等）
    # ============================================================
    "building_inria_prism": {
        "id": "building_inria_prism",
        "name": "建筑物精修 · PRISM-A 城市航拍 (INRIA-style)",
        "description": "针对 INRIA Aerial / WHU Aerial 风格的密集城市航拍建筑物，融合屋顶纹理 / 阴影 / 几何提示词",
        "icon": "fa-city",
        "color": "#5ce6f9",
        "category": "building",
        "tier": 1,
        "match_keywords": ["building", "city", "urban", "rooftop", "建筑", "城市"],
        "paper": "SegEarth-OV-3 PRISM + INRIA Aerial Image Labeling (Maggiori et al., 2017)",
        "repo": "https://github.com/likyoo/SegEarth-OV",
        "architecture": "SegEarth-OV-3 + PRISM-A single-class with urban dense rooftop prompts",
        "inference_method": "prism_single",
        "rich_prompt": "dense urban rooftop, gabled roof, flat concrete roof, residential block, apartment building, downtown skyscraper, white roof, dark asphalt rooftop, building cluster",
        "prob_thd": 0.5,  # 城市密集场景用更严阈值，避免阴影/路面误检
        "post_process": {"morph_open": 2, "morph_close": 4, "min_area": 60, "fill_holes": True},
    },

    # ============================================================
    # TIER 2-B — SegFormer-B5 (类别专属轻量 ADE20K)
    # ============================================================
    "building_segformer_ade": {
        "id": "building_segformer_ade",
        "name": "建筑物精修 · SegFormer-B5 (ADE20K)",
        "description": "下载 SegFormer-B5 ADE20K 权重（81M 轻量），提取 building/house/skyscraper 像素",
        "icon": "fa-building",
        "color": "#a3d9fa",
        "category": "building",
        "tier": 2,
        "match_keywords": ["building", "house", "rooftop"],
        "paper": "SegFormer (Xie et al., NeurIPS 2021) + ADE20K",
        "repo": "https://huggingface.co/nvidia/segformer-b5-finetuned-ade-640-640",
        "architecture": "SegFormer-B5 (MiT-B5 backbone) - 81M params, 51.8 mIoU on ADE20K",
        "inference_method": "hf_segformer_ade",
        "hf_model": "nvidia/segformer-b5-finetuned-ade-640-640",
        "ade_indices": ADE20K_BUILDING,
        "post_process": {"morph_open": 2, "morph_close": 4, "min_area": 60, "fill_holes": True},
    },
    "road_segformer_ade": {
        "id": "road_segformer_ade",
        "name": "道路精修 · SegFormer-B5 (ADE20K)",
        "description": "下载 SegFormer-B5 ADE20K 权重，提取 road/sidewalk/path 像素（轻量备选）",
        "icon": "fa-road",
        "color": "#a3fac9",
        "category": "road",
        "tier": 2,
        "match_keywords": ["road", "highway", "street"],
        "paper": "SegFormer (Xie et al., NeurIPS 2021) + ADE20K",
        "repo": "https://huggingface.co/nvidia/segformer-b5-finetuned-ade-640-640",
        "architecture": "SegFormer-B5 (MiT-B5) - 81M params",
        "inference_method": "hf_segformer_ade",
        "hf_model": "nvidia/segformer-b5-finetuned-ade-640-640",
        "ade_indices": ADE20K_ROAD,
        "post_process": {"morph_open": 2, "morph_close": 6, "min_area": 100, "fill_holes": False},
    },
    "water_segformer_ade": {
        "id": "water_segformer_ade",
        "name": "水体精修 · SegFormer-B5 (ADE20K)",
        "description": "下载 SegFormer-B5 ADE20K 权重，提取 water/sea/river/pool 像素（轻量备选）",
        "icon": "fa-water",
        "color": "#a3e7fa",
        "category": "water",
        "tier": 2,
        "match_keywords": ["water", "river", "lake"],
        "paper": "SegFormer (Xie et al., NeurIPS 2021) + ADE20K",
        "repo": "https://huggingface.co/nvidia/segformer-b5-finetuned-ade-640-640",
        "architecture": "SegFormer-B5 (MiT-B5) - 81M params",
        "inference_method": "hf_segformer_ade",
        "hf_model": "nvidia/segformer-b5-finetuned-ade-640-640",
        "ade_indices": ADE20K_WATER,
        "post_process": {"morph_open": 3, "morph_close": 5, "min_area": 200, "fill_holes": True},
    },
    "vegetation_segformer_ade": {
        "id": "vegetation_segformer_ade",
        "name": "植被精修 · SegFormer-B5 (ADE20K)",
        "description": "下载 SegFormer-B5 ADE20K 权重，提取 tree/grass/plant 像素（轻量备选）",
        "icon": "fa-tree",
        "color": "#bdf2c1",
        "category": "vegetation",
        "tier": 2,
        "match_keywords": ["vegetation", "forest", "grass", "tree"],
        "paper": "SegFormer (Xie et al., NeurIPS 2021) + ADE20K",
        "repo": "https://huggingface.co/nvidia/segformer-b5-finetuned-ade-640-640",
        "architecture": "SegFormer-B5 (MiT-B5) - 81M params",
        "inference_method": "hf_segformer_ade",
        "hf_model": "nvidia/segformer-b5-finetuned-ade-640-640",
        "ade_indices": ADE20K_VEGETATION,
        "post_process": {"morph_open": 3, "morph_close": 4, "min_area": 80, "fill_holes": True},
    },

    # ============================================================
    # TIER 2-C — SegFormer-B5 通用模式（其它非常规类别兜底）
    # ============================================================
    "general_segformer_ade": {
        "id": "general_segformer_ade",
        "name": "通用地物精修 · SegFormer-B5 (ADE20K)",
        "description": "下载 NVIDIA SegFormer-B5 ADE20K 预训练权重（轻量备选），自动按目标类别名匹配 ADE20K 索引",
        "icon": "fa-globe",
        "color": "#a78bfa",
        "category": "any",
        "tier": 2,
        "match_keywords": [],
        "paper": "SegFormer (Xie et al., NeurIPS 2021) + ADE20K",
        "repo": "https://huggingface.co/nvidia/segformer-b5-finetuned-ade-640-640",
        "architecture": "SegFormer-B5 (MiT-B5 backbone) - 81M params, 51.8 mIoU on ADE20K",
        "inference_method": "hf_segformer_ade",
        "hf_model": "nvidia/segformer-b5-finetuned-ade-640-640",
        "ade_indices": [],
        "post_process": {"morph_open": 2, "morph_close": 4, "min_area": 80, "fill_holes": True},
    },

    # ============================================================
    # TIER 3 — GPT 视觉引导（已有，保留）
    # ============================================================
    "ai_gpt_boundary": {
        "id": "ai_gpt_boundary",
        "name": "AI 视觉边界精修 · GPT-5.5 + SAM3",
        "description": "GPT 视觉模型阅读整图 → 输出错误区域 bbox 与正确类别 → SAM3 box-prompted 精修边界",
        "icon": "fa-robot",
        "color": "#f97316",
        "category": "any",
        "tier": 3,
        "match_keywords": [],
        "paper": "GPT-Vision-Guided Open Vocabulary Segmentation Refinement",
        "repo": "OpenAI GPT-5.5 + Meta SAM3",
        "architecture": "GPT-5.5 vision LLM (region proposal) + SAM3 (box-prompted segmentation)",
        "inference_method": "gpt_boundary",
        "prompts": [],
        "post_process": {"morph_open": 2, "morph_close": 3, "min_area": 50, "fill_holes": True},
    },
}


def list_refiners() -> List[Dict]:
    """返回所有可用精修器（前端展示用元信息）"""
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "description": r["description"],
            "icon": r["icon"],
            "color": r["color"],
            "category": r.get("category", "other"),
            "tier": r.get("tier", 1),
            "paper": r.get("paper", ""),
            "repo": r.get("repo", ""),
            "architecture": r.get("architecture", ""),
            "inference_method": r.get("inference_method", "prism_single"),
            "hf_model": r.get("hf_model", ""),
            "needs_download": r.get("inference_method", "").startswith("hf_"),
            "rich_prompt": r.get("rich_prompt", ""),
            # 前端 AIDiagnoseModal 内联模型选择器需要根据 match_keywords 找候选
            "match_keywords": r.get("match_keywords", []),
            "prob_thd": r.get("prob_thd"),
        }
        for r in REFINER_REGISTRY.values()
    ]


def suggest_refiner_for_class(class_name: str, class_prompt: str = "") -> Optional[str]:
    """根据类名和提示词推荐合适的精修器"""
    text = (class_name + " " + class_prompt).lower()
    # 优先匹配同类别中的第一个
    for refiner in REFINER_REGISTRY.values():
        if not refiner.get("match_keywords"):
            continue
        for kw in refiner["match_keywords"]:
            if kw.lower() in text:
                return refiner["id"]
    return None


def get_refiner(refiner_id: str) -> Dict:
    """
    根据精修器 ID 查找。支持以下回退策略：
      1. 精确匹配 REFINER_REGISTRY 的 key（如 'building_prism'）
      2. 兼容旧 ID（如 'building_whu' → 'building_prism'，保持历史任务可恢复）
      3. 匹配 category（如 'building' → 该类别 Tier 1 第一个，如 'building_prism'）
      4. 别名映射（如 'ai' / 'gpt' → 'ai_gpt_boundary'）
    """
    if refiner_id in REFINER_REGISTRY:
        return REFINER_REGISTRY[refiner_id]

    # 旧 ID 兼容映射（之前版本的精修器名）
    legacy_aliases = {
        "building_whu": "building_prism",
        "building_spacenet": "building_prism",
        "road_deepglobe": "road_prism",
        "road_chn6cug": "road_prism",
        "water_sen1floods": "water_prism",
        "water_general": "water_prism",
        "vegetation_globe30": "vegetation_prism",
        "vegetation_loveda": "vegetation_prism",
        "farmland_loveda": "farmland_prism",
        "landcover_openearthmap": "general_segformer_ade",
    }
    if refiner_id in legacy_aliases and legacy_aliases[refiner_id] in REFINER_REGISTRY:
        return REFINER_REGISTRY[legacy_aliases[refiner_id]]

    # 别名 / 简短名 → 默认精修器
    aliases = {
        "ai": "ai_gpt_boundary",
        "gpt": "ai_gpt_boundary",
        "vision": "ai_gpt_boundary",
        "ai_vision": "ai_gpt_boundary",
    }
    if refiner_id in aliases and aliases[refiner_id] in REFINER_REGISTRY:
        return REFINER_REGISTRY[aliases[refiner_id]]

    # category 匹配（优先 Tier 1 PRISM）
    rid_lower = (refiner_id or "").lower()
    matches = [r for r in REFINER_REGISTRY.values() if r.get("category", "").lower() == rid_lower]
    if matches:
        # 优先返回 Tier 1（PRISM-A），其次 Tier 2
        matches.sort(key=lambda r: r.get("tier", 99))
        return matches[0]

    available = list(REFINER_REGISTRY.keys())
    raise ValueError(f"未知精修器: {refiner_id}（可用: {available}）")


def resolve_refiner_id(refiner_id: str) -> str:
    """返回最终匹配的 refiner_id（保证存在于 REFINER_REGISTRY 中）"""
    return get_refiner(refiner_id)["id"]


# ================================================================
# 形态学后处理
# ================================================================
def _disk_kernel(radius: int) -> np.ndarray:
    y, x = np.ogrid[-radius : radius + 1, -radius : radius + 1]
    return (x * x + y * y <= radius * radius).astype(np.uint8)


def _binary_morphology(mask: np.ndarray, post_cfg: Dict) -> np.ndarray:
    try:
        import cv2
    except ImportError:
        cv2 = None

    bin_mask = (mask > 0).astype(np.uint8)

    if cv2 is not None:
        if post_cfg.get("morph_open"):
            k = _disk_kernel(post_cfg["morph_open"])
            bin_mask = cv2.morphologyEx(bin_mask, cv2.MORPH_OPEN, k)
        if post_cfg.get("morph_close"):
            k = _disk_kernel(post_cfg["morph_close"])
            bin_mask = cv2.morphologyEx(bin_mask, cv2.MORPH_CLOSE, k)

        if post_cfg.get("fill_holes"):
            inv = 1 - bin_mask
            num, lbl, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
            holes = np.ones_like(bin_mask)
            for i in range(1, num):
                if (
                    stats[i, cv2.CC_STAT_LEFT] == 0
                    or stats[i, cv2.CC_STAT_TOP] == 0
                    or stats[i, cv2.CC_STAT_LEFT] + stats[i, cv2.CC_STAT_WIDTH] >= bin_mask.shape[1]
                    or stats[i, cv2.CC_STAT_TOP] + stats[i, cv2.CC_STAT_HEIGHT] >= bin_mask.shape[0]
                ):
                    holes[lbl == i] = 0
            bin_mask = (bin_mask | holes).astype(np.uint8)

        if post_cfg.get("min_area", 0) > 0:
            num, lbl, stats, _ = cv2.connectedComponentsWithStats(bin_mask, connectivity=8)
            keep = np.zeros_like(bin_mask)
            for i in range(1, num):
                if stats[i, cv2.CC_STAT_AREA] >= post_cfg["min_area"]:
                    keep[lbl == i] = 1
            bin_mask = keep

    return bin_mask.astype(bool)


# ================================================================
# 核心精修函数（dispatch by inference_method）
# ================================================================
def refine_class(
    image_rgb: np.ndarray,
    invalid_mask: np.ndarray,
    original_mask: np.ndarray,
    target_class_idx: int,
    refiner_id: str,
    crop_size: int = 512,
    stride: int = 384,
    progress_callback=None,
    target_class_name: Optional[str] = None,
    extra_context: Optional[Dict] = None,
    boundary_mode: bool = False,        # ← 默认关闭，让 PRISM 全力发挥
    boundary_radius_px: int = 120,
    max_delta_ratio: float = 8.0,        # ← 放宽到 8×（之前 4× 太严苛）
) -> Tuple[np.ndarray, Dict]:
    """
    使用精修器对指定类别进行二次分割，并合并回原 mask。
    根据 refiner["inference_method"] 分派到不同实现。

    用户偏好（默认）：
      - boundary_mode=False：让 PRISM-A / HF 模型全力发挥，不约束在原类别邻域
      - max_delta_ratio=8.0：仅当精修后像素 > 原始 8 倍时才拒绝（防止灾难性过分割）

    需要更保守时（如 GPT 引导精修）可显式打开 boundary_mode=True。
    """
    refiner = get_refiner(refiner_id)
    method = refiner.get("inference_method", "prism_single")

    print(f"[Refine] 启动精修器={refiner['name']}, 推理方法={method}, 边界模式={boundary_mode}")

    common_kwargs = dict(
        image_rgb=image_rgb,
        invalid_mask=invalid_mask,
        original_mask=original_mask,
        target_class_idx=target_class_idx,
        refiner=refiner,
        progress_callback=progress_callback,
        target_class_name=target_class_name or "target",
        extra_context=extra_context or {},
        boundary_mode=boundary_mode,
        boundary_radius_px=boundary_radius_px,
        max_delta_ratio=max_delta_ratio,
    )

    if method == "prism_single":
        return _refine_prism_single(crop_size=crop_size, stride=stride, **common_kwargs)
    elif method.startswith("hf_"):
        from backend.services.hf_refine_service import refine_via_hf
        return refine_via_hf(**common_kwargs)
    elif method == "gpt_boundary":
        from backend.services.gpt_refine_service import refine_via_gpt_boundary
        return refine_via_gpt_boundary(
            image_rgb=image_rgb,
            invalid_mask=invalid_mask,
            original_mask=original_mask,
            target_class_idx=target_class_idx,
            target_class_name=target_class_name or "target",
            refiner=refiner,
            extra_context=extra_context or {},
            progress_callback=progress_callback,
        )
    elif method == "sam3_enhanced":
        # 兼容旧字段：自动转为 prism_single 调用
        print("[Refine] ⚠️  已弃用 sam3_enhanced，自动迁移到 prism_single")
        return _refine_prism_single(crop_size=crop_size, stride=stride, **common_kwargs)
    else:
        raise ValueError(f"未知 inference_method: {method}")


def _dilate_mask(binary: np.ndarray, radius: int) -> np.ndarray:
    """二值掩膜膨胀（无 OpenCV 时用 numpy 卷积）"""
    if radius <= 0:
        return binary.copy()
    try:
        import cv2
        k = _disk_kernel(radius)
        return cv2.dilate(binary.astype(np.uint8), k, iterations=1).astype(bool)
    except Exception:
        from scipy.ndimage import binary_dilation
        return binary_dilation(binary, iterations=radius)


def _refine_prism_single(
    image_rgb: np.ndarray,
    invalid_mask: np.ndarray,
    original_mask: np.ndarray,
    target_class_idx: int,
    refiner: Dict,
    target_class_name: str = "target",
    extra_context: Optional[Dict] = None,
    crop_size: int = 512,
    stride: int = 384,
    progress_callback=None,
    boundary_mode: bool = False,
    boundary_radius_px: int = 120,
    max_delta_ratio: float = 8.0,
) -> Tuple[np.ndarray, Dict]:
    """
    PRISM-A 单类别精修（最强）。

    与早期版本的关键区别：
      - 只用 ONE target class（不再把多 prompt 拆成 multi-class union）
      - 融合用户原 prompt + 精修器领域富文本作为 ONE 富 prompt
      - Strategy A 全开：use_transformer_decoder + use_sem_seg + use_presence_score
      - 默认无边界限制（boundary_mode=False），让 PRISM 真正发挥
      - max_delta_ratio 防止灾难性过分割（默认 8×）
    """
    from backend.config import MODEL_CONFIG
    from backend.core.predictor import get_predictor

    post_cfg = refiner.get("post_process", {})
    checkpoint = refiner.get("checkpoint") or MODEL_CONFIG["checkpoint_path"]

    h, w = image_rgb.shape[:2]
    if max(w, h) <= 1024:
        crop_size = min(w, h)
        stride = crop_size

    predictor = get_predictor(
        bpe_path=MODEL_CONFIG["bpe_path"],
        checkpoint_path=checkpoint,
        device=MODEL_CONFIG["device"],
        confidence_threshold=MODEL_CONFIG["confidence_threshold"],
    )

    # === 构造融合 prompt ===
    # 优先级：用户在类别编辑器中填的 current_prompt > refiner.rich_prompt > target_class_name
    user_prompt = (extra_context or {}).get("current_prompt", "").strip()
    refiner_rich = refiner.get("rich_prompt", "").strip()
    fused_parts = []
    if user_prompt:
        fused_parts.append(user_prompt)
    if refiner_rich:
        fused_parts.append(refiner_rich)
    if not fused_parts:
        fused_parts.append(target_class_name)
    fused_prompt = ", ".join(fused_parts)

    classes = ["background", target_class_name]
    prompts = {target_class_name: fused_prompt}

    print(
        f"[Refine PRISM-A] 单类别 \"{target_class_name}\" "
        f"crop={crop_size}, stride={stride}\n"
        f"  融合 prompt: \"{fused_prompt[:140]}{'...' if len(fused_prompt) > 140 else ''}\""
    )

    # 单类别精修使用更严的 prob_thd（对齐 cfg_inria.py = 0.5、cfg_whu_aerial.py = 0.4）
    # 没有这一步，建筑/水体类的语义 logit 在不该亮的地方也可能略 > 0，会造成过分割
    refine_prob_thd = float(refiner.get("prob_thd", 0.4))

    prediction, presence_scores = predictor.predict_full_image(
        img_np=image_rgb,
        invalid_mask=invalid_mask,
        classes=classes,
        prompts=prompts,
        crop_size=crop_size,
        stride=stride,
        progress_callback=progress_callback,
        use_sem_seg=True,
        use_transformer_decoder=True,   # Strategy A — 实例分支融合
        use_presence_score=True,        # PRISM 核心：per-crop 软调制
        prob_thd=refine_prob_thd,
        bg_idx=0,
    )

    refined_binary = (prediction == 1) & ~invalid_mask
    refined_binary = _binary_morphology(refined_binary, post_cfg)
    refined_binary = refined_binary & ~invalid_mask

    return _apply_safeguards_and_merge(
        original_mask=original_mask,
        refined_binary=refined_binary,
        target_class_idx=target_class_idx,
        refiner=refiner,
        presence_scores=presence_scores,
        boundary_mode=boundary_mode,
        boundary_radius_px=boundary_radius_px,
        max_delta_ratio=max_delta_ratio,
        log_prefix="[Refine PRISM-A]",
    )


def _apply_safeguards_and_merge(
    original_mask: np.ndarray,
    refined_binary: np.ndarray,
    target_class_idx: int,
    refiner: Dict,
    presence_scores: Optional[Dict] = None,
    boundary_mode: bool = False,
    boundary_radius_px: int = 120,
    max_delta_ratio: float = 8.0,
    log_prefix: str = "[Refine]",
) -> Tuple[np.ndarray, Dict]:
    """
    通用安全闸 + 合并：所有 inference_method 都通过这里完成最终决定。
    """
    extra_info: Dict = {}

    # === 边界模式（可选）===
    if boundary_mode:
        was_target = original_mask == target_class_idx
        original_pixels = int(was_target.sum())
        if original_pixels > 0:
            allowed_zone = _dilate_mask(was_target, boundary_radius_px)
            outside_count = int((refined_binary & ~allowed_zone).sum())
            refined_binary = refined_binary & allowed_zone
            extra_info.update({
                "boundary_mode": True,
                "boundary_radius_px": boundary_radius_px,
                "dropped_outside_zone_px": outside_count,
            })
            print(f"{log_prefix} 边界模式: radius={boundary_radius_px}px, "
                  f"丢弃越界像素={outside_count:,}")

    # === 过分割安全闸 ===
    was_target = original_mask == target_class_idx
    original_pixels = int(was_target.sum())
    refined_pixels = int(refined_binary.sum())
    delta_ratio = (refined_pixels - original_pixels) / max(original_pixels, 1)

    if original_pixels > 0 and delta_ratio > max_delta_ratio:
        print(f"{log_prefix} ⚠️  过分割保护：原={original_pixels:,}, "
              f"精修后={refined_pixels:,} (Δ={delta_ratio*100:.1f}% > {max_delta_ratio*100:.0f}%)")
        return original_mask.copy(), {
            "refiner_id": refiner["id"],
            "refiner_name": refiner["name"],
            "inference_method": refiner.get("inference_method", "prism_single"),
            "target_class_idx": target_class_idx,
            "original_pixels": original_pixels,
            "refined_pixels": refined_pixels,
            "added_pixels": 0,
            "removed_pixels": 0,
            "delta_ratio": delta_ratio,
            "rejected": True,
            "reject_reason": (
                f"精修结果像素膨胀至原始的 {1+delta_ratio:.1f}× "
                f"（超出安全阈值 {1+max_delta_ratio:.0f}×），疑似过分割，已拒绝应用。"
                f"建议改用其他精修器或开启边界模式。"
            ),
            **extra_info,
        }

    return _merge_refined_into_mask(
        original_mask=original_mask,
        refined_binary=refined_binary,
        target_class_idx=target_class_idx,
        refiner=refiner,
        presence_scores=presence_scores,
        extra_info=extra_info,
    )


def _merge_refined_into_mask(
    original_mask: np.ndarray,
    refined_binary: np.ndarray,
    target_class_idx: int,
    refiner: Dict,
    presence_scores: Optional[Dict] = None,
    extra_info: Optional[Dict] = None,
) -> Tuple[np.ndarray, Dict]:
    """
    合并精修结果到原 mask：
      1. 保留所有非目标类的原始预测
      2. 精修后的目标类区域设为 target_class_idx
      3. 原 mask 中是目标类但精修后不是的区域 → 置为 background(0)
    """
    new_mask = original_mask.copy()
    was_target = original_mask == target_class_idx

    new_mask[was_target & ~refined_binary] = 0
    new_mask[refined_binary] = target_class_idx

    added = int((~was_target & refined_binary).sum())
    removed = int((was_target & ~refined_binary).sum())
    final_pixels = int((new_mask == target_class_idx).sum())
    original_pixels = int(was_target.sum())

    info = {
        "refiner_id": refiner["id"],
        "refiner_name": refiner["name"],
        "inference_method": refiner.get("inference_method", "sam3_enhanced"),
        "target_class_idx": target_class_idx,
        "original_pixels": original_pixels,
        "refined_pixels": final_pixels,
        "added_pixels": added,
        "removed_pixels": removed,
        "delta_ratio": (
            (final_pixels - original_pixels) / max(original_pixels, 1)
        ),
    }
    if presence_scores:
        info["presence_scores"] = presence_scores
    if extra_info:
        info.update(extra_info)

    return new_mask, info
