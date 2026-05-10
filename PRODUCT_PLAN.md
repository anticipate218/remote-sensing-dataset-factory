# RS Dataset Factory 产品全面升级计划
> 产品经理视角 · 基于全面审计结果

---

## 一、产品定位与竞品分析

### 定位
**一站式遥感智能标注与数据集生产平台** — 集成 AI 预测、交互式标注、数据预处理、下游任务于一体

### 竞品参考
| 竞品 | 优势 | 我们的差异化 |
|------|------|------------|
| LabelMe / CVAT | 通用标注 | 遥感专用 + 开放词汇语义分割 |
| ArcGIS Pro | 专业遥感 | 免费开源 + 轻量级 |
| Roboflow | 数据集管理 | 自带 SOTA 模型推理 |
| EISeg (百度) | 交互式分割 | 多类别 + 遥感大图处理 |

---

## 二、审计发现的关键问题（按优先级）

### P0 - 阻断性 Bug
1. **ConfirmView 预览不显示编辑后 mask**：始终用 API 原始 mask，编辑白做
2. **ExportView 导出选项无效**：勾选项未传给后端 API
3. **AnnotationEditor 平移工具失效**：panOffset 无更新逻辑
4. **generate-from-annotation ZIP 结构错误**：shutil.make_archive 参数错误
5. **后端使用错误的 Python 环境**：需使用 deeplearning1 环境

### P1 - 功能缺陷
6. **多边形/填充标注工具未实现**：仅有按钮，无逻辑
7. **AnnotationEditor 缩放后坐标错误**：getCanvasCoords 未考虑 zoom/panOffset
8. **刷新页面丢失全部状态**：completedSteps/currentTask 等未持久化
9. **WebSocket 进度未连通**：前端轮询而非实时推送
10. **搜索框无功能**：Header 搜索框为装饰

### P2 - UI/UX 缺陷
11. **配色不统一**：UploadZone 使用 #667eea，其余用 #00f0ff
12. **字体混乱**：混用 4 种字体，无设计规范
13. **数据预处理页纯占位**：无任何实际功能
14. **下游任务页纯占位**：无任何实际功能
15. **GPU 状态/通知数硬编码**：显示假数据

### P3 - 技术债
16. **DatasetPage.tsx / HomePage.tsx 死代码**
17. **/ 与 /dataset 路由重复**
18. **PROCESSING 任务重启后永久卡住**
19. **无任务取消机制**
20. **大图推理无进度反馈到前端**

---

## 三、升级计划（分 5 个阶段）

### 阶段 1：核心流程修复（P0）
> 确保 6 步工作流 100% 可用

| 任务 | 具体内容 | 文件 |
|------|---------|------|
| 1.1 | ConfirmView 使用 editedMask 预览 | ConfirmView.tsx |
| 1.2 | ExportView 将导出选项传给 API | ExportView.tsx, routes.py |
| 1.3 | AnnotationEditor 实现平移拖动 | AnnotationEditor.tsx |
| 1.4 | AnnotationEditor 修复缩放坐标 | AnnotationEditor.tsx |
| 1.5 | 修复 ZIP 打包结构 | routes.py |
| 1.6 | 持久化关键状态到 localStorage | appStore.ts |

### 阶段 2：UI 全面美化
> 参考 Copernicus、NASA Worldview、Google Earth Engine 等遥感系统的设计

| 任务 | 具体内容 |
|------|---------|
| 2.1 | **统一设计规范**：确定主色 #00f0ff、辅色 #8b5cf6、成功 #00ff88、警告 #ffb800、错误 #ff4757 |
| 2.2 | **统一字体**：标题 Orbitron、正文 Inter、代码 JetBrains Mono、中文 Noto Sans SC |
| 2.3 | **重做首页**：添加产品介绍动画、功能亮点展示、使用统计 |
| 2.4 | **美化 UploadZone**：统一配色、添加文件格式动画图标 |
| 2.5 | **美化 ClassEditor**：预设模板增加预览缩略图、更好的色彩方案展示 |
| 2.6 | **美化 PredictionView**：添加推理进度动画（不只是百分比）、GPU 使用率 |
| 2.7 | **美化 AnnotationEditor**：参考 ArcGIS/QGIS 的布局、添加迷你地图 |
| 2.8 | **美化 ConfirmView**：并排对比、滑动对比、统计图表 |
| 2.9 | **美化 ExportView**：导出配置卡片化、格式预览 |
| 2.10 | **下载遥感相关背景素材**：卫星图、3D 地球、遥感卫星等 |

### 阶段 3：功能完善
> 实现标注工具全集 + 预处理基础功能

| 任务 | 具体内容 |
|------|---------|
| 3.1 | **多边形标注工具**：点击绘制多边形、双击闭合、填充 |
| 3.2 | **魔棒/填充工具**：基于颜色相似度的区域填充 |
| 3.3 | **数据预处理 - 图像增强**：对比度、亮度、直方图均衡化（后端 + 前端） |
| 3.4 | **数据预处理 - 格式转换**：GeoTIFF ↔ PNG/JPG |
| 3.5 | **大图数据集切片模式完善**：dataset_crops 流程可用 |
| 3.6 | **任务历史页**：列出所有历史任务、可恢复、可下载 |
| 3.7 | **搜索功能实现**：搜索功能、预设模板、任务 |

### 阶段 4：SOTA 模型集成
> 为下游任务页面集成开源模型

| 任务 | 模型 | 说明 |
|------|------|------|
| 4.1 | **语义分割** | 已有 SAM3/PRISM（当前核心模型） |
| 4.2 | **变化检测** | 集成 BIT (Bi-temporal Image Transformer) 或 ChangeFormer |
| 4.3 | **目标检测** | 集成 YOLOv8 遥感版（DOTA 预训练权重） |
| 4.4 | **地物分类** | 集成 ResNet/ViT 遥感预训练（SatlasPretrain） |
| 4.5 | **超分辨率** | 集成 Real-ESRGAN 或 SwinIR |

### 阶段 5：端到端验证与打磨
> 确保所有流程可用

| 任务 | 具体内容 |
|------|---------|
| 5.1 | 验证单张标注全流程：上传 → 配置 → 预测 → 编辑 → 确认 → 导出 |
| 5.2 | 验证大图数据集流程：上传 → 配置 → 切片预测 → 导出 |
| 5.3 | 验证预处理功能 |
| 5.4 | 验证下游任务模型推理 |
| 5.5 | 验证下载功能（ZIP 结构正确） |
| 5.6 | 性能优化与错误处理完善 |
| 5.7 | 移除死代码，清理项目结构 |

---

## 四、设计规范

### 4.1 色彩系统
```
主色（Cyan）:     #00f0ff  →  科技感主色调
辅色（Purple）:   #8b5cf6  →  渐变辅助色
成功（Green）:    #00ff88  →  操作成功
警告（Amber）:    #ffb800  →  提示警告
错误（Red）:      #ff4757  →  错误状态
背景：            #0a0a0f → #0f1923  深色渐变
卡片背景：        rgba(15, 25, 35, 0.8)  毛玻璃
边框：            rgba(0, 240, 255, 0.15)
文字主色：        #e0e0e0
文字次要：        rgba(255, 255, 255, 0.5)
```

### 4.2 字体规范
```
标题/品牌:   'Orbitron', sans-serif     — 仅 Logo/大标题
副标题:      'Space Grotesk', sans-serif — 节标题/按钮
正文:        'Inter', sans-serif         — 正文/描述
代码/数据:   'JetBrains Mono', monospace — 代码/数值
中文:        'Noto Sans SC', sans-serif  — 所有中文
```

### 4.3 组件规范
```
圆角:        12px（卡片）、8px（按钮）、6px（输入框）
阴影:        0 4px 24px rgba(0, 0, 0, 0.3)
毛玻璃:      backdrop-filter: blur(20px)
动效:        framer-motion, 300ms ease
间距:        8px 基准网格
```

### 4.4 图标风格
```
使用 Ant Design Icons（线性风格）
遥感相关图标使用自定义 SVG
```

---

## 五、技术栈确认

### 前端
- React 18 + TypeScript + Vite
- Ant Design 5（UI 组件）
- Framer Motion（动效）
- Zustand + persist（状态管理）
- react-colorful（颜色选择器）
- recharts（图表）

### 后端
- Python (deeplearning1 conda env)
- FastAPI + uvicorn
- PyTorch + CUDA
- SAM3/PRISM（语义分割）
- rasterio（GeoTIFF）
- scikit-image（图像处理）
- Pillow + NumPy

### 待集成模型
- YOLOv8 (ultralytics) — 目标检测
- ChangeFormer — 变化检测
- Real-ESRGAN — 超分辨率
- SatlasPretrain — 地物分类

---

## 六、里程碑时间线

| 阶段 | 预估工作量 | 优先级 |
|------|----------|--------|
| 阶段 1：核心修复 | 高优先 | P0 |
| 阶段 2：UI 美化 | 高优先 | P0 |
| 阶段 3：功能完善 | 中优先 | P1 |
| 阶段 4：模型集成 | 中优先 | P1 |
| 阶段 5：验证打磨 | 高优先 | P0 |
