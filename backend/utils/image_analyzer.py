"""
RS Dataset Factory - 图像智能分析模块
根据上传图像的尺寸、像素量等自动计算合理的处理参数
"""
from typing import Dict, Any, Tuple, Optional
from dataclasses import dataclass
from enum import Enum


class ImageScaleType(Enum):
    """图像规模类型"""
    TINY = "tiny"           # 极小图像 (< 256px)
    SMALL = "small"         # 小图像，单张标注 (256-1024px)
    MEDIUM = "medium"       # 中等图像，少量切片 (1024-4096px)
    LARGE = "large"         # 大图像，标准切片 (4096-10000px)
    HUGE = "huge"           # 超大图像，大量切片 (> 10000px)


class ProcessingMode(Enum):
    """处理模式"""
    SINGLE_LABEL = "single_label"       # 单张标注模式
    FEW_CROPS = "few_crops"             # 少量切片模式
    STANDARD_CROPS = "standard_crops"   # 标准切片模式
    LARGE_SCALE = "large_scale"         # 大规模切片模式


@dataclass
class ImageAnalysis:
    """图像分析结果"""
    width: int
    height: int
    bands: int
    file_size: int
    
    # 计算属性
    total_pixels: int
    megapixels: float
    aspect_ratio: float
    scale_type: ImageScaleType
    processing_mode: ProcessingMode
    
    # 推荐参数
    recommended_crop_size: int
    recommended_stride: int
    estimated_crops: int
    estimated_train_samples: int
    estimated_val_samples: int
    estimated_test_samples: int
    
    # 提示信息
    analysis_summary: str
    recommendations: list
    warnings: list


def analyze_image(
    width: int, 
    height: int, 
    bands: int = 3, 
    file_size: int = 0
) -> ImageAnalysis:
    """
    分析图像并给出智能推荐
    
    Args:
        width: 图像宽度
        height: 图像高度
        bands: 波段数
        file_size: 文件大小（字节）
    
    Returns:
        ImageAnalysis: 完整的分析结果
    """
    total_pixels = width * height
    megapixels = total_pixels / 1_000_000
    min_dim = min(width, height)
    max_dim = max(width, height)
    aspect_ratio = max_dim / min_dim if min_dim > 0 else 1.0
    
    # 确定图像规模类型
    scale_type = _determine_scale_type(min_dim, max_dim)
    
    # 确定处理模式
    processing_mode = _determine_processing_mode(scale_type, min_dim, max_dim)
    
    # 计算推荐参数
    crop_size, stride = _calculate_crop_params(scale_type, min_dim, max_dim)
    
    # 估算切片数量
    if processing_mode == ProcessingMode.SINGLE_LABEL:
        estimated_crops = 1
    else:
        crops_x = max(1, (width - crop_size) // stride + 1)
        crops_y = max(1, (height - crop_size) // stride + 1)
        # 考虑有效性过滤，实际数量约为理论数量的60-80%
        estimated_crops = int(crops_x * crops_y * 0.7)
    
    # 估算数据集划分
    train_ratio, val_ratio, test_ratio = 0.7, 0.15, 0.15
    estimated_train = int(estimated_crops * train_ratio)
    estimated_val = int(estimated_crops * val_ratio)
    estimated_test = estimated_crops - estimated_train - estimated_val
    
    # 生成分析摘要
    summary = _generate_summary(
        width, height, megapixels, scale_type, processing_mode, 
        estimated_crops, crop_size
    )
    
    # 生成建议
    recommendations = _generate_recommendations(
        scale_type, processing_mode, crop_size, stride, 
        width, height, bands
    )
    
    # 生成警告
    warnings = _generate_warnings(
        scale_type, processing_mode, aspect_ratio, 
        width, height, file_size, bands
    )
    
    return ImageAnalysis(
        width=width,
        height=height,
        bands=bands,
        file_size=file_size,
        total_pixels=total_pixels,
        megapixels=round(megapixels, 2),
        aspect_ratio=round(aspect_ratio, 2),
        scale_type=scale_type,
        processing_mode=processing_mode,
        recommended_crop_size=crop_size,
        recommended_stride=stride,
        estimated_crops=estimated_crops,
        estimated_train_samples=estimated_train,
        estimated_val_samples=estimated_val,
        estimated_test_samples=estimated_test,
        analysis_summary=summary,
        recommendations=recommendations,
        warnings=warnings,
    )


def _determine_scale_type(min_dim: int, max_dim: int) -> ImageScaleType:
    """根据尺寸确定图像规模类型"""
    if max_dim < 256:
        return ImageScaleType.TINY
    elif max_dim < 1024:
        return ImageScaleType.SMALL
    elif max_dim < 4096:
        return ImageScaleType.MEDIUM
    elif max_dim < 10000:
        return ImageScaleType.LARGE
    else:
        return ImageScaleType.HUGE


def _determine_processing_mode(
    scale_type: ImageScaleType, 
    min_dim: int, 
    max_dim: int
) -> ProcessingMode:
    """确定处理模式"""
    if scale_type in (ImageScaleType.TINY, ImageScaleType.SMALL):
        return ProcessingMode.SINGLE_LABEL
    elif scale_type == ImageScaleType.MEDIUM:
        # 中等图像，看能切出多少片
        if max_dim < 2048:
            return ProcessingMode.FEW_CROPS
        else:
            return ProcessingMode.STANDARD_CROPS
    elif scale_type == ImageScaleType.LARGE:
        return ProcessingMode.STANDARD_CROPS
    else:
        return ProcessingMode.LARGE_SCALE


def _calculate_crop_params(
    scale_type: ImageScaleType, 
    min_dim: int, 
    max_dim: int
) -> Tuple[int, int]:
    """计算推荐的裁剪参数"""
    
    if scale_type == ImageScaleType.TINY:
        # 极小图像，不裁剪，直接resize到256
        return 256, 256
    
    elif scale_type == ImageScaleType.SMALL:
        # 小图像，单张处理，不裁剪
        # 返回接近原始尺寸的2的幂次
        target = min(max_dim, 512)
        return target, target
    
    elif scale_type == ImageScaleType.MEDIUM:
        # 中等图像
        if max_dim < 2048:
            # 1024-2048: 使用 512 crop，384 stride
            return 512, 384
        else:
            # 2048-4096: 使用 512 crop，384 stride
            return 512, 384
    
    elif scale_type == ImageScaleType.LARGE:
        # 大图像: 使用 512 crop，384 stride (25% overlap)
        return 512, 384
    
    else:  # HUGE
        # 超大图像: 使用 512 crop，384 stride
        # 可以考虑更大的 crop 减少总数
        return 512, 384


def _generate_summary(
    width: int, 
    height: int, 
    megapixels: float,
    scale_type: ImageScaleType,
    processing_mode: ProcessingMode,
    estimated_crops: int,
    crop_size: int
) -> str:
    """生成分析摘要"""
    
    scale_names = {
        ImageScaleType.TINY: "极小",
        ImageScaleType.SMALL: "小型",
        ImageScaleType.MEDIUM: "中等",
        ImageScaleType.LARGE: "大型",
        ImageScaleType.HUGE: "超大",
    }
    
    mode_names = {
        ProcessingMode.SINGLE_LABEL: "单张标注",
        ProcessingMode.FEW_CROPS: "少量切片",
        ProcessingMode.STANDARD_CROPS: "标准切片",
        ProcessingMode.LARGE_SCALE: "大规模处理",
    }
    
    summary = f"图像尺寸 {width} × {height} 像素 ({megapixels:.2f} 百万像素)，"
    summary += f"属于{scale_names[scale_type]}图像。"
    
    if processing_mode == ProcessingMode.SINGLE_LABEL:
        summary += f"建议使用{mode_names[processing_mode]}模式，直接对整张图像进行语义分割标注。"
    else:
        summary += f"建议使用{mode_names[processing_mode]}模式，"
        summary += f"按 {crop_size}×{crop_size} 进行切片，预计生成约 {estimated_crops} 个有效样本。"
    
    return summary


def _generate_recommendations(
    scale_type: ImageScaleType,
    processing_mode: ProcessingMode,
    crop_size: int,
    stride: int,
    width: int,
    height: int,
    bands: int
) -> list:
    """生成推荐建议"""
    recommendations = []
    
    if processing_mode == ProcessingMode.SINGLE_LABEL:
        recommendations.append({
            "type": "info",
            "title": "单张标注模式",
            "content": "图像尺寸较小，将直接对整张图像进行语义分割，输出单张标注结果。"
        })
        recommendations.append({
            "type": "tip",
            "title": "适用场景",
            "content": "适合小区域精细标注、样本展示、或作为大数据集中的单个样本。"
        })
    
    elif processing_mode == ProcessingMode.FEW_CROPS:
        recommendations.append({
            "type": "info",
            "title": "少量切片模式",
            "content": f"图像将被切分为少量 {crop_size}×{crop_size} 的小块进行处理。"
        })
        recommendations.append({
            "type": "tip",
            "title": "参数建议",
            "content": "可适当增大步长(stride)以减少重叠，或增大裁剪尺寸以减少切片数量。"
        })
    
    elif processing_mode == ProcessingMode.STANDARD_CROPS:
        overlap = round((1 - stride / crop_size) * 100)
        recommendations.append({
            "type": "info", 
            "title": "标准切片模式",
            "content": f"使用 {crop_size}×{crop_size} 切片，{stride} 步长 ({overlap}% 重叠)。"
        })
        recommendations.append({
            "type": "tip",
            "title": "质量控制",
            "content": "系统会自动过滤无效切片(黑边、低信息量)，确保数据集质量。"
        })
    
    else:  # LARGE_SCALE
        recommendations.append({
            "type": "warning",
            "title": "大规模处理",
            "content": "超大图像处理需要较长时间和大量内存，建议确保系统资源充足。"
        })
        recommendations.append({
            "type": "tip",
            "title": "优化建议",
            "content": "可以增大步长减少切片数量，或先对图像进行降采样预处理。"
        })
    
    # 波段建议
    if bands > 3:
        recommendations.append({
            "type": "info",
            "title": "多波段图像",
            "content": f"检测到 {bands} 个波段，默认使用波段 4、3、2 (近红外假彩色)，可在参数中调整。"
        })
    
    return recommendations


def _generate_warnings(
    scale_type: ImageScaleType,
    processing_mode: ProcessingMode,
    aspect_ratio: float,
    width: int,
    height: int,
    file_size: int,
    bands: int
) -> list:
    """生成警告信息"""
    warnings = []
    
    # 极小图像警告
    if scale_type == ImageScaleType.TINY:
        warnings.append({
            "type": "warning",
            "title": "图像过小",
            "content": f"图像尺寸 {width}×{height} 过小，可能导致标注精度下降。建议使用更高分辨率的图像。"
        })
    
    # 长宽比异常
    if aspect_ratio > 4:
        warnings.append({
            "type": "warning",
            "title": "长宽比异常",
            "content": f"图像长宽比为 {aspect_ratio:.1f}:1，可能是条带图像。切片时可能产生较多边缘无效区域。"
        })
    
    # 大文件警告
    if file_size > 1024 * 1024 * 1024:  # > 1GB
        gb_size = file_size / (1024 * 1024 * 1024)
        warnings.append({
            "type": "warning",
            "title": "大文件提醒",
            "content": f"文件大小 {gb_size:.2f} GB，处理时间可能较长，请耐心等待。"
        })
    
    # 超大图像内存警告
    if scale_type == ImageScaleType.HUGE:
        warnings.append({
            "type": "error",
            "title": "内存需求高",
            "content": "超大图像处理可能需要 16GB+ 内存，请确保系统资源充足。"
        })
    
    # 单张模式样本数警告
    if processing_mode == ProcessingMode.SINGLE_LABEL:
        warnings.append({
            "type": "info",
            "title": "单样本输出",
            "content": "当前设置将输出单张标注图像，不会进行数据集切分。如需生成训练数据集，请上传更大的遥感图像。"
        })
    
    return warnings


def get_smart_params(analysis: ImageAnalysis) -> Dict[str, Any]:
    """
    根据分析结果生成智能参数配置
    """
    params = {
        "crop_size": analysis.recommended_crop_size,
        "stride": analysis.recommended_stride,
        "max_size": 15000,
        "confidence_threshold": 0.1,
        "train_ratio": 0.7,
        "val_ratio": 0.15,
        "min_valid_ratio": 0.3,
        "min_class_diversity": 1,
        "rgb_bands": [4, 3, 2] if analysis.bands > 3 else [1, 2, 3],
    }
    
    # 单张标注模式的特殊处理
    if analysis.processing_mode == ProcessingMode.SINGLE_LABEL:
        params["is_single_label"] = True
        params["train_ratio"] = 1.0  # 单张不切分
        params["val_ratio"] = 0.0
        params["min_valid_ratio"] = 0.0  # 不做有效性过滤
    
    return params


def analysis_to_dict(analysis: ImageAnalysis) -> Dict[str, Any]:
    """将分析结果转换为字典"""
    return {
        "width": analysis.width,
        "height": analysis.height,
        "bands": analysis.bands,
        "file_size": analysis.file_size,
        "total_pixels": analysis.total_pixels,
        "megapixels": analysis.megapixels,
        "aspect_ratio": analysis.aspect_ratio,
        "scale_type": analysis.scale_type.value,
        "processing_mode": analysis.processing_mode.value,
        "recommended_crop_size": analysis.recommended_crop_size,
        "recommended_stride": analysis.recommended_stride,
        "estimated_crops": analysis.estimated_crops,
        "estimated_train_samples": analysis.estimated_train_samples,
        "estimated_val_samples": analysis.estimated_val_samples,
        "estimated_test_samples": analysis.estimated_test_samples,
        "analysis_summary": analysis.analysis_summary,
        "recommendations": analysis.recommendations,
        "warnings": analysis.warnings,
        "smart_params": get_smart_params(analysis),
    }
