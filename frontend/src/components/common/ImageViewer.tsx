/**
 * 可拖动缩放的图片查看器组件
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Space, Tooltip } from 'antd';
import { 
  ZoomInOutlined, 
  ZoomOutOutlined, 
  FullscreenOutlined,
  UndoOutlined,
  DragOutlined
} from '@ant-design/icons';

interface ImageViewerProps {
  src: string;
  alt?: string;
  style?: React.CSSProperties;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ src, alt = 'Preview', style }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.min(Math.max(0.1, prev + delta), 5));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(prev + 0.25, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prev => Math.max(prev - 0.25, 0.1));
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
    if (!isFullscreen) {
      handleReset();
    }
  }, [isFullscreen, handleReset]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFullscreen && e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const containerStyle: React.CSSProperties = isFullscreen ? {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    background: 'rgba(0, 0, 0, 0.95)',
    display: 'flex',
    flexDirection: 'column',
  } : {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
    border: '2px solid rgba(0, 240, 255, 0.2)',
    background: 'rgba(10, 10, 20, 0.8)',
    ...style,
  };

  return (
    <div style={containerStyle}>
      {/* 工具栏 */}
      <div style={{
        position: isFullscreen ? 'fixed' : 'absolute',
        top: isFullscreen ? 20 : 10,
        right: isFullscreen ? 20 : 10,
        zIndex: 10,
        display: 'flex',
        gap: 8,
      }}>
        <div style={{
          background: 'rgba(10, 10, 20, 0.9)',
          backdropFilter: 'blur(10px)',
          borderRadius: 8,
          padding: '6px 12px',
          border: '1px solid rgba(0, 240, 255, 0.2)',
        }}>
          <Space size={4}>
            <Tooltip title="缩小">
              <Button 
                type="text" 
                icon={<ZoomOutOutlined />} 
                onClick={handleZoomOut}
                style={{ color: '#00f0ff' }}
              />
            </Tooltip>
            <span style={{ 
              color: '#00f0ff', 
              fontSize: 12, 
              fontFamily: 'JetBrains Mono',
              minWidth: 50,
              textAlign: 'center',
            }}>
              {Math.round(scale * 100)}%
            </span>
            <Tooltip title="放大">
              <Button 
                type="text" 
                icon={<ZoomInOutlined />} 
                onClick={handleZoomIn}
                style={{ color: '#00f0ff' }}
              />
            </Tooltip>
            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
            <Tooltip title="重置">
              <Button 
                type="text" 
                icon={<UndoOutlined />} 
                onClick={handleReset}
                style={{ color: '#8b5cf6' }}
              />
            </Tooltip>
            <Tooltip title={isFullscreen ? "退出全屏" : "全屏"}>
              <Button 
                type="text" 
                icon={<FullscreenOutlined />} 
                onClick={toggleFullscreen}
                style={{ color: '#00ff88' }}
              />
            </Tooltip>
          </Space>
        </div>
      </div>

      {/* 拖动提示 */}
      {scale > 1 && (
        <div style={{
          position: 'absolute',
          bottom: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.7)',
          padding: '4px 12px',
          borderRadius: 4,
          fontSize: 12,
          color: 'rgba(255,255,255,0.6)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <DragOutlined /> 按住鼠标拖动查看
        </div>
      )}

      {/* 图片容器 */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : (scale > 1 ? 'grab' : 'default'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: isFullscreen ? '100vh' : 300,
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            maxWidth: isFullscreen ? '90vw' : '100%',
            maxHeight: isFullscreen ? '90vh' : '100%',
            objectFit: 'contain',
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
            userSelect: 'none',
          }}
        />
      </div>

      {/* 全屏关闭按钮 */}
      {isFullscreen && (
        <div style={{
          position: 'fixed',
          bottom: 30,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
        }}>
          <Button 
            onClick={toggleFullscreen}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#fff',
            }}
          >
            按 ESC 或点击关闭
          </Button>
        </div>
      )}
    </div>
  );
};

export default ImageViewer;
