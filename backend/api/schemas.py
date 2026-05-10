"""
RS Dataset Factory - Pydantic 數據模型
"""
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field
from enum import Enum


class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ClassConfig(BaseModel):
    """單個類別配置"""
    name: str = Field(..., description="類別名稱")
    prompt: str = Field(..., description="SAM3 提示詞")
    color: List[int] = Field(..., min_length=3, max_length=3, description="RGB 顏色")


class ProcessingParams(BaseModel):
    """處理參數"""
    max_size: int = Field(default=15000, ge=2000, le=30000, description="最大處理尺寸")
    crop_size: int = Field(default=512, ge=256, le=1024, description="裁剪塊大小")
    stride: int = Field(default=384, ge=128, le=512, description="滑動步長")
    confidence_threshold: float = Field(default=0.1, ge=0.05, le=0.5, description="置信度閾值")
    train_ratio: float = Field(default=0.7, ge=0.5, le=0.9, description="訓練集比例")
    val_ratio: float = Field(default=0.15, ge=0.05, le=0.3, description="驗證集比例")
    min_valid_ratio: float = Field(default=0.3, ge=0.1, le=0.5, description="最小有效像素比")
    min_class_diversity: int = Field(default=1, ge=1, le=5, description="最小類別數")
    rgb_bands: List[int] = Field(default=[4, 3, 2], min_length=3, max_length=3, description="RGB 波段")


class DatasetConfig(BaseModel):
    """數據集配置"""
    name: str = Field(..., description="數據集名稱")
    classes: List[ClassConfig] = Field(..., description="類別列表")
    params: ProcessingParams = Field(default_factory=ProcessingParams, description="處理參數")


class UploadResponse(BaseModel):
    """上傳響應"""
    task_id: str
    file_id: Optional[str] = None
    filename: str
    file_size: int
    width: int
    height: int
    bands: int
    preview_url: str
    metadata: Dict[str, Any]


class TaskCreateRequest(BaseModel):
    """創建任務請求"""
    file_id: str = Field(..., description="上傳文件 ID")
    config: DatasetConfig = Field(..., description="數據集配置")


class TaskResponse(BaseModel):
    """任務響應"""
    task_id: str
    status: TaskStatus
    progress: float = Field(default=0.0, ge=0.0, le=100.0)
    current_step: str = ""
    message: str = ""
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class TaskProgressUpdate(BaseModel):
    """任務進度更新 (WebSocket)"""
    task_id: str
    status: TaskStatus
    progress: float
    current_step: str
    current_crop: int = 0
    total_crops: int = 0
    elapsed_time: float = 0.0
    estimated_remaining: float = 0.0
    log_message: str = ""


class PresetListResponse(BaseModel):
    """預設列表響應"""
    presets: Dict[str, Dict[str, Any]]


class DatasetResult(BaseModel):
    """數據集生成結果"""
    task_id: str
    dataset_name: str
    output_dir: str
    train_samples: int
    val_samples: int
    test_samples: int
    total_samples: int
    num_classes: int
    class_distribution: Dict[str, Dict[str, Any]]
    visualizations: List[str]
    download_url: str
    processing_time: float


class ImageMetadata(BaseModel):
    """圖像元數據"""
    width: int
    height: int
    bands: int
    dtype: str
    crs: Optional[str] = None
    transform: Optional[List[float]] = None
    bounds: Optional[Dict[str, float]] = None
    file_size: int
    filename: str
