"""
RS Dataset Factory - 数据集生成服务
整合预测、切分、可视化的完整流程
支持大图切片处理和小图单张标注两种模式
"""
import os
import sys
import shutil
import time
import uuid
import zipfile
import numpy as np
from datetime import datetime
from typing import Dict, List, Optional, Callable, Any
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.config import MODEL_CONFIG, OUTPUT_DIR, UPLOAD_DIR
from backend.utils.geo_utils import load_large_image_with_rasterio
from backend.core.predictor import get_predictor
from backend.core.splitter import create_dataset_splits, create_dataset_info
from backend.services.visualization_service import create_visualizations


class DatasetGenerationService:
    """数据集生成服务"""
    
    def __init__(self):
        self.predictor = None
    
    def _ensure_predictor(self):
        """确保预测器已加载"""
        if self.predictor is None:
            self.predictor = get_predictor(
                bpe_path=MODEL_CONFIG["bpe_path"],
                checkpoint_path=MODEL_CONFIG["checkpoint_path"],
                device=MODEL_CONFIG["device"],
                confidence_threshold=MODEL_CONFIG["confidence_threshold"]
            )
    
    def _is_small_image(self, width: int, height: int, threshold: int = 1024) -> bool:
        """判断是否为小图(单张标注模式)"""
        return max(width, height) <= threshold
    
    def generate_single_label(
        self,
        image_path: str,
        dataset_name: str,
        classes: List[str],
        prompts: Dict[str, str],
        palette: List[List[int]],
        params: Dict[str, Any],
        progress_callback: Optional[Callable[[str, float, str], None]] = None
    ) -> Dict[str, Any]:
        """
        单张小图标注模式
        直接对整张图像进行预测，不做切片处理
        
        Args:
            image_path: 输入图像路径
            dataset_name: 数据集名称
            classes: 类别列表
            prompts: 类别提示词
            palette: 调色板
            params: 处理参数
            progress_callback: 进度回调
            
        Returns:
            结果字典
        """
        start_time = time.time()
        task_id = str(uuid.uuid4())[:8]
        
        output_dir = os.path.join(OUTPUT_DIR, f"{dataset_name}_{task_id}")
        os.makedirs(output_dir, exist_ok=True)
        
        try:
            # Step 1: 加载图像
            if progress_callback:
                progress_callback("loading", 0, "正在加载图像...")
            
            img_np, scale, invalid_mask, (new_w, new_h), metadata = load_large_image_with_rasterio(
                image_path, max_size=params.get("max_size", 15000)
            )
            
            if progress_callback:
                progress_callback("loading", 100, f"图像加载完成: {new_w}x{new_h}")
            
            # Step 2: 直接预测整张图像
            if progress_callback:
                progress_callback("predicting", 0, "正在加载模型...")
            
            self._ensure_predictor()
            
            if progress_callback:
                progress_callback("predicting", 20, "正在进行语义分割预测...")
            
            # 对于小图，直接使用整图预测（无需滑动窗口）
            from backend.config import SEGEARTH_STRATEGY
            prediction, presence_scores = self.predictor.predict_full_image(
                img_np=img_np,
                invalid_mask=invalid_mask,
                classes=classes,
                prompts=prompts,
                crop_size=min(new_w, new_h, 512),
                stride=min(new_w, new_h, 512),
                progress_callback=lambda c, t, m: progress_callback("predicting", 20 + c/t*60, m) if progress_callback else None,
                use_sem_seg=SEGEARTH_STRATEGY["use_sem_seg"],
                use_transformer_decoder=SEGEARTH_STRATEGY["use_transformer_decoder"],
                use_presence_score=SEGEARTH_STRATEGY["use_presence_score"],
                prob_thd=SEGEARTH_STRATEGY["prob_thd"],
                bg_idx=SEGEARTH_STRATEGY["bg_idx"],
            )
            
            if progress_callback:
                progress_callback("predicting", 100, "预测完成")
            
            # Step 3: 保存单张结果
            if progress_callback:
                progress_callback("saving", 0, "正在保存结果...")
            
            palette_np = np.array(palette, dtype=np.uint8)
            
            # 创建输出目录
            images_dir = os.path.join(output_dir, "images")
            labels_dir = os.path.join(output_dir, "labels")
            labels_color_dir = os.path.join(output_dir, "labels_color")
            os.makedirs(images_dir, exist_ok=True)
            os.makedirs(labels_dir, exist_ok=True)
            os.makedirs(labels_color_dir, exist_ok=True)
            
            # 保存原图
            if img_np.shape[2] >= 3:
                rgb = img_np[:, :, :3]
            else:
                rgb = np.stack([img_np[:, :, 0]] * 3, axis=2)
            
            # 归一化到 0-255
            rgb_min, rgb_max = rgb.min(), rgb.max()
            if rgb_max > rgb_min:
                rgb_norm = ((rgb - rgb_min) / (rgb_max - rgb_min) * 255).astype(np.uint8)
            else:
                rgb_norm = np.zeros_like(rgb, dtype=np.uint8)
            
            Image.fromarray(rgb_norm).save(os.path.join(images_dir, "image.png"))
            
            # 保存标签
            label_img = Image.fromarray(prediction.astype(np.uint8), mode='L')
            label_img.save(os.path.join(labels_dir, "label.png"))
            
            # 保存彩色标签
            label_color = np.zeros((prediction.shape[0], prediction.shape[1], 3), dtype=np.uint8)
            for cls_idx in range(len(classes)):
                mask = prediction == cls_idx
                label_color[mask] = palette_np[cls_idx]
            Image.fromarray(label_color).save(os.path.join(labels_color_dir, "label_color.png"))
            
            if progress_callback:
                progress_callback("saving", 100, "结果保存完成")
            
            # Step 4: 生成可视化
            if progress_callback:
                progress_callback("visualizing", 0, "正在生成可视化...")
            
            # 构建简化的 stats
            class_dist = {}
            total_pixels = prediction.size
            for cls_idx, cls_name in enumerate(classes):
                cls_pixels = int(np.sum(prediction == cls_idx))
                class_dist[cls_name] = {
                    "pixels": cls_pixels,
                    "ratio": cls_pixels / total_pixels if total_pixels > 0 else 0
                }
            
            stats = {
                "train": {"num_samples": 1, "class_distribution": class_dist},
                "val": {"num_samples": 0, "class_distribution": {}},
                "test": {"num_samples": 0, "class_distribution": {}},
            }
            
            vis_files = create_visualizations(
                output_dir=output_dir,
                img_np=img_np,
                prediction=prediction,
                invalid_mask=invalid_mask,
                stats=stats,
                classes=classes,
                palette=palette_np,
                source_name=dataset_name,
                presence_scores=presence_scores
            )
            
            if progress_callback:
                progress_callback("visualizing", 100, "可视化完成")
            
            # Step 5: 创建数据集信息文件
            if progress_callback:
                progress_callback("info", 0, "正在创建数据集信息...")
            
            info_content = {
                "name": dataset_name,
                "type": "single_label",
                "description": f"单张标注结果 - {os.path.basename(image_path)}",
                "created_at": datetime.now().isoformat(),
                "image_size": [new_w, new_h],
                "num_classes": len(classes),
                "classes": classes,
                "palette": palette,
                "class_distribution": class_dist,
            }
            
            import json
            with open(os.path.join(output_dir, "dataset_info.json"), "w", encoding="utf-8") as f:
                json.dump(info_content, f, indent=2, ensure_ascii=False)
            
            # 创建 README
            readme_content = f"""# {dataset_name}

## 单张标注结果

- **图像尺寸**: {new_w} x {new_h} 像素
- **类别数量**: {len(classes)}
- **创建时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## 目录结构

```
{dataset_name}/
├── images/          # 原始图像
│   └── image.png
├── labels/          # 标签图像 (灰度)
│   └── label.png
├── labels_color/    # 彩色标签
│   └── label_color.png
├── visualizations/  # 可视化结果
└── dataset_info.json
```

## 类别列表

| 索引 | 类别名称 | 颜色 |
|------|----------|------|
"""
            for idx, cls_name in enumerate(classes):
                color = palette[idx] if idx < len(palette) else [0, 0, 0]
                readme_content += f"| {idx} | {cls_name} | RGB({color[0]}, {color[1]}, {color[2]}) |\n"
            
            with open(os.path.join(output_dir, "README.md"), "w", encoding="utf-8") as f:
                f.write(readme_content)
            
            if progress_callback:
                progress_callback("info", 100, "数据集信息创建完成")
            
            # Step 6: 打包
            if progress_callback:
                progress_callback("packaging", 0, "正在打包...")
            
            zip_path = os.path.join(OUTPUT_DIR, f"{dataset_name}_{task_id}.zip")
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(output_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, output_dir)
                        zipf.write(file_path, arcname)
            
            if progress_callback:
                progress_callback("packaging", 100, "打包完成")
            
            elapsed_time = time.time() - start_time
            
            result = {
                "task_id": task_id,
                "dataset_name": dataset_name,
                "output_dir": output_dir,
                "zip_path": zip_path,
                "train_samples": 1,
                "val_samples": 0,
                "test_samples": 0,
                "total_samples": 1,
                "num_classes": len(classes),
                "class_distribution": class_dist,
                "visualizations": vis_files,
                "presence_scores": presence_scores,
                "processing_time": elapsed_time,
                "image_size": [new_w, new_h],
                "scale": scale,
                "mode": "single_label",
            }
            
            if progress_callback:
                progress_callback("completed", 100, f"单张标注完成，耗时 {elapsed_time:.1f}s")
            
            return result
            
        except Exception as e:
            if progress_callback:
                progress_callback("error", 0, str(e))
            raise
    
    def generate_dataset(
        self,
        image_path: str,
        dataset_name: str,
        classes: List[str],
        prompts: Dict[str, str],
        palette: List[List[int]],
        params: Dict[str, Any],
        progress_callback: Optional[Callable[[str, float, str], None]] = None
    ) -> Dict[str, Any]:
        """
        生成完整数据集
        自动判断是使用单张标注模式还是切片模式
        
        Args:
            image_path: 输入图像路径
            dataset_name: 数据集名称
            classes: 类别列表
            prompts: 类别提示词
            palette: 调色板
            params: 处理参数
            progress_callback: 进度回调 (stage, progress, message)
            
        Returns:
            结果字典
        """
        # 检查是否强制使用单张标注模式
        is_single_label = params.get("is_single_label", False)
        
        # 先加载图像获取尺寸判断模式
        if not is_single_label:
            try:
                from backend.utils.geo_utils import get_image_metadata
                metadata = get_image_metadata(image_path)
                width, height = metadata.get("width", 0), metadata.get("height", 0)
                # 小于 1024 像素的图像使用单张标注模式
                if self._is_small_image(width, height, threshold=1024):
                    is_single_label = True
            except:
                pass
        
        # 单张标注模式
        if is_single_label:
            return self.generate_single_label(
                image_path=image_path,
                dataset_name=dataset_name,
                classes=classes,
                prompts=prompts,
                palette=palette,
                params=params,
                progress_callback=progress_callback
            )
        
        # 标准切片模式
        start_time = time.time()
        task_id = str(uuid.uuid4())[:8]
        
        output_dir = os.path.join(OUTPUT_DIR, f"{dataset_name}_{task_id}")
        os.makedirs(output_dir, exist_ok=True)
        
        try:
            # Step 1: 加载图像
            if progress_callback:
                progress_callback("loading", 0, "正在加载图像...")
            
            img_np, scale, invalid_mask, (new_w, new_h), metadata = load_large_image_with_rasterio(
                image_path, max_size=params.get("max_size", 15000)
            )
            
            if progress_callback:
                progress_callback("loading", 100, f"图像加载完成: {new_w}x{new_h}")
            
            # Step 2: 预测
            if progress_callback:
                progress_callback("predicting", 0, "正在加载模型...")
            
            self._ensure_predictor()
            
            def pred_progress(current, total, msg):
                if progress_callback:
                    progress_callback("predicting", current / total * 100, msg)
            
            from backend.config import SEGEARTH_STRATEGY
            prediction, presence_scores = self.predictor.predict_full_image(
                img_np=img_np,
                invalid_mask=invalid_mask,
                classes=classes,
                prompts=prompts,
                crop_size=params.get("crop_size", 512),
                stride=params.get("stride", 384),
                progress_callback=pred_progress,
                use_sem_seg=SEGEARTH_STRATEGY["use_sem_seg"],
                use_transformer_decoder=SEGEARTH_STRATEGY["use_transformer_decoder"],
                use_presence_score=SEGEARTH_STRATEGY["use_presence_score"],
                prob_thd=SEGEARTH_STRATEGY["prob_thd"],
                bg_idx=SEGEARTH_STRATEGY["bg_idx"],
            )
            
            if progress_callback:
                progress_callback("predicting", 100, "预测完成")
            
            # Step 3: 切分数据集
            if progress_callback:
                progress_callback("splitting", 0, "正在扫描有效切片...")
            
            palette_np = np.array(palette, dtype=np.uint8)
            
            def split_progress(step, progress):
                if progress_callback:
                    progress_callback("splitting", progress, f"步骤: {step}")
            
            stats = create_dataset_splits(
                img_np=img_np,
                prediction=prediction,
                invalid_mask=invalid_mask,
                output_dir=output_dir,
                classes=classes,
                palette=palette_np,
                crop_size=params.get("crop_size", 512),
                overlap=params.get("crop_size", 512) - params.get("stride", 384),
                train_ratio=params.get("train_ratio", 0.7),
                val_ratio=params.get("val_ratio", 0.15),
                min_valid_ratio=params.get("min_valid_ratio", 0.3),
                min_class_diversity=params.get("min_class_diversity", 1),
                progress_callback=split_progress
            )
            
            if stats is None:
                raise ValueError("未在图像中找到有效切片")
            
            if progress_callback:
                progress_callback("splitting", 100, "数据集切分完成")
            
            # Step 4: 创建数据集信息
            if progress_callback:
                progress_callback("info", 0, "正在创建数据集信息...")
            
            info = create_dataset_info(
                output_dir=output_dir,
                stats=stats,
                img_size=(new_w, new_h),
                crop_size=params.get("crop_size", 512),
                stride=params.get("stride", 384),
                classes=classes,
                palette=palette,
                source_name=dataset_name,
                source_desc=f"Generated from {os.path.basename(image_path)}"
            )
            
            if progress_callback:
                progress_callback("info", 100, "数据集信息创建完成")
            
            # Step 5: 生成可视化
            if progress_callback:
                progress_callback("visualizing", 0, "正在生成可视化...")
            
            vis_files = create_visualizations(
                output_dir=output_dir,
                img_np=img_np,
                prediction=prediction,
                invalid_mask=invalid_mask,
                stats=stats,
                classes=classes,
                palette=palette_np,
                source_name=dataset_name,
                presence_scores=presence_scores
            )
            
            if progress_callback:
                progress_callback("visualizing", 100, "可视化完成")
            
            # Step 6: 打包
            if progress_callback:
                progress_callback("packaging", 0, "正在打包...")
            
            zip_path = os.path.join(OUTPUT_DIR, f"{dataset_name}_{task_id}.zip")
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(output_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, output_dir)
                        zipf.write(file_path, arcname)
            
            if progress_callback:
                progress_callback("packaging", 100, "打包完成")
            
            elapsed_time = time.time() - start_time
            
            result = {
                "task_id": task_id,
                "dataset_name": dataset_name,
                "output_dir": output_dir,
                "zip_path": zip_path,
                "train_samples": stats["train"]["num_samples"],
                "val_samples": stats["val"]["num_samples"],
                "test_samples": stats["test"]["num_samples"],
                "total_samples": info["splits"]["total"],
                "num_classes": len(classes),
                "class_distribution": stats["train"]["class_distribution"],
                "visualizations": vis_files,
                "presence_scores": presence_scores,
                "processing_time": elapsed_time,
                "image_size": [new_w, new_h],
                "scale": scale,
                "mode": "standard_crops",
            }
            
            if progress_callback:
                progress_callback("completed", 100, f"数据集生成完成，耗时 {elapsed_time:.1f}s")
            
            return result
            
        except Exception as e:
            if progress_callback:
                progress_callback("error", 0, str(e))
            raise


_service_instance: Optional[DatasetGenerationService] = None


def get_dataset_service() -> DatasetGenerationService:
    """获取单例服务"""
    global _service_instance
    if _service_instance is None:
        _service_instance = DatasetGenerationService()
    return _service_instance
