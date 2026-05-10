/**
 * useCanvasZoom - Canvas 缩放和平移 Hook
 */
import { useState, useCallback, useRef, useEffect } from 'react';

interface Position {
  x: number;
  y: number;
}

interface UseCanvasZoomReturn {
  zoom: number;
  panOffset: Position;
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: Position) => void;
  handleWheel: (e: React.WheelEvent) => void;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: () => void;
  resetView: () => void;
  fitToScreen: (containerSize: Position, imageSize: Position) => void;
  isPanning: boolean;
}

interface UseCanvasZoomOptions {
  minZoom?: number;
  maxZoom?: number;
  zoomStep?: number;
  initialZoom?: number;
  initialPanOffset?: Position;
}

export function useCanvasZoom(options: UseCanvasZoomOptions = {}): UseCanvasZoomReturn {
  const {
    minZoom = 0.1,
    maxZoom = 10,
    zoomStep = 0.1,
    initialZoom = 1,
    initialPanOffset = { x: 0, y: 0 },
  } = options;

  const [zoom, setZoomState] = useState(initialZoom);
  const [panOffset, setPanOffsetState] = useState<Position>(initialPanOffset);
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef<Position | null>(null);

  const setZoom = useCallback((newZoom: number) => {
    setZoomState(Math.max(minZoom, Math.min(maxZoom, newZoom)));
  }, [minZoom, maxZoom]);

  const setPanOffset = useCallback((offset: Position) => {
    setPanOffsetState(offset);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
    const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom + delta * zoom));
    
    // 缩放中心点（鼠标位置）
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // 计算新的平移偏移以保持鼠标位置不变
    const zoomRatio = newZoom / zoom;
    const newPanX = mouseX - (mouseX - panOffset.x) * zoomRatio;
    const newPanY = mouseY - (mouseY - panOffset.y) * zoomRatio;
    
    setZoomState(newZoom);
    setPanOffsetState({ x: newPanX, y: newPanY });
  }, [zoom, panOffset, minZoom, maxZoom, zoomStep]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // 中键或 Alt+左键开始平移
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !lastMousePos.current) return;
    
    const deltaX = e.clientX - lastMousePos.current.x;
    const deltaY = e.clientY - lastMousePos.current.y;
    
    setPanOffsetState((prev) => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY,
    }));
    
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    lastMousePos.current = null;
  }, []);

  const resetView = useCallback(() => {
    setZoomState(initialZoom);
    setPanOffsetState(initialPanOffset);
  }, [initialZoom, initialPanOffset]);

  const fitToScreen = useCallback((containerSize: Position, imageSize: Position) => {
    if (imageSize.x === 0 || imageSize.y === 0) return;
    
    const scaleX = containerSize.x / imageSize.x;
    const scaleY = containerSize.y / imageSize.y;
    const newZoom = Math.min(scaleX, scaleY, 1) * 0.9; // 留一点边距
    
    const newPanX = (containerSize.x - imageSize.x * newZoom) / 2;
    const newPanY = (containerSize.y - imageSize.y * newZoom) / 2;
    
    setZoomState(Math.max(minZoom, Math.min(maxZoom, newZoom)));
    setPanOffsetState({ x: newPanX, y: newPanY });
  }, [minZoom, maxZoom]);

  // 全局鼠标松开监听
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsPanning(false);
      lastMousePos.current = null;
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  return {
    zoom,
    panOffset,
    setZoom,
    setPanOffset,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    resetView,
    fitToScreen,
    isPanning,
  };
}

export default useCanvasZoom;
