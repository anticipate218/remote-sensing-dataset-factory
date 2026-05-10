"""
RS Dataset Factory - 配置文件
"""
import os
from pathlib import Path

# 项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent

# 存储路径
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"
WEIGHTS_DIR = BASE_DIR / "weights"
LOG_DIR = BASE_DIR / "logs"

# 确保目录存在
for dir_path in [UPLOAD_DIR, OUTPUT_DIR, WEIGHTS_DIR, LOG_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)

# 模型配置
MODEL_CONFIG = {
    "bpe_path": str(BASE_DIR / "sam3" / "assets" / "bpe_simple_vocab_16e6.txt.gz"),
    "checkpoint_path": str(WEIGHTS_DIR / "sam3.pt"),
    "device": "cuda",
    "confidence_threshold": 0.1,
}

# 默认处理参数
DEFAULT_PARAMS = {
    "max_size": 15000,
    "crop_size": 512,
    "stride": 384,
    "confidence_threshold": 0.1,
    "train_ratio": 0.7,
    "val_ratio": 0.15,
    "test_ratio": 0.15,
    "min_valid_ratio": 0.3,
    "min_class_diversity": 1,
    "rgb_bands": [4, 3, 2],
}

# SegEarth-OV-3 推理策略配置
#   - strategy_a: Full PRISM 策略（含 Transformer Decoder 分支，对齐 segearthov3_segmentor.py，质量最高）
#   - strategy_b: PRISM Dataset Creation 策略（轻量、快速，对齐 create_jiangxi_dataset.py）
#
# prob_thd 默认值取自官方 SegEarth-OV-3 configs 平均值（关键防止过分割！）：
#   cfg_inria.py        prob_thd=0.5  (单类建筑物)
#   cfg_whu_aerial.py   prob_thd=0.4  (单类建筑物，航拍)
#   cfg_whu_sat_II.py   prob_thd=0.4  (单类建筑物，卫星)
#   cfg_deepglobe_road  prob_thd=0.4  (单类道路)
#   cfg_loveda.py       prob_thd=0.5  (多类别)
#   cfg_iSAID.py        prob_thd=0.5  (多类别)
# 综合：选 0.4 作为通用默认，兼顾单类与多类场景
SEGEARTH_STRATEGY = {
    "use_sem_seg": True,
    "use_transformer_decoder": True,   # 默认策略 A（Full PRISM，质量最高）
    "use_presence_score": True,
    "prob_thd": 0.4,                   # ← 关键修复：从 0.0 改为 0.4，匹配官方 SegEarth-OV-3 默认
    "bg_idx": 0,
}

# Celery 配置
CELERY_CONFIG = {
    "broker_url": os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    "result_backend": os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0"),
}

# API 配置
API_CONFIG = {
    "host": "0.0.0.0",
    "port": 8000,
    "reload": True,
    "max_upload_size": 10 * 1024 * 1024 * 1024,  # 10GB
}

# ================================================================
# 预设类别配置
# 每个 preset 含：name / description / classes / prompts / palette
# 新增字段（前端可选用）：
#   - scene_tag    : "single" | "urban" | "rural" | "general" | "academic"  ← 场景分组
#   - icon         : 类别 emoji（前端展示用）
#   - tags         : 关键词标签 ["城市", "建筑物", "学术基准" ...]
#   - source       : 数据集来源/论文引用
# 没有 scene_tag 的旧 preset 会被前端归入 "general"
# ================================================================
CLASS_PRESETS = {
    "jiangxi_rural": {
        "name": "江西农村场景",
        "description": "适合内陆农村/城镇地区，22类",
        "scene_tag": "rural",
        "icon": "🌾",
        "tags": ["农村", "22类", "全场景"],
        "source": "RS Dataset Factory (本仓库)",
        "classes": [
            "background", "building", "road", "water", "forest", "shrub",
            "grassland", "farmland", "rice_paddy", "bare_soil", "sand",
            "parking_lot", "plaza", "bridge", "vehicle", "greenhouse",
            "industrial", "residential", "village", "mountain", "wetland", "solar_panel"
        ],
        "prompts": {
            "building": "building roof",
            "road": "road highway",
            "water": "river lake pond water",
            "forest": "forest trees",
            "shrub": "shrub bush",
            "grassland": "grass lawn",
            "farmland": "farm field",
            "rice_paddy": "rice paddy",
            "bare_soil": "bare soil",
            "sand": "sand",
            "parking_lot": "parking lot",
            "plaza": "plaza square",
            "bridge": "bridge overpass",
            "vehicle": "car vehicle",
            "greenhouse": "greenhouse tunnel",
            "industrial": "factory industrial",
            "residential": "houses residential",
            "village": "village houses cluster",
            "mountain": "mountain hill terrain",
            "wetland": "wetland marsh",
            "solar_panel": "solar panel array",
        },
        "palette": [
            [0, 0, 0], [255, 60, 60], [128, 128, 128], [0, 100, 255],
            [0, 100, 0], [50, 150, 50], [144, 238, 144], [255, 215, 0],
            [200, 200, 0], [139, 90, 43], [255, 228, 181], [64, 64, 64],
            [192, 192, 192], [255, 100, 0], [0, 255, 255], [200, 200, 200],
            [180, 100, 100], [255, 182, 193], [255, 218, 185], [139, 69, 19],
            [72, 209, 204], [75, 0, 130]
        ]
    },
    "coastal_city": {
        "name": "沿海城市场景",
        "description": "适合东南沿海高分辨率城市场景，23类",
        "scene_tag": "urban",
        "icon": "🏙️",
        "tags": ["城市", "沿海", "23类"],
        "source": "RS Dataset Factory (本仓库)",
        "classes": [
            "background", "building", "road", "water", "pond", "forest",
            "shrub", "grassland", "farmland", "rice_paddy", "bare_soil",
            "sand", "parking_lot", "plaza", "bridge", "ship", "vehicle",
            "greenhouse", "industrial", "residential", "commercial", "harbor", "runway"
        ],
        "prompts": {
            "building": "building roof",
            "road": "road highway",
            "water": "river sea water",
            "pond": "pond lake",
            "forest": "forest trees",
            "shrub": "shrub bush",
            "grassland": "grass lawn",
            "farmland": "farm field",
            "rice_paddy": "rice paddy",
            "bare_soil": "bare soil",
            "sand": "sand beach",
            "parking_lot": "parking lot",
            "plaza": "plaza square",
            "bridge": "bridge overpass",
            "ship": "ship boat",
            "vehicle": "car vehicle",
            "greenhouse": "greenhouse",
            "industrial": "factory industrial",
            "residential": "houses residential",
            "commercial": "commercial mall",
            "harbor": "harbor port",
            "runway": "runway airport",
        },
        "palette": [
            [0, 0, 0], [255, 60, 60], [128, 128, 128], [0, 100, 255],
            [100, 200, 255], [0, 100, 0], [50, 150, 50], [144, 238, 144],
            [255, 215, 0], [200, 200, 0], [139, 90, 43], [255, 228, 181],
            [64, 64, 64], [192, 192, 192], [255, 100, 0], [255, 0, 255],
            [0, 255, 255], [200, 200, 200], [180, 100, 100], [255, 182, 193],
            [255, 140, 0], [100, 149, 237], [105, 105, 105]
        ]
    },
    "general": {
        "name": "通用遥感场景",
        "description": "通用的遥感分类，8类",
        "scene_tag": "general",
        "icon": "🌍",
        "tags": ["通用", "8类", "新手推荐"],
        "source": "RS Dataset Factory (本仓库)",
        "classes": [
            "background", "building", "road", "water", "vegetation",
            "bare_soil", "farmland", "other"
        ],
        "prompts": {
            "building": "building roof structure",
            "road": "road street highway",
            "water": "water river lake pond",
            "vegetation": "trees forest vegetation",
            "bare_soil": "bare soil ground",
            "farmland": "farmland agricultural field",
            "other": "other objects",
        },
        "palette": [
            [0, 0, 0], [255, 0, 0], [128, 128, 128], [0, 0, 255],
            [0, 128, 0], [139, 90, 43], [255, 215, 0], [128, 0, 128]
        ]
    },

    # ================================================================
    # 单类专用模板（适合做单一目标的训练数据）
    # ================================================================
    "whu_building": {
        "name": "WHU 建筑物（单类）",
        "description": "Wuhan U. WHU Aerial 1 类基准 — 仅提取建筑物屋顶，适合 building footprint 任务",
        "scene_tag": "single",
        "icon": "🏢",
        "tags": ["单类", "建筑物", "学术基准", "WHU"],
        "source": "WHU Building Dataset (Ji et al., TGRS 2018)",
        "classes": ["background", "building"],
        "prompts": {
            "building": "building rooftop, residential house, apartment, commercial structure, warehouse",
        },
        "palette": [[0, 0, 0], [255, 60, 60]],
    },
    "deepglobe_road": {
        "name": "DeepGlobe 道路（单类）",
        "description": "DeepGlobe Road Extraction 1 类基准 — 仅提取公路/街道",
        "scene_tag": "single",
        "icon": "🛣️",
        "tags": ["单类", "道路", "学术基准", "DeepGlobe"],
        "source": "DeepGlobe Road Extraction Challenge (Demir et al., CVPR 2018)",
        "classes": ["background", "road"],
        "prompts": {
            "road": "road highway, asphalt street, paved lane, dirt road, urban expressway, intersection",
        },
        "palette": [[0, 0, 0], [128, 128, 128]],
    },
    "sen1floods11_water": {
        "name": "Sen1Floods11 水体（单类）",
        "description": "Sen1Floods11 1 类基准 — 仅提取水体（河流/湖泊/洪涝）",
        "scene_tag": "single",
        "icon": "💧",
        "tags": ["单类", "水体", "学术基准", "Sen1Floods11"],
        "source": "Sen1Floods11 (Bonafilia et al., CVPRW 2020)",
        "classes": ["background", "water"],
        "prompts": {
            "water": "water body, river, lake, pond, reservoir, flooded area",
        },
        "palette": [[0, 0, 0], [0, 100, 255]],
    },
    "vegetation_only": {
        "name": "植被覆盖（单类）",
        "description": "提取森林/草地/灌木等植被像素，适合生态/碳储量分析",
        "scene_tag": "single",
        "icon": "🌳",
        "tags": ["单类", "植被", "生态", "碳监测"],
        "source": "GlobeLand30 / LoveDA prompt design",
        "classes": ["background", "vegetation"],
        "prompts": {
            "vegetation": "vegetation, forest tree canopy, grassland, shrubs, park lawn, woodland",
        },
        "palette": [[0, 0, 0], [50, 168, 82]],
    },
    "farmland_only": {
        "name": "农田/耕地（单类）",
        "description": "提取耕地/水稻田/麦田/裸土，适合农业监测与作物估产",
        "scene_tag": "single",
        "icon": "🌾",
        "tags": ["单类", "农田", "农业", "作物"],
        "source": "LoveDA-Agriculture prompt design",
        "classes": ["background", "farmland"],
        "prompts": {
            "farmland": "cropland, farmland, rice paddy field, wheat field, agricultural plot, plowed soil",
        },
        "palette": [[0, 0, 0], [255, 215, 0]],
    },

    # ================================================================
    # 学术基准模板（与公开数据集类别完全对齐）
    # ================================================================
    "loveda_urban": {
        "name": "LoveDA 城市基准",
        "description": "LoveDA Urban 7 类 — 武汉/南京/常州城市高分辨率（0.3m）",
        "scene_tag": "academic",
        "icon": "🏛️",
        "tags": ["学术基准", "城市", "7类", "LoveDA"],
        "source": "LoveDA (Wang et al., NeurIPS 2021)",
        "classes": [
            "background", "building", "road", "water",
            "barren", "forest", "agriculture",
        ],
        "prompts": {
            "building": "building roof, residential, commercial",
            "road": "road street highway",
            "water": "river lake pond water",
            "barren": "bare soil, exposed ground, barren land",
            "forest": "forest tree canopy woodland",
            "agriculture": "agriculture cropland farmland",
        },
        "palette": [
            [0, 0, 0], [255, 60, 60], [128, 128, 128], [0, 100, 255],
            [139, 90, 43], [0, 100, 0], [255, 215, 0],
        ],
    },
    "loveda_rural": {
        "name": "LoveDA 乡村基准",
        "description": "LoveDA Rural 7 类 — 江汉平原乡村高分辨率（0.3m）",
        "scene_tag": "academic",
        "icon": "🏞️",
        "tags": ["学术基准", "农村", "7类", "LoveDA"],
        "source": "LoveDA (Wang et al., NeurIPS 2021)",
        "classes": [
            "background", "building", "road", "water",
            "barren", "forest", "agriculture",
        ],
        "prompts": {
            "building": "village house, rural building, scattered houses",
            "road": "rural road, dirt road, country lane",
            "water": "pond river irrigation channel",
            "barren": "bare soil, exposed ground",
            "forest": "forest woodland tree",
            "agriculture": "rice paddy, wheat field, cropland",
        },
        "palette": [
            [0, 0, 0], [255, 100, 100], [180, 180, 180], [0, 100, 255],
            [139, 90, 43], [0, 120, 0], [220, 200, 60],
        ],
    },
    "deepglobe_landcover": {
        "name": "DeepGlobe 土地覆盖（7类）",
        "description": "DeepGlobe Land Cover 2018 — urban/agriculture/rangeland/forest/water/barren",
        "scene_tag": "academic",
        "icon": "🗺️",
        "tags": ["学术基准", "土地覆盖", "7类", "DeepGlobe"],
        "source": "DeepGlobe Land Cover Classification (Demir et al., CVPR 2018)",
        "classes": [
            "background", "urban", "agriculture", "rangeland",
            "forest", "water", "barren",
        ],
        "prompts": {
            "urban": "urban built-up area, building, road, residential",
            "agriculture": "agriculture cropland farmland",
            "rangeland": "rangeland grassland pasture",
            "forest": "forest tree canopy woodland",
            "water": "river lake pond water",
            "barren": "barren bare soil sand exposed land",
        },
        "palette": [
            [0, 0, 0], [255, 60, 60], [255, 215, 0], [144, 238, 144],
            [0, 100, 0], [0, 100, 255], [139, 90, 43],
        ],
    },
    "isaid_objects": {
        "name": "iSAID 遥感目标（15类）",
        "description": "iSAID DOTA-derived 实例分割 15 类 — 飞机/船只/车辆/桥梁等",
        "scene_tag": "academic",
        "icon": "✈️",
        "tags": ["学术基准", "目标", "15类", "iSAID", "实例"],
        "source": "iSAID (Waqas Zamir et al., CVPRW 2019) / DOTA",
        "classes": [
            "background", "ship", "storage_tank", "baseball_diamond", "tennis_court",
            "basketball_court", "ground_track_field", "bridge", "large_vehicle", "small_vehicle",
            "helicopter", "swimming_pool", "roundabout", "soccer_ball_field", "plane", "harbor",
        ],
        "prompts": {
            "ship": "ship boat vessel",
            "storage_tank": "storage tank cylindrical",
            "baseball_diamond": "baseball diamond field",
            "tennis_court": "tennis court",
            "basketball_court": "basketball court",
            "ground_track_field": "running track field",
            "bridge": "bridge overpass",
            "large_vehicle": "truck large vehicle bus",
            "small_vehicle": "car small vehicle sedan",
            "helicopter": "helicopter rotor aircraft",
            "swimming_pool": "swimming pool",
            "roundabout": "roundabout traffic circle",
            "soccer_ball_field": "soccer football field",
            "plane": "airplane aircraft jet",
            "harbor": "harbor port dock",
        },
        "palette": [
            [0, 0, 0], [255, 0, 255], [255, 165, 0], [124, 252, 0], [255, 20, 147],
            [255, 105, 180], [240, 128, 128], [255, 140, 0], [200, 100, 50], [0, 255, 255],
            [255, 215, 0], [0, 191, 255], [255, 99, 71], [50, 205, 50], [220, 20, 60], [70, 130, 180],
        ],
    },
    "isprs_potsdam": {
        "name": "ISPRS Potsdam (6类)",
        "description": "ISPRS Potsdam / Vaihingen 6 类 — 国际遥感基准（航拍语义分割）",
        "scene_tag": "academic",
        "icon": "📐",
        "tags": ["学术基准", "城市", "6类", "ISPRS"],
        "source": "ISPRS 2D Semantic Labeling Contest (Potsdam / Vaihingen)",
        "classes": [
            "background", "impervious_surface", "building", "low_vegetation",
            "tree", "car", "clutter",
        ],
        "prompts": {
            "impervious_surface": "impervious surface, paved road, asphalt, concrete",
            "building": "building roof",
            "low_vegetation": "grass, low shrubs, lawn",
            "tree": "tree canopy, individual tree",
            "car": "car vehicle parked",
            "clutter": "clutter background other",
        },
        "palette": [
            [0, 0, 0], [255, 255, 255], [0, 0, 255], [0, 255, 255],
            [0, 255, 0], [255, 255, 0], [255, 0, 0],
        ],
    },
    "openearthmap": {
        "name": "OpenEarthMap (8类)",
        "description": "OpenEarthMap 全球 8 类高分辨率土地覆盖（裸地/农田/草地/植被/水/道路/建筑/旷地）",
        "scene_tag": "academic",
        "icon": "🌐",
        "tags": ["学术基准", "全球", "8类", "OpenEarthMap"],
        "source": "OpenEarthMap (Xia et al., WACV 2023)",
        "classes": [
            "background", "bareland", "rangeland", "developed_space", "road",
            "tree", "water", "agriculture_land", "building",
        ],
        "prompts": {
            "bareland": "bare soil, exposed ground, barren",
            "rangeland": "rangeland, grassland, low shrubs",
            "developed_space": "developed open space, urban park, plaza",
            "road": "road street highway",
            "tree": "tree forest woodland",
            "water": "river lake pond water",
            "agriculture_land": "agriculture cropland farmland",
            "building": "building roof house",
        },
        "palette": [
            [0, 0, 0], [128, 0, 0], [0, 255, 36], [148, 148, 148], [255, 255, 255],
            [34, 97, 38], [0, 69, 255], [75, 181, 73], [222, 31, 7],
        ],
    },
}
