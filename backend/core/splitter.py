"""
RS Dataset Factory - 數據集切分器
基於 create_jiangxi_dataset.py 的數據集切分邏輯
"""
import os
import random
import json
import numpy as np
from PIL import Image
from typing import Dict, List, Tuple, Optional, Callable
from datetime import datetime
from tqdm import tqdm


def create_dataset_splits(
    img_np: np.ndarray,
    prediction: np.ndarray,
    invalid_mask: np.ndarray,
    output_dir: str,
    classes: List[str],
    palette: np.ndarray,
    crop_size: int = 512,
    overlap: int = 384,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
    min_valid_ratio: float = 0.3,
    min_class_diversity: int = 1,
    progress_callback: Optional[Callable[[str, float], None]] = None
) -> Optional[Dict]:
    """
    將大圖切分成數據集
    
    Args:
        img_np: 原始圖像 (H, W, 3)
        prediction: 預測結果 (H, W)
        invalid_mask: 無效區域掩膜
        output_dir: 輸出目錄
        classes: 類別列表
        palette: 調色板 (N, 3)
        crop_size: 裁剪塊大小
        overlap: 重疊像素數
        train_ratio: 訓練集比例
        val_ratio: 驗證集比例
        test_ratio: 測試集比例
        min_valid_ratio: 最小有效像素比
        min_class_diversity: 最小類別數
        progress_callback: 進度回調 (step_name, progress)
        
    Returns:
        stats: 統計信息字典
    """
    h, w = img_np.shape[:2]
    stride = crop_size - overlap
    
    for split in ['train', 'val', 'test']:
        os.makedirs(os.path.join(output_dir, split, 'images'), exist_ok=True)
        os.makedirs(os.path.join(output_dir, split, 'labels'), exist_ok=True)
        os.makedirs(os.path.join(output_dir, split, 'labels_color'), exist_ok=True)
    
    valid_crops = []
    
    if progress_callback:
        progress_callback("scanning", 0)
    
    h_grids = max((h - crop_size) // stride + 1, 1)
    w_grids = max((w - crop_size) // stride + 1, 1)
    total_scan = h_grids * w_grids
    
    for h_idx in range(h_grids):
        for w_idx in range(w_grids):
            y1 = h_idx * stride
            x1 = w_idx * stride
            y2 = min(y1 + crop_size, h)
            x2 = min(x1 + crop_size, w)
            
            if y2 - y1 < crop_size * 0.8 or x2 - x1 < crop_size * 0.8:
                continue
            
            crop_invalid = invalid_mask[y1:y2, x1:x2]
            valid_ratio = 1 - crop_invalid.sum() / crop_invalid.size
            
            if valid_ratio < min_valid_ratio:
                continue
            
            crop_label = prediction[y1:y2, x1:x2]
            valid_labels = crop_label[~crop_invalid]
            if len(valid_labels) == 0:
                continue
            unique_classes = len(np.unique(valid_labels))
            
            if unique_classes < min_class_diversity:
                continue
            
            _, counts = np.unique(valid_labels, return_counts=True)
            probs = counts / counts.sum()
            entropy = -np.sum(probs * np.log2(probs + 1e-10))
            
            valid_crops.append({
                'y1': y1, 'x1': x1, 'y2': y2, 'x2': x2,
                'valid_ratio': valid_ratio,
                'unique_classes': unique_classes,
                'entropy': entropy,
                'h_idx': h_idx,
                'w_idx': w_idx
            })
        
        if progress_callback:
            progress_callback("scanning", (h_idx + 1) / h_grids * 100)
    
    if len(valid_crops) == 0:
        return None
    
    random.seed(42)
    random.shuffle(valid_crops)
    
    n_total = len(valid_crops)
    n_train = int(n_total * train_ratio)
    n_val = int(n_total * val_ratio)
    
    train_crops = valid_crops[:n_train]
    val_crops = valid_crops[n_train:n_train + n_val]
    test_crops = valid_crops[n_train + n_val:]
    
    stats = {'train': {}, 'val': {}, 'test': {}}
    split_data = [('train', train_crops), ('val', val_crops), ('test', test_crops)]
    
    for split_name, crops in split_data:
        if progress_callback:
            progress_callback(f"saving_{split_name}", 0)
        
        class_pixel_counts = {c: 0 for c in range(len(classes))}
        
        for idx, crop_info in enumerate(crops):
            y1, x1, y2, x2 = crop_info['y1'], crop_info['x1'], crop_info['y2'], crop_info['x2']
            
            crop_img = img_np[y1:y2, x1:x2]
            crop_label = prediction[y1:y2, x1:x2]
            
            if crop_img.shape[0] != crop_size or crop_img.shape[1] != crop_size:
                pad_h = crop_size - crop_img.shape[0]
                pad_w = crop_size - crop_img.shape[1]
                if pad_h > 0 or pad_w > 0:
                    crop_img = np.pad(crop_img, ((0, pad_h), (0, pad_w), (0, 0)), 
                                      mode='constant', constant_values=255)
                    crop_label = np.pad(crop_label, ((0, pad_h), (0, pad_w)), 
                                        mode='constant', constant_values=0)
            
            filename = f"{idx:05d}_r{crop_info['h_idx']:03d}_c{crop_info['w_idx']:03d}"
            
            Image.fromarray(crop_img).save(
                os.path.join(output_dir, split_name, 'images', f'{filename}.png'))
            Image.fromarray(crop_label).save(
                os.path.join(output_dir, split_name, 'labels', f'{filename}.png'))
            Image.fromarray(palette[crop_label]).save(
                os.path.join(output_dir, split_name, 'labels_color', f'{filename}.png'))
            
            for c in range(len(classes)):
                class_pixel_counts[c] += np.sum(crop_label == c)
            
            if progress_callback and idx % 10 == 0:
                progress_callback(f"saving_{split_name}", (idx + 1) / len(crops) * 100)
        
        total_pixels = sum(class_pixel_counts.values())
        stats[split_name] = {
            'num_samples': len(crops),
            'class_distribution': {
                classes[c]: {
                    'pixels': int(class_pixel_counts[c]),
                    'ratio': float(class_pixel_counts[c] / total_pixels) if total_pixels > 0 else 0
                }
                for c in range(len(classes))
            }
        }
    
    return stats


def create_dataset_info(
    output_dir: str,
    stats: Dict,
    img_size: Tuple[int, int],
    crop_size: int,
    stride: int,
    classes: List[str],
    palette: List[List[int]],
    source_name: str,
    source_desc: str
) -> Dict:
    """創建數據集信息文件"""
    info = {
        'name': source_name,
        'description': source_desc,
        'version': '1.0',
        'created': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'image_size': list(img_size),
        'crop_size': crop_size,
        'stride': stride,
        'overlap': f'{100 * (crop_size - stride) / crop_size:.0f}%',
        'num_classes': len(classes),
        'classes': classes,
        'palette': palette,
        'splits': {
            'train': stats['train']['num_samples'],
            'val': stats['val']['num_samples'],
            'test': stats['test']['num_samples'],
            'total': stats['train']['num_samples'] + stats['val']['num_samples'] + stats['test']['num_samples']
        },
        'class_distribution': stats['train']['class_distribution']
    }
    
    with open(os.path.join(output_dir, 'dataset_info.json'), 'w', encoding='utf-8') as f:
        json.dump(info, f, indent=2, ensure_ascii=False)
    
    total = info['splits']['total']
    readme = f"""# {info['name']}

## Dataset Information
- **Created**: {info['created']}
- **Image Size**: {img_size[0]} x {img_size[1]}
- **Crop Size**: {crop_size}
- **Stride**: {stride} ({info['overlap']} overlap)
- **Classes**: {len(classes)}
- **Total Samples**: {total:,}

## Splits
- Train: {stats['train']['num_samples']:,}
- Val: {stats['val']['num_samples']:,}
- Test: {stats['test']['num_samples']:,}

## Classes
"""
    for i, cls in enumerate(classes):
        readme += f"{i}. {cls}\n"
    
    readme += """
## Directory Structure
```
dataset/
├── train/
│   ├── images/      # RGB images (.png)
│   ├── labels/      # Grayscale labels (.png)
│   └── labels_color/# Colored labels (.png)
├── val/
│   └── ...
├── test/
│   └── ...
├── visualizations/  # Visualization images
├── dataset_info.json
└── README.md
```

## Usage
```python
from PIL import Image
import numpy as np

# Load image and label
img = np.array(Image.open('train/images/00000_r000_c000.png'))
label = np.array(Image.open('train/labels/00000_r000_c000.png'))
```
"""
    
    with open(os.path.join(output_dir, 'README.md'), 'w', encoding='utf-8') as f:
        f.write(readme)
    
    return info
