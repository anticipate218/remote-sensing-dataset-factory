/**
 * AnnotationEditor - 交互式标注编辑器
 * 支持画笔、橡皮擦、缩放、平移等功能
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { message } from 'antd';
import { useAppStore, ClassItem, AnnotationTool } from '../../stores/appStore';
import ToolBar from './ToolBar';
import ClassPanel from './ClassPanel';
import LayerPanel from './LayerPanel';
import RefineClassModal from './RefineClassModal';
import AIDiagnoseModal from './AIDiagnoseModal';
import './AnnotationEditor.css';

interface AnnotationEditorProps {
  originalImageUrl: string;
  maskImageUrl?: string;
  taskId?: string | null;
  onSave?: (maskDataUrl: string) => void;
}

const AnnotationEditor: React.FC<AnnotationEditorProps> = ({
  originalImageUrl,
  maskImageUrl,
  taskId,
  onSave,
}) => {
  const { classes, annotationState, setAnnotationState } = useAppStore();
  const [refineTarget, setRefineTarget] = useState<{ cls: ClassItem; index: number } | null>(null);
  const [maskReloadKey, setMaskReloadKey] = useState(0);
  const [aiDiagnoseOpen, setAiDiagnoseOpen] = useState(false);
  const [canRevertRefine, setCanRevertRefine] = useState(false);

  // 查询是否有可撤销的精修
  const refreshRefineHistory = useCallback(async () => {
    if (!taskId) {
      setCanRevertRefine(false);
      return;
    }
    try {
      const r = await fetch(`/api/refine-history/${taskId}`);
      if (r.ok) {
        const d = await r.json();
        setCanRevertRefine(!!d.can_undo);
      }
    } catch {
      setCanRevertRefine(false);
    }
  }, [taskId]);

  useEffect(() => {
    refreshRefineHistory();
  }, [refreshRefineHistory, maskReloadKey]);

  const handleRevertRefine = useCallback(async () => {
    if (!taskId) return;
    try {
      const r = await fetch(`/api/refine-revert/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `状态码 ${r.status}`);
      }
      const data = await r.json();
      message.success(data.message || '已撤销精修');
      setMaskReloadKey((k) => k + 1);
    } catch (e: any) {
      message.error(`撤销失败: ${e.message || e}`);
    }
  }, [taskId]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const hoverThrottleRef = useRef<number>(0);
  
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [lastPos, setLastPos] = useState<{ x: number; y: number } | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  
  const { tool, brushSize, selectedClassId, opacity, showOriginal, showAnnotation, zoom, panOffset } = annotationState;

  // 获取选中类别的颜色
  const getSelectedClassColor = useCallback((): [number, number, number] => {
    if (!selectedClassId) return [255, 0, 0];
    const cls = classes.find(c => c.id === selectedClassId);
    return cls?.color || [255, 0, 0];
  }, [selectedClassId, classes]);

  // 获取选中类别的索引（用于mask）
  const getSelectedClassIndex = useCallback((): number => {
    if (!selectedClassId) return 0;
    const index = classes.findIndex(c => c.id === selectedClassId);
    return index >= 0 ? index + 1 : 0; // +1 因为 0 是背景
  }, [selectedClassId, classes]);

  // 进入编辑器时提示当前模式
  useEffect(() => {
    if (tool === 'pan') {
      message.info({ content: '当前为查看模式，按 B 切换画笔开始标注', duration: 3, key: 'tool-hint' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 加载图像
  useEffect(() => {
    const loadImages = async () => {
      const imageCanvas = imageCanvasRef.current;
      const annotationCanvas = annotationCanvasRef.current;
      if (!imageCanvas || !annotationCanvas) return;

      const imageCtx = imageCanvas.getContext('2d');
      const annotationCtx = annotationCanvas.getContext('2d');
      if (!imageCtx || !annotationCtx) return;

      // 加载原图
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        setImageSize({ width: img.width, height: img.height });
        setCanvasSize({ width: img.width, height: img.height });
        
        imageCanvas.width = img.width;
        imageCanvas.height = img.height;
        annotationCanvas.width = img.width;
        annotationCanvas.height = img.height;
        
        imageCtx.drawImage(img, 0, 0);
        
        // 加载 mask（如果存在）
        if (maskImageUrl) {
          const maskImg = new Image();
          maskImg.crossOrigin = 'anonymous';
          
          maskImg.onload = () => {
            // 创建临时 canvas 读取 mask 数据
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) return;
            
            tempCtx.drawImage(maskImg, 0, 0, img.width, img.height);
            const maskData = tempCtx.getImageData(0, 0, img.width, img.height);
            
            // 将灰度 mask 转换为彩色
            const coloredData = new ImageData(img.width, img.height);
            const palette: [number, number, number][] = [[0, 0, 0], ...classes.map(c => c.color)];
            
            for (let i = 0; i < maskData.data.length; i += 4) {
              const classIndex = maskData.data[i]; // 灰度值 = 类别索引
              const color = palette[classIndex] || [0, 0, 0];
              coloredData.data[i] = color[0];
              coloredData.data[i + 1] = color[1];
              coloredData.data[i + 2] = color[2];
              coloredData.data[i + 3] = classIndex > 0 ? 200 : 0;
            }
            
            annotationCtx.putImageData(coloredData, 0, 0);
            
            // 保存初始状态到历史
            const initialState = annotationCtx.getImageData(0, 0, img.width, img.height);
            setHistory([initialState]);
            setHistoryIndex(0);
            setImagesLoaded(true);
          };
          
          maskImg.onerror = () => {
            console.warn('无法加载 mask 图像');
            annotationCtx.clearRect(0, 0, img.width, img.height);
            const initialState = annotationCtx.getImageData(0, 0, img.width, img.height);
            setHistory([initialState]);
            setHistoryIndex(0);
            setImagesLoaded(true);
          };
          
          // 添加 cache-busting 参数，确保精修后能拉到新 mask
          const sep = maskImageUrl.includes('?') ? '&' : '?';
          maskImg.src = `${maskImageUrl}${sep}r=${maskReloadKey}`;
        } else {
          annotationCtx.clearRect(0, 0, img.width, img.height);
          const initialState = annotationCtx.getImageData(0, 0, img.width, img.height);
          setHistory([initialState]);
          setHistoryIndex(0);
          setImagesLoaded(true);
        }
      };
      
      img.onerror = () => {
        message.error('加载图像失败');
      };
      
      img.src = originalImageUrl;
    };

    loadImages();
  }, [originalImageUrl, maskImageUrl, classes, maskReloadKey]);

  // 保存当前状态到历史
  const saveToHistory = useCallback(() => {
    const annotationCanvas = annotationCanvasRef.current;
    if (!annotationCanvas) return;
    
    const ctx = annotationCanvas.getContext('2d');
    if (!ctx) return;
    
    const currentState = ctx.getImageData(0, 0, annotationCanvas.width, annotationCanvas.height);
    
    // 删除当前位置之后的历史
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(currentState);
    
    // 限制历史长度
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // 撤销
  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    
    const annotationCanvas = annotationCanvasRef.current;
    if (!annotationCanvas) return;
    
    const ctx = annotationCanvas.getContext('2d');
    if (!ctx) return;
    
    const newIndex = historyIndex - 1;
    ctx.putImageData(history[newIndex], 0, 0);
    setHistoryIndex(newIndex);
  }, [history, historyIndex]);

  // 重做
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    
    const annotationCanvas = annotationCanvasRef.current;
    if (!annotationCanvas) return;
    
    const ctx = annotationCanvas.getContext('2d');
    if (!ctx) return;
    
    const newIndex = historyIndex + 1;
    ctx.putImageData(history[newIndex], 0, 0);
    setHistoryIndex(newIndex);
  }, [history, historyIndex]);

  // 获取鼠标在画布上的实际坐标（考虑缩放和平移）
  const getCanvasCoords = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const canvas = annotationCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  // 获取鼠标在容器上的屏幕坐标（用于平移）
  const getScreenCoords = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    return { x: e.clientX, y: e.clientY };
  }, []);

  // 绘制圆形
  const drawCircle = useCallback((x: number, y: number, erase: boolean = false) => {
    const annotationCanvas = annotationCanvasRef.current;
    if (!annotationCanvas) return;
    
    const ctx = annotationCanvas.getContext('2d');
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    
    if (erase) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      const color = getSelectedClassColor();
      ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.8)`;
      ctx.fill();
    }
  }, [brushSize, getSelectedClassColor]);

  // 绘制线段
  const drawLine = useCallback((from: { x: number; y: number }, to: { x: number; y: number }, erase: boolean = false) => {
    const annotationCanvas = annotationCanvasRef.current;
    if (!annotationCanvas) return;
    
    const ctx = annotationCanvas.getContext('2d');
    if (!ctx) return;
    
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (erase) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
    } else {
      const color = getSelectedClassColor();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.8)`;
    }
    
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    
    ctx.globalCompositeOperation = 'source-over';
  }, [brushSize, getSelectedClassColor]);

  // 绘制多边形预览（在 overlay canvas 上）
  const drawPolygonPreview = useCallback((points: { x: number; y: number }[], mousePos?: { x: number; y: number }) => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (points.length === 0) return;
    
    const color = getSelectedClassColor();
    ctx.strokeStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    if (mousePos) {
      ctx.lineTo(mousePos.x, mousePos.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    
    // 绘制顶点
    points.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? '#00ff88' : `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }, [getSelectedClassColor]);

  // 完成多边形绘制（填充到标注 canvas）
  const finishPolygon = useCallback((points: { x: number; y: number }[]) => {
    if (points.length < 3) return;
    
    const annotationCanvas = annotationCanvasRef.current;
    if (!annotationCanvas) return;
    const ctx = annotationCanvas.getContext('2d');
    if (!ctx) return;
    
    const color = getSelectedClassColor();
    ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.8)`;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    
    // 清除 overlay
    const overlay = overlayCanvasRef.current;
    if (overlay) {
      const overlayCtx = overlay.getContext('2d');
      overlayCtx?.clearRect(0, 0, overlay.width, overlay.height);
    }
    
    saveToHistory();
  }, [getSelectedClassColor, saveToHistory]);

  // 洪水填充算法（容差由 annotationState.fillTolerance 控制）
  const floodFill = useCallback((startX: number, startY: number) => {
    const annotationCanvas = annotationCanvasRef.current;
    if (!annotationCanvas) return;
    const ctx = annotationCanvas.getContext('2d');
    if (!ctx) return;
    
    const w = annotationCanvas.width;
    const h = annotationCanvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    
    const sx = Math.round(startX);
    const sy = Math.round(startY);
    if (sx < 0 || sx >= w || sy < 0 || sy >= h) return;
    
    const startIdx = (sy * w + sx) * 4;
    const targetR = data[startIdx];
    const targetG = data[startIdx + 1];
    const targetB = data[startIdx + 2];
    const targetA = data[startIdx + 3];
    
    const color = getSelectedClassColor();
    const fillR = color[0], fillG = color[1], fillB = color[2], fillA = 200;
    
    // 如果目标颜色就是要填充的颜色则跳过
    if (targetR === fillR && targetG === fillG && targetB === fillB && Math.abs(targetA - fillA) < 10) return;
    
    const tolerance = annotationState.fillTolerance ?? 32;
    const matches = (idx: number) => {
      return Math.abs(data[idx] - targetR) <= tolerance &&
             Math.abs(data[idx + 1] - targetG) <= tolerance &&
             Math.abs(data[idx + 2] - targetB) <= tolerance &&
             Math.abs(data[idx + 3] - targetA) <= tolerance;
    };
    
    const stack: [number, number][] = [[sx, sy]];
    const visited = new Uint8Array(w * h);
    
    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      const key = y * w + x;
      if (visited[key]) continue;
      visited[key] = 1;
      
      const idx = key * 4;
      if (!matches(idx)) continue;
      
      data[idx] = fillR;
      data[idx + 1] = fillG;
      data[idx + 2] = fillB;
      data[idx + 3] = fillA;
      
      if (x > 0) stack.push([x - 1, y]);
      if (x < w - 1) stack.push([x + 1, y]);
      if (y > 0) stack.push([x, y - 1]);
      if (y < h - 1) stack.push([x, y + 1]);
    }
    
    ctx.putImageData(imageData, 0, 0);
    saveToHistory();
  }, [getSelectedClassColor, saveToHistory, annotationState.fillTolerance]);

  // ============================================================
  // 矩形工具：拖曳起点 / 终点
  // ============================================================
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);

  const drawRectanglePreview = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const overlay = overlayCanvasRef.current;
      if (!overlay) return;
      const ctx = overlay.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      const color = getSelectedClassColor();
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      ctx.strokeStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
      ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.25)`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillRect(x, y, w, h);
      ctx.setLineDash([]);
      // 角标
      ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.95)`;
      ctx.font = "11px 'SarasaMonoSC', monospace";
      ctx.fillText(`${Math.round(w)} × ${Math.round(h)}`, x + 4, y - 4);
    },
    [getSelectedClassColor],
  );

  const finishRectangle = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const annotationCanvas = annotationCanvasRef.current;
      if (!annotationCanvas) return;
      const ctx = annotationCanvas.getContext('2d');
      if (!ctx) return;
      const color = getSelectedClassColor();
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      if (w < 2 || h < 2) return;
      ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.85)`;
      ctx.fillRect(x, y, w, h);
      // 清掉 overlay
      const overlay = overlayCanvasRef.current;
      if (overlay) {
        const oc = overlay.getContext('2d');
        oc?.clearRect(0, 0, overlay.width, overlay.height);
      }
      saveToHistory();
    },
    [getSelectedClassColor, saveToHistory],
  );

  // ============================================================
  // 吸管：根据像素颜色找最匹配的类别并切换
  // ============================================================
  const eyedropPickClass = useCallback(
    (px: number, py: number) => {
      const annotationCanvas = annotationCanvasRef.current;
      if (!annotationCanvas) return;
      const ctx = annotationCanvas.getContext('2d');
      if (!ctx) return;
      const sx = Math.round(px);
      const sy = Math.round(py);
      if (sx < 0 || sx >= annotationCanvas.width || sy < 0 || sy >= annotationCanvas.height) return;
      const data = ctx.getImageData(sx, sy, 1, 1).data;
      const r = data[0], g = data[1], b = data[2], a = data[3];
      if (a < 50) {
        message.info('此处为背景，无类别');
        return;
      }
      // 在 classes 中找最近颜色
      let bestId: string | null = null;
      let bestDist = Infinity;
      let bestName = '';
      classes.forEach((c) => {
        const [cr, cg, cb] = c.color;
        const d = Math.sqrt((r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2);
        if (d < bestDist) {
          bestDist = d;
          bestId = c.id;
          bestName = c.name;
        }
      });
      if (bestId && bestDist < 80) {
        setAnnotationState({ selectedClassId: bestId });
        message.success(`已切换到「${bestName}」`);
      } else if (bestId) {
        message.warning(`最接近的类别是「${bestName}」（颜色距离 ${bestDist.toFixed(0)}），请检查 mask 颜色`);
      }
    },
    [classes, setAnnotationState],
  );

  // 鼠标按下
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (tool === 'pan') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      return;
    }
    
    const pos = getCanvasCoords(e);
    
    if (tool === 'polygon') {
      // 多边形模式：点击添加顶点
      if (polygonPoints.length > 0) {
        const first = polygonPoints[0];
        const dist = Math.sqrt((pos.x - first.x) ** 2 + (pos.y - first.y) ** 2);
        // 双击起点附近闭合多边形
        if (dist < 15 && polygonPoints.length >= 3) {
          finishPolygon(polygonPoints);
          setPolygonPoints([]);
          return;
        }
      }
      setPolygonPoints(prev => [...prev, pos]);
      return;
    }
    
    if (tool === 'fill') {
      floodFill(pos.x, pos.y);
      return;
    }

    if (tool === 'rectangle') {
      setRectStart(pos);
      setIsDrawing(true);
      return;
    }

    if (tool === 'eyedropper') {
      eyedropPickClass(pos.x, pos.y);
      return;
    }
    
    setIsDrawing(true);
    setLastPos(pos);
    
    if (tool === 'brush' || tool === 'eraser') {
      drawCircle(pos.x, pos.y, tool === 'eraser');
    }
  }, [tool, getCanvasCoords, drawCircle, panOffset, polygonPoints, finishPolygon, floodFill, eyedropPickClass]);

  // 鼠标移动
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning && panStart) {
      setAnnotationState({
        panOffset: {
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        }
      });
      return;
    }

    const pos = getCanvasCoords(e);

    // 实时记录鼠标像素坐标 + hover 类别（节流：只每 60ms 更新一次）
    const now = Date.now();
    if (now - hoverThrottleRef.current > 50) {
      hoverThrottleRef.current = now;
      const annotationCanvas = annotationCanvasRef.current;
      let hoverName: string | null = null;
      if (annotationCanvas) {
        const ctx = annotationCanvas.getContext('2d');
        if (ctx) {
          const sx = Math.round(pos.x);
          const sy = Math.round(pos.y);
          if (sx >= 0 && sx < annotationCanvas.width && sy >= 0 && sy < annotationCanvas.height) {
            const data = ctx.getImageData(sx, sy, 1, 1).data;
            if (data[3] >= 50) {
              let bestDist = Infinity;
              classes.forEach((c) => {
                const d = Math.sqrt(
                  (data[0] - c.color[0]) ** 2 +
                  (data[1] - c.color[1]) ** 2 +
                  (data[2] - c.color[2]) ** 2,
                );
                if (d < bestDist) {
                  bestDist = d;
                  if (d < 60) hoverName = c.name;
                }
              });
            }
          }
        }
      }
      setAnnotationState({
        cursorPos: { x: Math.round(pos.x), y: Math.round(pos.y) },
        cursorClassName: hoverName,
      });
    }

    // 矩形预览（拖曳中）
    if (tool === 'rectangle' && isDrawing && rectStart) {
      drawRectanglePreview(rectStart, pos);
      return;
    }
    
    // 笔刷光标预览（在 overlay canvas 上绘制）
    if (tool === 'brush' || tool === 'eraser') {
      const overlay = overlayCanvasRef.current;
      if (overlay) {
        const ctx = overlay.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          const r = brushSize / 2;
          // 1) 实心淡色填充（提示笔触）
          if (tool === 'eraser') {
            ctx.fillStyle = 'rgba(255, 71, 87, 0.18)';
          } else {
            const color = getSelectedClassColor();
            ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.20)`;
          }
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          ctx.fill();
          // 2) 外圈边框
          if (tool === 'eraser') {
            ctx.strokeStyle = 'rgba(255, 71, 87, 0.95)';
            ctx.setLineDash([5, 4]);
          } else {
            const color = getSelectedClassColor();
            ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.95)`;
            ctx.setLineDash([]);
          }
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.setLineDash([]);
          // 3) 中心十字十字（精确定位）
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 1;
          const ch = 4;
          ctx.beginPath();
          ctx.moveTo(pos.x - ch, pos.y);
          ctx.lineTo(pos.x + ch, pos.y);
          ctx.moveTo(pos.x, pos.y - ch);
          ctx.lineTo(pos.x, pos.y + ch);
          ctx.stroke();
        }
      }
    }

    // 吸管光标：显示一个带十字的圆
    if (tool === 'eyedropper') {
      const overlay = overlayCanvasRef.current;
      if (overlay) {
        const ctx = overlay.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          ctx.strokeStyle = 'rgba(116, 247, 253, 0.9)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(pos.x - 18, pos.y);
          ctx.lineTo(pos.x - 6, pos.y);
          ctx.moveTo(pos.x + 6, pos.y);
          ctx.lineTo(pos.x + 18, pos.y);
          ctx.moveTo(pos.x, pos.y - 18);
          ctx.lineTo(pos.x, pos.y - 6);
          ctx.moveTo(pos.x, pos.y + 6);
          ctx.lineTo(pos.x, pos.y + 18);
          ctx.stroke();
        }
      }
    }
    
    // 多边形预览
    if (tool === 'polygon' && polygonPoints.length > 0) {
      drawPolygonPreview(polygonPoints, pos);
      return;
    }
    
    if (!isDrawing || !lastPos) return;
    if (tool !== 'brush' && tool !== 'eraser') return;
    
    drawLine(lastPos, pos, tool === 'eraser');
    setLastPos(pos);
  }, [isPanning, panStart, isDrawing, lastPos, tool, getCanvasCoords, drawLine, setAnnotationState, polygonPoints, drawPolygonPreview, brushSize, getSelectedClassColor, rectStart, drawRectanglePreview, classes]);

  // 鼠标抬起
  const handleMouseUp = useCallback((e?: React.MouseEvent) => {
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
      return;
    }
    // 矩形：松开提交
    if (tool === 'rectangle' && rectStart && e) {
      const end = getCanvasCoords(e);
      finishRectangle(rectStart, end);
      setRectStart(null);
      setIsDrawing(false);
      return;
    }
    if (isDrawing) {
      saveToHistory();
    }
    setIsDrawing(false);
    setLastPos(null);
  }, [isPanning, isDrawing, saveToHistory, tool, rectStart, getCanvasCoords, finishRectangle]);

  // 鼠标离开画布
  const handleMouseLeave = useCallback(() => {
    // 清除光标预览
    const overlay = overlayCanvasRef.current;
    if (overlay) {
      const ctx = overlay.getContext('2d');
      ctx?.clearRect(0, 0, overlay.width, overlay.height);
    }
    // 清除 hover 状态
    setAnnotationState({ cursorPos: null, cursorClassName: null });
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
      return;
    }
    if (tool === 'rectangle' && rectStart) {
      // 在画布外松开，丢弃
      setRectStart(null);
      setIsDrawing(false);
      return;
    }
    if (isDrawing) {
      saveToHistory();
    }
    setIsDrawing(false);
    setLastPos(null);
  }, [isPanning, isDrawing, saveToHistory, tool, rectStart, setAnnotationState]);

  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, zoom * delta));
    setAnnotationState({ zoom: newZoom });
  }, [zoom, setAnnotationState]);

  // 导出 mask 数据
  const exportMask = useCallback((): string | null => {
    const annotationCanvas = annotationCanvasRef.current;
    if (!annotationCanvas) return null;
    
    const ctx = annotationCanvas.getContext('2d');
    if (!ctx) return null;
    
    const imageData = ctx.getImageData(0, 0, annotationCanvas.width, annotationCanvas.height);
    
    // 创建灰度 mask
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = annotationCanvas.width;
    maskCanvas.height = annotationCanvas.height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return null;
    
    const maskData = maskCtx.createImageData(annotationCanvas.width, annotationCanvas.height);
    const palette: [number, number, number][] = [[0, 0, 0], ...classes.map(c => c.color)];
    
    // 将彩色标注转换为类别索引
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const a = imageData.data[i + 3];
      
      if (a < 50) {
        // 透明区域为背景
        maskData.data[i] = 0;
        maskData.data[i + 1] = 0;
        maskData.data[i + 2] = 0;
        maskData.data[i + 3] = 255;
      } else {
        // 找到最接近的类别颜色
        let minDist = Infinity;
        let classIndex = 0;
        
        for (let j = 0; j < palette.length; j++) {
          const [pr, pg, pb] = palette[j];
          const dist = Math.sqrt((r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2);
          if (dist < minDist) {
            minDist = dist;
            classIndex = j;
          }
        }
        
        maskData.data[i] = classIndex;
        maskData.data[i + 1] = classIndex;
        maskData.data[i + 2] = classIndex;
        maskData.data[i + 3] = 255;
      }
    }
    
    maskCtx.putImageData(maskData, 0, 0);
    return maskCanvas.toDataURL('image/png');
  }, [classes]);

  // 保存标注
  const handleSave = useCallback(() => {
    const maskDataUrl = exportMask();
    if (maskDataUrl && onSave) {
      onSave(maskDataUrl);
      message.success('标注已保存');
    }
  }, [exportMask, onSave]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        } else if (e.key === 'y') {
          e.preventDefault();
          redo();
        } else if (e.key === 's') {
          e.preventDefault();
          handleSave();
        }
      } else {
        switch (e.key) {
          case 'b':
            setAnnotationState({ tool: 'brush' });
            break;
          case 'e':
            setAnnotationState({ tool: 'eraser' });
            break;
          case 'p':
            setAnnotationState({ tool: 'polygon' });
            break;
          case 'r':
            setAnnotationState({ tool: 'rectangle' });
            break;
          case 'f':
            setAnnotationState({ tool: 'fill' });
            break;
          case 'i':
            setAnnotationState({ tool: 'eyedropper' });
            break;
          case 'h':
          case ' ':
            setAnnotationState({ tool: 'pan' });
            break;
          case '[':
            setAnnotationState({ brushSize: Math.max(1, brushSize - 5) });
            break;
          case ']':
            setAnnotationState({ brushSize: Math.min(100, brushSize + 5) });
            break;
          case 'Escape':
            if (polygonPoints.length > 0) {
              setPolygonPoints([]);
              const overlay = overlayCanvasRef.current;
              if (overlay) {
                const ctx = overlay.getContext('2d');
                ctx?.clearRect(0, 0, overlay.width, overlay.height);
              }
            }
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, handleSave, setAnnotationState, brushSize, polygonPoints]);

  // 渲染光标预览
  const renderCursor = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }, []);

  useEffect(() => {
    renderCursor();
  }, [renderCursor]);

  return (
    <div className="annotation-editor">
      {/* 工具栏 */}
      <ToolBar
        tool={tool}
        brushSize={brushSize}
        fillTolerance={annotationState.fillTolerance}
        onToolChange={(t) => setAnnotationState({ tool: t })}
        onBrushSizeChange={(size) => setAnnotationState({ brushSize: size })}
        onFillToleranceChange={(t) => setAnnotationState({ fillTolerance: t })}
        onUndo={undo}
        onRedo={redo}
        onSave={handleSave}
        onAIDiagnose={taskId ? () => setAiDiagnoseOpen(true) : undefined}
        onRevertRefine={taskId ? handleRevertRefine : undefined}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        canRevertRefine={canRevertRefine}
      />
      
      <div className="annotation-workspace">
        {/* 类别面板 */}
        <ClassPanel
          classes={classes}
          selectedClassId={selectedClassId}
          onSelectClass={(id) => setAnnotationState({ selectedClassId: id })}
          onRefineClass={
            taskId
              ? (cls, classIndex) => setRefineTarget({ cls, index: classIndex })
              : undefined
          }
        />
        
        {/* Canvas 容器 */}
        <div 
          className="canvas-container"
          ref={containerRef}
          onWheel={handleWheel}
        >
          <div 
            className="canvas-wrapper"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            {/* 原图层 */}
            <canvas
              ref={imageCanvasRef}
              className="image-canvas"
              style={{
                opacity: showOriginal ? 1 : 0,
              }}
            />
            
            {/* 标注层 */}
            <canvas
              ref={annotationCanvasRef}
              className="annotation-canvas"
              style={{
                opacity: showAnnotation ? opacity : 0,
                cursor:
                  tool === 'pan'
                    ? isPanning ? 'grabbing' : 'grab'
                    : tool === 'eyedropper'
                      ? 'cell'
                      : tool === 'fill'
                        ? 'copy'
                        : tool === 'rectangle'
                          ? 'crosshair'
                          : tool === 'brush' || tool === 'eraser'
                            ? 'none'  // 隐藏系统光标，由 overlay 自定义绘制
                            : 'crosshair',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            />
            
            {/* 光标预览层 */}
            <canvas
              ref={overlayCanvasRef}
              className="overlay-canvas"
              width={canvasSize.width}
              height={canvasSize.height}
            />
          </div>
          
          {!imagesLoaded && (
            <div className="loading-overlay">
              <div className="loading-spinner" />
              <span>加载中...</span>
            </div>
          )}
        </div>
        
        {/* 图层面板 */}
        <LayerPanel
          showOriginal={showOriginal}
          showAnnotation={showAnnotation}
          opacity={opacity}
          zoom={zoom}
          onToggleOriginal={() => setAnnotationState({ showOriginal: !showOriginal })}
          onToggleAnnotation={() => setAnnotationState({ showAnnotation: !showAnnotation })}
          onOpacityChange={(val) => setAnnotationState({ opacity: val })}
          onZoomChange={(val) => setAnnotationState({ zoom: val })}
        />
      </div>
      
      {/* 状态栏 - 终端风 */}
      <div className="status-bar">
        <span>
          <span className="status-key">ZOOM</span>
          <span className="status-val">{Math.round(zoom * 100)}%</span>
        </span>
        <span>
          <span className="status-key">TOOL</span>
          <span className="status-val">
            {tool === 'brush' ? '画笔' :
              tool === 'eraser' ? '橡皮擦' :
              tool === 'polygon' ? `多边形 (${polygonPoints.length}点)` :
              tool === 'rectangle' ? '矩形' :
              tool === 'fill' ? `填充 (容差 ${annotationState.fillTolerance})` :
              tool === 'eyedropper' ? '吸管' : '平移'}
          </span>
        </span>
        <span>
          <span className="status-key">BRUSH</span>
          <span className="status-val">{brushSize}px</span>
        </span>
        <span>
          <span className="status-key">SIZE</span>
          <span className="status-val">{imageSize.width} × {imageSize.height}</span>
        </span>
        {annotationState.cursorPos && (
          <span>
            <span className="status-key">XY</span>
            <span className="status-pixel">
              ({annotationState.cursorPos.x}, {annotationState.cursorPos.y})
            </span>
          </span>
        )}
        {annotationState.cursorClassName && (
          <span>
            <span className="status-key">HOVER</span>
            <span className="status-class-chip">
              <span
                className="status-class-dot"
                style={{
                  background: (() => {
                    const c = classes.find((x) => x.name === annotationState.cursorClassName);
                    return c ? `rgb(${c.color[0]}, ${c.color[1]}, ${c.color[2]})` : '#888';
                  })(),
                }}
              />
              {annotationState.cursorClassName}
            </span>
          </span>
        )}
        {selectedClassId && (
          <span>
            <span className="status-key">CLASS</span>
            <span className="status-class-chip">
              <span
                className="status-class-dot"
                style={{
                  background: (() => {
                    const c = classes.find((x) => x.id === selectedClassId);
                    return c ? `rgb(${c.color[0]}, ${c.color[1]}, ${c.color[2]})` : '#888';
                  })(),
                }}
              />
              {classes.find((c) => c.id === selectedClassId)?.name || '未选择'}
            </span>
          </span>
        )}
      </div>

      {/* 类别精修对话框 */}
      <RefineClassModal
        open={!!refineTarget}
        taskId={taskId || null}
        targetClass={refineTarget?.cls || null}
        classIndex={refineTarget?.index || 0}
        onCancel={() => setRefineTarget(null)}
        onCompleted={() => {
          setRefineTarget(null);
          setMaskReloadKey((k) => k + 1);
          message.success('精修结果已应用，画布已更新');
        }}
      />

      {/* AI 视觉诊断对话框 */}
      <AIDiagnoseModal
        open={aiDiagnoseOpen}
        taskId={taskId || null}
        onCancel={() => setAiDiagnoseOpen(false)}
        onApplied={(action) => {
          if (action.kind === 'rerun') {
            const switchTo = action.payload?.switch_to;
            if (switchTo) {
              message.success(
                `新预测已完成（task_id=${switchTo}），即将切换到新结果`
              );
              // 通过 hash 通知父组件切换 currentTask
              window.dispatchEvent(
                new CustomEvent('rs:switch-task', { detail: { taskId: switchTo } }),
              );
            }
          } else if (action.kind === 'refine') {
            // 精修已经完成（modal 内部已轮询），立即重载 mask
            setMaskReloadKey((k) => k + 1);
          }
        }}
      />
    </div>
  );
};

export default AnnotationEditor;
