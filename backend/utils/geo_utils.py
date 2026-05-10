"""
RS Dataset Factory - 遥感图像处理工具
支持格式: GeoTIFF, PNG, JPG, HDF, NetCDF 等
"""
import os
import numpy as np
from PIL import Image
from typing import Tuple, Dict, Any, Optional, Union
import rasterio
from rasterio.enums import Resampling

Image.MAX_IMAGE_PIXELS = None  # 允许超大遙感影像

# 可选依赖项
try:
    import h5py
    HAS_H5PY = True
except ImportError:
    HAS_H5PY = False

try:
    import netCDF4
    HAS_NETCDF4 = True
except ImportError:
    HAS_NETCDF4 = False


def get_file_format(file_path: str) -> str:
    """
    根据文件扩展名判断文件格式
    
    Args:
        file_path: 文件路径
        
    Returns:
        格式类型: 'geotiff', 'png', 'jpg', 'hdf', 'netcdf', 'img', 'unknown'
    """
    ext = os.path.splitext(file_path.lower())[1]
    
    if ext in ['.tif', '.tiff']:
        return 'geotiff'
    elif ext == '.png':
        return 'png'
    elif ext in ['.jpg', '.jpeg']:
        return 'jpg'
    elif ext in ['.hdf', '.hdf4', '.hdf5', '.h5']:
        return 'hdf'
    elif ext in ['.nc', '.nc4']:
        return 'netcdf'
    elif ext == '.img':
        return 'img'
    else:
        return 'unknown'


def load_image_with_pil(
    image_path: str,
    max_size: int = 15000
) -> Tuple[np.ndarray, float, np.ndarray, Tuple[int, int], Dict[str, Any]]:
    """
    使用 PIL 读取 PNG/JPG 等常规图像格式
    
    Args:
        image_path: 图像路径
        max_size: 最大处理尺寸
        
    Returns:
        img_np: RGB 图像数组 (H, W, 3)
        scale: 缩放因子
        invalid_mask: 无效区域掩膜
        (new_w, new_h): 处理后尺寸
        metadata: 元数据字典
    """
    img = Image.open(image_path)
    full_w, full_h = img.size
    
    metadata = {
        "width": full_w,
        "height": full_h,
        "bands": len(img.getbands()),
        "dtype": str(img.mode),
        "crs": None,
        "transform": None,
        "bounds": None,
        "file_size": os.path.getsize(image_path),
        "filename": os.path.basename(image_path),
        "format": img.format,
    }
    
    scale = min(max_size / full_w, max_size / full_h, 1.0)
    new_w = int(full_w * scale)
    new_h = int(full_h * scale)
    
    if scale < 1.0:
        img = img.resize((new_w, new_h), Image.Resampling.BILINEAR)
    
    # 转换为 RGB
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    img_np = np.array(img)
    
    # 计算无效区域掩膜
    white_mask = np.all(img_np > 250, axis=2)
    black_mask = np.all(img_np < 5, axis=2)
    invalid_mask = white_mask | black_mask
    
    return img_np, scale, invalid_mask, (new_w, new_h), metadata


def load_hdf_image(
    image_path: str,
    max_size: int = 15000,
    dataset_name: Optional[str] = None
) -> Tuple[np.ndarray, float, np.ndarray, Tuple[int, int], Dict[str, Any]]:
    """
    读取 HDF4/HDF5 格式图像
    
    Args:
        image_path: 图像路径
        max_size: 最大处理尺寸
        dataset_name: 数据集名称（可选，自动检测）
        
    Returns:
        img_np: RGB 图像数组 (H, W, 3)
        scale: 缩放因子
        invalid_mask: 无效区域掩膜
        (new_w, new_h): 处理后尺寸
        metadata: 元数据字典
    """
    if not HAS_H5PY:
        raise ImportError("需要安装 h5py 库来读取 HDF 文件: pip install h5py")
    
    with h5py.File(image_path, 'r') as f:
        # 自动查找图像数据集
        if dataset_name is None:
            dataset_name = _find_image_dataset(f)
        
        if dataset_name is None:
            raise ValueError("无法在 HDF 文件中找到图像数据集")
        
        data = f[dataset_name][:]
        
        # 处理数据形状
        if len(data.shape) == 2:
            # 单波段，复制为 3 通道
            img_np = np.stack([data] * 3, axis=-1)
        elif len(data.shape) == 3:
            if data.shape[0] <= 4:
                # (C, H, W) 格式
                data = np.transpose(data, (1, 2, 0))
            img_np = data[:, :, :3] if data.shape[2] >= 3 else np.stack([data[:, :, 0]] * 3, axis=-1)
        else:
            raise ValueError(f"不支持的数据形状: {data.shape}")
        
        full_h, full_w = img_np.shape[:2]
        
        metadata = {
            "width": full_w,
            "height": full_h,
            "bands": data.shape[-1] if len(data.shape) == 3 else 1,
            "dtype": str(data.dtype),
            "crs": None,
            "transform": None,
            "bounds": None,
            "file_size": os.path.getsize(image_path),
            "filename": os.path.basename(image_path),
            "format": "HDF5",
            "dataset_name": dataset_name,
        }
    
    # 归一化到 0-255
    img_np = _normalize_to_uint8(img_np)
    
    # 缩放
    scale = min(max_size / full_w, max_size / full_h, 1.0)
    new_w = int(full_w * scale)
    new_h = int(full_h * scale)
    
    if scale < 1.0:
        img_pil = Image.fromarray(img_np)
        img_pil = img_pil.resize((new_w, new_h), Image.Resampling.BILINEAR)
        img_np = np.array(img_pil)
    
    white_mask = np.all(img_np > 250, axis=2)
    black_mask = np.all(img_np < 5, axis=2)
    invalid_mask = white_mask | black_mask
    
    return img_np, scale, invalid_mask, (new_w, new_h), metadata


def load_netcdf_image(
    image_path: str,
    max_size: int = 15000,
    variable_name: Optional[str] = None
) -> Tuple[np.ndarray, float, np.ndarray, Tuple[int, int], Dict[str, Any]]:
    """
    读取 NetCDF 格式图像
    
    Args:
        image_path: 图像路径
        max_size: 最大处理尺寸
        variable_name: 变量名称（可选，自动检测）
        
    Returns:
        img_np: RGB 图像数组 (H, W, 3)
        scale: 缩放因子
        invalid_mask: 无效区域掩膜
        (new_w, new_h): 处理后尺寸
        metadata: 元数据字典
    """
    if not HAS_NETCDF4:
        raise ImportError("需要安装 netCDF4 库来读取 NC 文件: pip install netCDF4")
    
    with netCDF4.Dataset(image_path, 'r') as ds:
        # 自动查找图像变量
        if variable_name is None:
            variable_name = _find_netcdf_variable(ds)
        
        if variable_name is None:
            raise ValueError("无法在 NetCDF 文件中找到图像变量")
        
        data = ds.variables[variable_name][:]
        
        # 处理掩膜数组
        if hasattr(data, 'data'):
            data = data.data
        
        # 处理数据形状
        if len(data.shape) == 2:
            img_np = np.stack([data] * 3, axis=-1)
        elif len(data.shape) == 3:
            if data.shape[0] <= 4:
                data = np.transpose(data, (1, 2, 0))
            img_np = data[:, :, :3] if data.shape[2] >= 3 else np.stack([data[:, :, 0]] * 3, axis=-1)
        elif len(data.shape) == 4:
            # (T, C, H, W) 或 (T, H, W, C)，取第一个时间步
            data = data[0]
            if data.shape[0] <= 4:
                data = np.transpose(data, (1, 2, 0))
            img_np = data[:, :, :3] if data.shape[2] >= 3 else np.stack([data[:, :, 0]] * 3, axis=-1)
        else:
            raise ValueError(f"不支持的数据形状: {data.shape}")
        
        full_h, full_w = img_np.shape[:2]
        
        metadata = {
            "width": full_w,
            "height": full_h,
            "bands": data.shape[-1] if len(data.shape) >= 3 else 1,
            "dtype": str(data.dtype),
            "crs": getattr(ds, 'crs', None) or getattr(ds, 'spatial_ref', None),
            "transform": None,
            "bounds": None,
            "file_size": os.path.getsize(image_path),
            "filename": os.path.basename(image_path),
            "format": "NetCDF",
            "variable_name": variable_name,
        }
    
    img_np = _normalize_to_uint8(img_np)
    
    scale = min(max_size / full_w, max_size / full_h, 1.0)
    new_w = int(full_w * scale)
    new_h = int(full_h * scale)
    
    if scale < 1.0:
        img_pil = Image.fromarray(img_np)
        img_pil = img_pil.resize((new_w, new_h), Image.Resampling.BILINEAR)
        img_np = np.array(img_pil)
    
    white_mask = np.all(img_np > 250, axis=2)
    black_mask = np.all(img_np < 5, axis=2)
    invalid_mask = white_mask | black_mask
    
    return img_np, scale, invalid_mask, (new_w, new_h), metadata


def _find_image_dataset(hdf_file) -> Optional[str]:
    """在 HDF 文件中查找图像数据集"""
    candidates = []
    
    def visitor(name, obj):
        if isinstance(obj, h5py.Dataset):
            if len(obj.shape) >= 2:
                candidates.append((name, obj.shape))
    
    hdf_file.visititems(visitor)
    
    # 优先选择较大的 2D 或 3D 数据集
    if candidates:
        candidates.sort(key=lambda x: np.prod(x[1]), reverse=True)
        return candidates[0][0]
    
    return None


def _find_netcdf_variable(nc_dataset) -> Optional[str]:
    """在 NetCDF 文件中查找图像变量"""
    candidates = []
    
    for name, var in nc_dataset.variables.items():
        if len(var.shape) >= 2:
            candidates.append((name, var.shape))
    
    # 排除坐标变量，优先选择较大的数据集
    coord_names = {'lat', 'lon', 'latitude', 'longitude', 'x', 'y', 'time'}
    candidates = [(n, s) for n, s in candidates if n.lower() not in coord_names]
    
    if candidates:
        candidates.sort(key=lambda x: np.prod(x[1]), reverse=True)
        return candidates[0][0]
    
    return None


def _normalize_to_uint8(data: np.ndarray) -> np.ndarray:
    """将数据归一化到 0-255 uint8 范围"""
    if data.dtype == np.uint8:
        return data
    
    # 处理 NaN 和 Inf
    data = np.nan_to_num(data, nan=0, posinf=255, neginf=0)
    
    # 逐波段进行百分位拉伸
    result = np.zeros_like(data, dtype=np.uint8)
    for i in range(data.shape[2]):
        band = data[:, :, i].astype(np.float32)
        p2, p98 = np.percentile(band[band != 0], [2, 98]) if np.any(band != 0) else (0, 1)
        if p98 - p2 > 0:
            stretched = np.clip((band - p2) / (p98 - p2) * 255, 0, 255)
        else:
            stretched = np.zeros_like(band)
        result[:, :, i] = stretched.astype(np.uint8)
    
    return result


def load_large_image_with_rasterio(
    image_path: str, 
    max_size: int = 15000
) -> Tuple[np.ndarray, float, np.ndarray, Tuple[int, int], Dict[str, Any]]:
    """
    使用 rasterio 高效读取超大 GeoTIFF 图像
    
    Args:
        image_path: 图像路径
        max_size: 最大处理尺寸
        
    Returns:
        img_np: RGB 图像数组 (H, W, 3)
        scale: 缩放因子
        invalid_mask: 无效区域掩膜
        (new_w, new_h): 处理后尺寸
        metadata: 元数据字典
    """
    with rasterio.open(image_path) as src:
        full_w, full_h = src.width, src.height
        
        metadata = {
            "width": full_w,
            "height": full_h,
            "bands": src.count,
            "dtype": str(src.dtypes[0]),
            "crs": str(src.crs) if src.crs else None,
            "transform": list(src.transform) if src.transform else None,
            "bounds": dict(zip(["left", "bottom", "right", "top"], src.bounds)) if src.bounds else None,
            "file_size": os.path.getsize(image_path),
            "filename": os.path.basename(image_path),
        }
        
        scale = min(max_size / full_w, max_size / full_h, 1.0)
        new_w = int(full_w * scale)
        new_h = int(full_h * scale)
        
        data = src.read(
            out_shape=(src.count, new_h, new_w),
            resampling=Resampling.bilinear
        )
        
        if data.shape[0] >= 3:
            img_np = np.transpose(data[:3], (1, 2, 0)).astype(np.uint8)
        else:
            img_np = np.transpose(np.stack([data[0]] * 3), (1, 2, 0)).astype(np.uint8)
        
        white_mask = np.all(img_np > 250, axis=2)
        black_mask = np.all(img_np < 5, axis=2)
        invalid_mask = white_mask | black_mask
        
    return img_np, scale, invalid_mask, (new_w, new_h), metadata


def load_image_auto(
    image_path: str,
    max_size: int = 15000
) -> Tuple[np.ndarray, float, np.ndarray, Tuple[int, int], Dict[str, Any]]:
    """
    自动检测格式并加载图像
    
    Args:
        image_path: 图像路径
        max_size: 最大处理尺寸
        
    Returns:
        img_np: RGB 图像数组 (H, W, 3)
        scale: 缩放因子
        invalid_mask: 无效区域掩膜
        (new_w, new_h): 处理后尺寸
        metadata: 元数据字典
    """
    file_format = get_file_format(image_path)
    
    if file_format in ['geotiff', 'img']:
        return load_large_image_with_rasterio(image_path, max_size)
    elif file_format in ['png', 'jpg']:
        return load_image_with_pil(image_path, max_size)
    elif file_format == 'hdf':
        return load_hdf_image(image_path, max_size)
    elif file_format == 'netcdf':
        return load_netcdf_image(image_path, max_size)
    else:
        # 尝试使用 rasterio 打开
        try:
            return load_large_image_with_rasterio(image_path, max_size)
        except Exception:
            # 最后尝试 PIL
            return load_image_with_pil(image_path, max_size)


def create_preview_image(
    image_path: str, 
    max_preview_size: int = 1024,
    rgb_bands: Tuple[int, int, int] = (4, 3, 2)
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    创建预览图像，支持多种格式
    
    Args:
        image_path: 图像路径
        max_preview_size: 预览图最大尺寸
        rgb_bands: RGB 波段索引 (1-based)，仅对 GeoTIFF 有效
        
    Returns:
        preview_rgb: 预览图像数组
        metadata: 元数据字典
    """
    file_format = get_file_format(image_path)
    
    # PNG/JPG 使用 PIL 处理
    if file_format in ['png', 'jpg']:
        return _create_preview_pil(image_path, max_preview_size)
    
    # HDF 格式
    if file_format == 'hdf':
        return _create_preview_hdf(image_path, max_preview_size)
    
    # NetCDF 格式
    if file_format == 'netcdf':
        return _create_preview_netcdf(image_path, max_preview_size)
    
    # GeoTIFF 和 IMG 使用 rasterio
    return _create_preview_rasterio(image_path, max_preview_size, rgb_bands)


def _create_preview_pil(
    image_path: str,
    max_preview_size: int = 1024
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """使用 PIL 创建预览图"""
    img = Image.open(image_path)
    full_w, full_h = img.size
    
    metadata = {
        "width": full_w,
        "height": full_h,
        "bands": len(img.getbands()),
        "dtype": str(img.mode),
        "crs": None,
        "file_size": os.path.getsize(image_path),
        "filename": os.path.basename(image_path),
        "format": img.format,
    }
    
    # 计算缩放
    scale = min(max_preview_size / full_w, max_preview_size / full_h, 1.0)
    preview_w = int(full_w * scale)
    preview_h = int(full_h * scale)
    
    if scale < 1.0:
        img = img.resize((preview_w, preview_h), Image.Resampling.BILINEAR)
    
    # 转换为 RGB
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    return np.array(img), metadata


def _create_preview_hdf(
    image_path: str,
    max_preview_size: int = 1024
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """使用 h5py 创建 HDF 预览图"""
    img_np, scale, _, (new_w, new_h), metadata = load_hdf_image(image_path, max_preview_size)
    return img_np, metadata


def _create_preview_netcdf(
    image_path: str,
    max_preview_size: int = 1024
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """使用 netCDF4 创建 NetCDF 预览图"""
    img_np, scale, _, (new_w, new_h), metadata = load_netcdf_image(image_path, max_preview_size)
    return img_np, metadata


def _create_preview_rasterio(
    image_path: str,
    max_preview_size: int = 1024,
    rgb_bands: Tuple[int, int, int] = (4, 3, 2)
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """使用 rasterio 创建 GeoTIFF/IMG 预览图"""
    with rasterio.open(image_path) as src:
        full_w, full_h = src.width, src.height
        
        metadata = {
            "width": full_w,
            "height": full_h,
            "bands": src.count,
            "dtype": str(src.dtypes[0]),
            "crs": str(src.crs) if src.crs else None,
            "file_size": os.path.getsize(image_path),
            "filename": os.path.basename(image_path),
        }
        
        scale = min(max_preview_size / full_w, max_preview_size / full_h, 1.0)
        preview_w = int(full_w * scale)
        preview_h = int(full_h * scale)
        
        # 确定波段索引
        band_indices = []
        for band in rgb_bands:
            if band <= src.count:
                band_indices.append(band)
            else:
                band_indices.append(1)
        
        data = src.read(
            indexes=band_indices,
            out_shape=(3, preview_h, preview_w),
            resampling=Resampling.bilinear
        )
        
        preview_rgb = np.transpose(data, (1, 2, 0))
        
        # 百分位拉伸归一化
        preview_uint8 = np.zeros_like(preview_rgb, dtype=np.uint8)
        for i in range(3):
            band = preview_rgb[:, :, i].astype(np.float32)
            # 排除零值计算百分位
            valid_pixels = band[band != 0]
            if len(valid_pixels) > 0:
                p2, p98 = np.percentile(valid_pixels, [2, 98])
            else:
                p2, p98 = 0, 1
            stretched = np.clip((band - p2) / (p98 - p2 + 1e-8) * 255, 0, 255)
            preview_uint8[:, :, i] = stretched.astype(np.uint8)
        
    return preview_uint8, metadata


def save_preview_image(preview_array: np.ndarray, output_path: str) -> str:
    """
    保存预览图像为 PNG
    
    Args:
        preview_array: 预览图像数组
        output_path: 输出路径
        
    Returns:
        输出路径
    """
    # 确保数组是 uint8 类型
    if preview_array.dtype != np.uint8:
        preview_array = preview_array.astype(np.uint8)
    
    # 确保是 RGB 格式
    if len(preview_array.shape) == 2:
        preview_array = np.stack([preview_array] * 3, axis=-1)
    
    Image.fromarray(preview_array).save(output_path, "PNG", optimize=True)
    return output_path


def get_image_metadata(image_path: str) -> Dict[str, Any]:
    """
    获取图像元数据，支持多种格式
    
    Args:
        image_path: 图像路径
        
    Returns:
        元数据字典
    """
    file_format = get_file_format(image_path)
    
    # PNG/JPG 使用 PIL
    if file_format in ['png', 'jpg']:
        return _get_metadata_pil(image_path)
    
    # HDF 格式
    if file_format == 'hdf':
        return _get_metadata_hdf(image_path)
    
    # NetCDF 格式
    if file_format == 'netcdf':
        return _get_metadata_netcdf(image_path)
    
    # GeoTIFF 和 IMG 使用 rasterio
    return _get_metadata_rasterio(image_path)


def _get_metadata_pil(image_path: str) -> Dict[str, Any]:
    """获取 PIL 支持格式的元数据"""
    img = Image.open(image_path)
    return {
        "width": img.size[0],
        "height": img.size[1],
        "bands": len(img.getbands()),
        "dtype": str(img.mode),
        "crs": None,
        "transform": None,
        "bounds": None,
        "file_size": os.path.getsize(image_path),
        "filename": os.path.basename(image_path),
        "format": img.format,
    }


def _get_metadata_hdf(image_path: str) -> Dict[str, Any]:
    """获取 HDF 格式的元数据"""
    if not HAS_H5PY:
        raise ImportError("需要安装 h5py 库: pip install h5py")
    
    with h5py.File(image_path, 'r') as f:
        dataset_name = _find_image_dataset(f)
        if dataset_name:
            data = f[dataset_name]
            shape = data.shape
            if len(shape) == 2:
                width, height, bands = shape[1], shape[0], 1
            else:
                if shape[0] <= 4:
                    bands, height, width = shape[0], shape[1], shape[2]
                else:
                    height, width, bands = shape[0], shape[1], shape[2] if len(shape) > 2 else 1
            
            return {
                "width": width,
                "height": height,
                "bands": bands,
                "dtype": str(data.dtype),
                "crs": None,
                "transform": None,
                "bounds": None,
                "file_size": os.path.getsize(image_path),
                "filename": os.path.basename(image_path),
                "format": "HDF5",
                "dataset_name": dataset_name,
            }
    
    return {
        "width": 0,
        "height": 0,
        "bands": 0,
        "dtype": "unknown",
        "file_size": os.path.getsize(image_path),
        "filename": os.path.basename(image_path),
        "format": "HDF5",
    }


def _get_metadata_netcdf(image_path: str) -> Dict[str, Any]:
    """获取 NetCDF 格式的元数据"""
    if not HAS_NETCDF4:
        raise ImportError("需要安装 netCDF4 库: pip install netCDF4")
    
    with netCDF4.Dataset(image_path, 'r') as ds:
        variable_name = _find_netcdf_variable(ds)
        if variable_name:
            var = ds.variables[variable_name]
            shape = var.shape
            if len(shape) == 2:
                width, height, bands = shape[1], shape[0], 1
            elif len(shape) == 3:
                if shape[0] <= 4:
                    bands, height, width = shape[0], shape[1], shape[2]
                else:
                    height, width, bands = shape[0], shape[1], shape[2]
            else:
                height, width, bands = shape[-2], shape[-1], shape[-3] if len(shape) >= 3 else 1
            
            return {
                "width": width,
                "height": height,
                "bands": bands,
                "dtype": str(var.dtype),
                "crs": getattr(ds, 'crs', None),
                "transform": None,
                "bounds": None,
                "file_size": os.path.getsize(image_path),
                "filename": os.path.basename(image_path),
                "format": "NetCDF",
                "variable_name": variable_name,
            }
    
    return {
        "width": 0,
        "height": 0,
        "bands": 0,
        "dtype": "unknown",
        "file_size": os.path.getsize(image_path),
        "filename": os.path.basename(image_path),
        "format": "NetCDF",
    }


def _get_metadata_rasterio(image_path: str) -> Dict[str, Any]:
    """获取 rasterio 支持格式的元数据"""
    with rasterio.open(image_path) as src:
        return {
            "width": src.width,
            "height": src.height,
            "bands": src.count,
            "dtype": str(src.dtypes[0]),
            "crs": str(src.crs) if src.crs else None,
            "transform": list(src.transform) if src.transform else None,
            "bounds": dict(zip(["left", "bottom", "right", "top"], src.bounds)) if src.bounds else None,
            "file_size": os.path.getsize(image_path),
            "filename": os.path.basename(image_path),
        }
