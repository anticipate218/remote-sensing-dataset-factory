"""
RS Dataset Factory - 可视化服务
专业暗色主题可视化，科技感设计
"""
import os
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.patches import Patch, Rectangle, FancyBboxPatch
from matplotlib.colors import LinearSegmentedColormap
from PIL import Image
from typing import Dict, List, Optional
import matplotlib.patheffects as path_effects

# 设置专业暗色主题
plt.style.use('dark_background')

# 自定义科技感配色 (使用 matplotlib 兼容的格式)
CYBER_COLORS = {
    'bg': '#0a0a0f',
    'card': '#111827',
    'cyan': '#00f0ff',
    'purple': '#8b5cf6',
    'green': '#00ff88',
    'pink': '#ff00aa',
    'orange': '#ff6b35',
    'text': '#f0f6fc',
    'text_secondary': (0.94, 0.96, 0.99, 0.7),  # RGBA 元组
    'border': (0, 0.94, 1, 0.3),  # RGBA 元组 (#00f0ff with alpha 0.3)
    'grid': (0, 0.94, 1, 0.1),  # RGBA 元组
}

# 科技感渐变色
CYBER_GRADIENT = LinearSegmentedColormap.from_list(
    'cyber', ['#00f0ff', '#8b5cf6', '#ff00aa']
)

plt.rcParams.update({
    'font.family': ['DejaVu Sans', 'Arial', 'sans-serif'],
    'font.size': 11,
    'figure.dpi': 150,
    'savefig.dpi': 300,
    'axes.linewidth': 0.5,
    'axes.edgecolor': CYBER_COLORS['border'],
    'axes.facecolor': CYBER_COLORS['card'],
    'figure.facecolor': CYBER_COLORS['bg'],
    'text.color': CYBER_COLORS['text'],
    'axes.labelcolor': CYBER_COLORS['text'],
    'xtick.color': CYBER_COLORS['text'],
    'ytick.color': CYBER_COLORS['text'],
    'grid.color': CYBER_COLORS['grid'],
    'grid.linewidth': 0.3,
    'axes.grid': True,
    'grid.alpha': 0.3,
    'legend.facecolor': CYBER_COLORS['card'],
    'legend.edgecolor': CYBER_COLORS['border'],
    'legend.framealpha': 0.9,
})


def add_glow_effect(ax, text_obj, color='#00f0ff'):
    """为文字添加发光效果"""
    text_obj.set_path_effects([
        path_effects.withStroke(linewidth=3, foreground=color, alpha=0.3),
        path_effects.Normal()
    ])


def create_styled_title(fig, title, subtitle=None):
    """创建科技感标题"""
    title_text = fig.suptitle(title, fontsize=18, fontweight='bold', 
                               color=CYBER_COLORS['cyan'], y=0.98)
    add_glow_effect(fig, title_text, CYBER_COLORS['cyan'])
    if subtitle:
        fig.text(0.5, 0.94, subtitle, ha='center', fontsize=11, 
                 color=CYBER_COLORS['text_secondary'], alpha=0.7)


def create_visualizations(
    output_dir: str,
    img_np: np.ndarray,
    prediction: np.ndarray,
    invalid_mask: np.ndarray,
    stats: Dict,
    classes: List[str],
    palette: np.ndarray,
    source_name: str,
    presence_scores: Dict[str, float]
) -> List[str]:
    """
    创建完整的可视化图表 (专业暗色主题)
    
    Returns:
        生成的可视化文件路径列表
    """
    vis_dir = os.path.join(output_dir, 'visualizations')
    os.makedirs(vis_dir, exist_ok=True)
    
    generated_files = []
    
    # 准备数据
    pred_color = palette[prediction]
    pred_color[invalid_mask] = [30, 30, 40]  # 暗色背景代替白色
    
    # 图像显示准备
    img_display = img_np.copy()
    if img_display.shape[2] >= 3:
        rgb = img_display[:, :, :3]
    else:
        rgb = np.stack([img_display[:, :, 0]] * 3, axis=2)
    
    # 归一化到 0-255
    rgb_min, rgb_max = rgb.min(), rgb.max()
    if rgb_max > rgb_min:
        rgb_norm = ((rgb - rgb_min) / (rgb_max - rgb_min) * 255).astype(np.uint8)
    else:
        rgb_norm = np.zeros_like(rgb, dtype=np.uint8)
    
    rgb_norm[invalid_mask] = [30, 30, 40]
    
    h, w = img_np.shape[:2]
    
    train_dist = stats['train']['class_distribution']
    valid_classes = [(i, c) for i, c in enumerate(classes) if i > 0 and c in train_dist and train_dist[c]['ratio'] > 0.001]
    
    # 1. 全场景对比图
    fig = plt.figure(figsize=(20, 12))
    fig.patch.set_facecolor(CYBER_COLORS['bg'])
    
    gs = gridspec.GridSpec(1, 2, width_ratios=[1, 1], wspace=0.05)
    
    ax1 = fig.add_subplot(gs[0])
    ax1.imshow(rgb_norm)
    ax1.set_title('原始图像', fontsize=14, fontweight='bold', color=CYBER_COLORS['cyan'], pad=10)
    ax1.axis('off')
    # 添加边框
    for spine in ax1.spines.values():
        spine.set_visible(True)
        spine.set_color(CYBER_COLORS['border'])
        spine.set_linewidth(2)
    
    ax2 = fig.add_subplot(gs[1])
    ax2.imshow(pred_color)
    ax2.set_title('分割预测', fontsize=14, fontweight='bold', color=CYBER_COLORS['purple'], pad=10)
    ax2.axis('off')
    for spine in ax2.spines.values():
        spine.set_visible(True)
        spine.set_color(CYBER_COLORS['border'])
        spine.set_linewidth(2)
    
    # 图例
    legend_patches = [Patch(facecolor=palette[i]/255, edgecolor='white', linewidth=0.5, label=c) 
                      for i, c in valid_classes]
    legend = fig.legend(handles=legend_patches, loc='lower center', 
                        ncol=min(8, len(valid_classes)), fontsize=10,
                        bbox_to_anchor=(0.5, 0.02), frameon=True, 
                        fancybox=True, shadow=True)
    legend.get_frame().set_facecolor(CYBER_COLORS['card'])
    legend.get_frame().set_edgecolor(CYBER_COLORS['border'])
    
    create_styled_title(fig, f'RS Dataset Factory', f'{source_name} - 语义分割结果')
    
    plt.tight_layout(rect=[0, 0.1, 1, 0.92])
    path = os.path.join(vis_dir, 'full_scene.png')
    fig.savefig(path, dpi=200, bbox_inches='tight', facecolor=CYBER_COLORS['bg'])
    plt.close()
    generated_files.append(path)
    
    # 2. 叠加图
    overlay = rgb_norm.astype(np.float32) * 0.45 + pred_color.astype(np.float32) * 0.55
    overlay = np.clip(overlay, 0, 255).astype(np.uint8)
    overlay[invalid_mask] = [30, 30, 40]
    
    fig, ax = plt.subplots(figsize=(16, 12))
    fig.patch.set_facecolor(CYBER_COLORS['bg'])
    ax.imshow(overlay)
    ax.set_title('原图 + 预测叠加', fontsize=14, fontweight='bold', color=CYBER_COLORS['green'], pad=10)
    ax.axis('off')
    
    # 添加发光边框效果
    rect = FancyBboxPatch((0, 0), 1, 1, transform=ax.transAxes, 
                           fill=False, edgecolor=CYBER_COLORS['cyan'], 
                           linewidth=2, boxstyle='round,pad=0.02')
    ax.add_patch(rect)
    
    create_styled_title(fig, source_name, '图像与分割结果叠加')
    
    path = os.path.join(vis_dir, 'overlay.png')
    fig.savefig(path, dpi=200, bbox_inches='tight', facecolor=CYBER_COLORS['bg'])
    plt.close()
    generated_files.append(path)
    
    # 3. 类别分布条形图 (水平渐变条)
    if valid_classes:
        class_names = [c for i, c in valid_classes]
        class_ratios = [train_dist[c]['ratio'] * 100 for i, c in valid_classes]
        class_colors = [palette[i] / 255 for i, c in valid_classes]
        sorted_idx = np.argsort(class_ratios)[::-1]
        
        fig, ax = plt.subplots(figsize=(14, max(8, len(sorted_idx) * 0.5)))
        fig.patch.set_facecolor(CYBER_COLORS['bg'])
        ax.set_facecolor(CYBER_COLORS['card'])
        
        y_pos = range(len(sorted_idx))
        bars = ax.barh(y_pos, [class_ratios[i] for i in sorted_idx],
                       color=[class_colors[i] for i in sorted_idx], 
                       edgecolor='white', linewidth=0.5, height=0.7)
        
        # 添加发光效果
        for bar, color in zip(bars, [class_colors[i] for i in sorted_idx]):
            bar.set_alpha(0.85)
        
        ax.set_yticks(y_pos)
        ax.set_yticklabels([class_names[i] for i in sorted_idx], fontsize=11)
        ax.set_xlabel('占比 (%)', fontsize=12, color=CYBER_COLORS['cyan'])
        ax.invert_yaxis()
        ax.set_xlim(0, max(class_ratios) * 1.15)
        
        # 添加数值标签
        for bar, ratio in zip(bars, [class_ratios[i] for i in sorted_idx]):
            if ratio > 0.3:
                ax.text(ratio + 0.3, bar.get_y() + bar.get_height()/2, 
                        f'{ratio:.2f}%', va='center', fontsize=10, 
                        color=CYBER_COLORS['text'], fontweight='bold')
        
        # 网格线
        ax.xaxis.grid(True, linestyle='--', alpha=0.3, color=CYBER_COLORS['cyan'])
        ax.yaxis.grid(False)
        
        create_styled_title(fig, '类别分布统计', f'共 {len(valid_classes)} 个有效类别')
        
        plt.tight_layout(rect=[0, 0, 1, 0.95])
        path = os.path.join(vis_dir, 'class_distribution.png')
        fig.savefig(path, dpi=300, bbox_inches='tight', facecolor=CYBER_COLORS['bg'])
        plt.close()
        generated_files.append(path)
    
    # 4. 置信度分析图
    if presence_scores:
        sorted_scores = sorted(presence_scores.items(), key=lambda x: x[1], reverse=True)
        ps_names = [s[0] for s in sorted_scores][:15]
        ps_values = [s[1] for s in sorted_scores][:15]
        
        fig, ax = plt.subplots(figsize=(12, 8))
        fig.patch.set_facecolor(CYBER_COLORS['bg'])
        ax.set_facecolor(CYBER_COLORS['card'])
        
        # 渐变色条
        colors = [CYBER_COLORS['green'] if v > 0.3 else CYBER_COLORS['orange'] if v > 0.15 else '#ff4757' 
                  for v in ps_values]
        
        bars = ax.barh(ps_names, ps_values, color=colors, edgecolor='white', 
                       linewidth=0.5, height=0.7, alpha=0.85)
        
        # 阈值线
        ax.axvline(x=0.3, color=CYBER_COLORS['green'], linestyle='--', linewidth=2, 
                   label='高置信阈值 (0.3)', alpha=0.8)
        ax.axvline(x=0.15, color=CYBER_COLORS['orange'], linestyle='--', linewidth=2, 
                   label='中置信阈值 (0.15)', alpha=0.8)
        
        ax.set_xlabel('置信度分数', fontsize=12, color=CYBER_COLORS['cyan'])
        ax.set_xlim(0, 1.05)
        ax.invert_yaxis()
        
        legend = ax.legend(loc='lower right', fontsize=10, framealpha=0.9)
        legend.get_frame().set_facecolor(CYBER_COLORS['card'])
        legend.get_frame().set_edgecolor(CYBER_COLORS['border'])
        
        ax.xaxis.grid(True, linestyle='--', alpha=0.3, color=CYBER_COLORS['cyan'])
        
        create_styled_title(fig, '类别置信度分析', '基于模型预测的类别存在置信度')
        
        plt.tight_layout(rect=[0, 0, 1, 0.95])
        path = os.path.join(vis_dir, 'presence_scores.png')
        fig.savefig(path, dpi=300, bbox_inches='tight', facecolor=CYBER_COLORS['bg'])
        plt.close()
        generated_files.append(path)
    
    # 5. 数据集划分统计
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    fig.patch.set_facecolor(CYBER_COLORS['bg'])
    
    splits = ['训练集', '验证集', '测试集']
    split_counts = [stats['train']['num_samples'], stats['val']['num_samples'], stats['test']['num_samples']]
    colors_split = [CYBER_COLORS['cyan'], CYBER_COLORS['green'], CYBER_COLORS['purple']]
    
    # 条形图
    axes[0].set_facecolor(CYBER_COLORS['card'])
    bars = axes[0].bar(splits, split_counts, color=colors_split, edgecolor='white', 
                       linewidth=1, alpha=0.85)
    
    # 添加发光效果
    for bar, color in zip(bars, colors_split):
        bar.set_zorder(2)
    
    axes[0].set_ylabel('样本数量', fontsize=12, color=CYBER_COLORS['cyan'])
    
    for i, v in enumerate(split_counts):
        axes[0].text(i, v + max(split_counts)*0.02, f'{v:,}', 
                     ha='center', fontsize=12, fontweight='bold', color=CYBER_COLORS['text'])
    
    axes[0].yaxis.grid(True, linestyle='--', alpha=0.3, color=CYBER_COLORS['cyan'])
    axes[0].set_axisbelow(True)
    
    # 饼图
    axes[1].set_facecolor(CYBER_COLORS['bg'])
    if sum(split_counts) > 0:
        wedges, texts, autotexts = axes[1].pie(
            split_counts, labels=splits, colors=colors_split, 
            autopct='%1.1f%%', startangle=90, explode=(0.02, 0.02, 0.02),
            wedgeprops=dict(linewidth=2, edgecolor='white'),
            textprops=dict(color=CYBER_COLORS['text'], fontsize=11)
        )
        for autotext in autotexts:
            autotext.set_fontweight('bold')
            autotext.set_fontsize(11)
    
    create_styled_title(fig, '数据集划分统计', f'总样本数: {sum(split_counts):,}')
    
    plt.tight_layout(rect=[0, 0, 1, 0.92])
    path = os.path.join(vis_dir, 'split_statistics.png')
    fig.savefig(path, dpi=300, bbox_inches='tight', facecolor=CYBER_COLORS['bg'])
    plt.close()
    generated_files.append(path)
    
    # 6. 样本展示画廊
    train_img_dir = os.path.join(output_dir, 'train', 'images')
    train_lbl_dir = os.path.join(output_dir, 'train', 'labels_color')
    samples = []
    if os.path.exists(train_img_dir):
        samples = sorted([f for f in os.listdir(train_img_dir) if f.endswith('.png')])
    
    if samples:
        np.random.seed(42)
        num_samples = min(8, len(samples))
        selected = np.random.choice(len(samples), num_samples, replace=False)
        
        fig = plt.figure(figsize=(18, 10))
        fig.patch.set_facecolor(CYBER_COLORS['bg'])
        
        gs = gridspec.GridSpec(2, 8, wspace=0.05, hspace=0.15)
        
        for i, idx in enumerate(selected):
            # 原图
            ax_img = fig.add_subplot(gs[0, i])
            try:
                img = np.array(Image.open(os.path.join(train_img_dir, samples[idx])))
                ax_img.imshow(img)
            except:
                pass
            ax_img.axis('off')
            ax_img.set_title(f'#{idx+1}', fontsize=9, color=CYBER_COLORS['cyan'], pad=2)
            
            # 标签
            ax_lbl = fig.add_subplot(gs[1, i])
            try:
                lbl = np.array(Image.open(os.path.join(train_lbl_dir, samples[idx])))
                ax_lbl.imshow(lbl)
            except:
                pass
            ax_lbl.axis('off')
        
        # 添加行标签
        fig.text(0.02, 0.75, '原图', fontsize=12, color=CYBER_COLORS['cyan'], 
                 fontweight='bold', rotation=90, va='center')
        fig.text(0.02, 0.3, '标签', fontsize=12, color=CYBER_COLORS['purple'], 
                 fontweight='bold', rotation=90, va='center')
        
        create_styled_title(fig, '训练样本展示', f'随机选取 {num_samples} 个样本')
        
        plt.tight_layout(rect=[0.04, 0, 1, 0.92])
        path = os.path.join(vis_dir, 'sample_gallery.png')
        fig.savefig(path, dpi=200, bbox_inches='tight', facecolor=CYBER_COLORS['bg'])
        plt.close()
        generated_files.append(path)
    
    # 7. 区域放大图
    regions = [
        (0, 0, w//3, h//3, 'top_left', '左上区域'),
        (w//3, 0, 2*w//3, h//3, 'top_center', '上中区域'),
        (2*w//3, 0, w, h//3, 'top_right', '右上区域'),
        (w//3, h//3, 2*w//3, 2*h//3, 'center', '中心区域'),
    ]
    
    for x1, y1, x2, y2, name, label in regions:
        fig, axes = plt.subplots(1, 2, figsize=(16, 8))
        fig.patch.set_facecolor(CYBER_COLORS['bg'])
        
        axes[0].set_facecolor(CYBER_COLORS['card'])
        axes[0].imshow(rgb_norm[y1:y2, x1:x2])
        axes[0].set_title('原图', fontsize=12, color=CYBER_COLORS['cyan'], fontweight='bold', pad=8)
        axes[0].axis('off')
        
        axes[1].set_facecolor(CYBER_COLORS['card'])
        axes[1].imshow(pred_color[y1:y2, x1:x2])
        axes[1].set_title('预测', fontsize=12, color=CYBER_COLORS['purple'], fontweight='bold', pad=8)
        axes[1].axis('off')
        
        create_styled_title(fig, f'{label}放大', f'坐标: ({x1}, {y1}) - ({x2}, {y2})')
        
        plt.tight_layout(rect=[0, 0, 1, 0.92])
        path = os.path.join(vis_dir, f'zoom_{name}.png')
        fig.savefig(path, dpi=200, bbox_inches='tight', facecolor=CYBER_COLORS['bg'])
        plt.close()
        generated_files.append(path)
    
    # 8. 综合信息面板
    fig = plt.figure(figsize=(16, 10))
    fig.patch.set_facecolor(CYBER_COLORS['bg'])
    
    gs = gridspec.GridSpec(2, 3, height_ratios=[1.2, 1], wspace=0.2, hspace=0.25)
    
    # 缩略图
    ax_thumb = fig.add_subplot(gs[0, 0])
    ax_thumb.imshow(rgb_norm[::4, ::4])  # 下采样
    ax_thumb.set_title('原图预览', fontsize=11, color=CYBER_COLORS['cyan'], fontweight='bold')
    ax_thumb.axis('off')
    
    ax_pred_thumb = fig.add_subplot(gs[0, 1])
    ax_pred_thumb.imshow(pred_color[::4, ::4])
    ax_pred_thumb.set_title('预测预览', fontsize=11, color=CYBER_COLORS['purple'], fontweight='bold')
    ax_pred_thumb.axis('off')
    
    # 统计信息
    ax_info = fig.add_subplot(gs[0, 2])
    ax_info.set_facecolor(CYBER_COLORS['card'])
    ax_info.axis('off')
    
    info_text = f"""
    数据集信息
    ─────────────────
    名称: {source_name}
    图像尺寸: {w} × {h}
    像素总数: {w * h:,}
    
    样本统计
    ─────────────────
    训练集: {stats['train']['num_samples']:,}
    验证集: {stats['val']['num_samples']:,}
    测试集: {stats['test']['num_samples']:,}
    总计: {sum(split_counts):,}
    
    类别数: {len(valid_classes)}
    """
    
    ax_info.text(0.1, 0.95, info_text, transform=ax_info.transAxes, 
                 fontsize=11, verticalalignment='top', fontfamily='monospace',
                 color=CYBER_COLORS['text'], linespacing=1.8)
    
    # 底部类别颜色条
    ax_palette = fig.add_subplot(gs[1, :])
    ax_palette.set_facecolor(CYBER_COLORS['card'])
    ax_palette.axis('off')
    
    if valid_classes:
        n_classes = len(valid_classes)
        cols = min(n_classes, 10)
        rows = (n_classes + cols - 1) // cols
        
        for idx, (class_idx, class_name) in enumerate(valid_classes):
            row = idx // cols
            col = idx % cols
            x = 0.05 + col * 0.095
            y = 0.8 - row * 0.25
            
            # 颜色块
            color = palette[class_idx] / 255
            rect = FancyBboxPatch((x, y - 0.08), 0.03, 0.06, transform=ax_palette.transAxes,
                                   facecolor=color, edgecolor='white', linewidth=1,
                                   boxstyle='round,pad=0.01')
            ax_palette.add_patch(rect)
            
            # 类别名
            ax_palette.text(x + 0.04, y - 0.05, class_name, transform=ax_palette.transAxes,
                           fontsize=9, color=CYBER_COLORS['text'], va='center')
    
    ax_palette.set_title('类别调色板', fontsize=11, color=CYBER_COLORS['green'], 
                         fontweight='bold', pad=10, loc='left')
    
    create_styled_title(fig, 'RS Dataset Factory', f'{source_name} - 综合分析报告')
    
    path = os.path.join(vis_dir, 'summary_panel.png')
    fig.savefig(path, dpi=200, bbox_inches='tight', facecolor=CYBER_COLORS['bg'])
    plt.close()
    generated_files.append(path)
    
    return generated_files
