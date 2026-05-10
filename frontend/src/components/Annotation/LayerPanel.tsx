/**
 * LayerPanel - 图层控制面板
 */
import React from 'react';
import { Slider, Switch } from 'antd';
import { EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';

interface LayerPanelProps {
  showOriginal: boolean;
  showAnnotation: boolean;
  opacity: number;
  zoom: number;
  onToggleOriginal: () => void;
  onToggleAnnotation: () => void;
  onOpacityChange: (value: number) => void;
  onZoomChange: (value: number) => void;
}

const LayerPanel: React.FC<LayerPanelProps> = ({
  showOriginal,
  showAnnotation,
  opacity,
  zoom,
  onToggleOriginal,
  onToggleAnnotation,
  onOpacityChange,
  onZoomChange,
}) => {
  return (
    <div className="layer-panel">
      <div className="layer-panel-title">图层</div>
      
      {/* 原图图层 */}
      <div className="layer-item">
        <span className="layer-label">原图</span>
        <div className="layer-control">
          <Switch
            size="small"
            checked={showOriginal}
            onChange={onToggleOriginal}
            checkedChildren={<EyeOutlined />}
            unCheckedChildren={<EyeInvisibleOutlined />}
          />
        </div>
      </div>
      
      {/* 标注图层 */}
      <div className="layer-item">
        <span className="layer-label">标注</span>
        <div className="layer-control">
          <Switch
            size="small"
            checked={showAnnotation}
            onChange={onToggleAnnotation}
            checkedChildren={<EyeOutlined />}
            unCheckedChildren={<EyeInvisibleOutlined />}
          />
        </div>
      </div>
      
      {/* 标注透明度 */}
      <div className="opacity-control">
        <div className="control-label">
          标注透明度: <span className="control-value">{Math.round(opacity * 100)}%</span>
        </div>
        <Slider
          min={0.1}
          max={1}
          step={0.05}
          value={opacity}
          onChange={onOpacityChange}
          tooltip={{ formatter: (v) => `${Math.round((v || 0) * 100)}%` }}
        />
      </div>
      
      {/* 缩放控制 */}
      <div className="zoom-control">
        <div className="control-label">
          缩放: <span className="control-value">{Math.round(zoom * 100)}%</span>
        </div>
        <Slider
          min={0.1}
          max={5}
          step={0.1}
          value={zoom}
          onChange={onZoomChange}
          tooltip={{ formatter: (v) => `${Math.round((v || 1) * 100)}%` }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <button
            style={{
              padding: '4px 8px',
              fontSize: 11,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
            }}
            onClick={() => onZoomChange(1)}
          >
            100%
          </button>
          <button
            style={{
              padding: '4px 8px',
              fontSize: 11,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
            }}
            onClick={() => onZoomChange(Math.min(5, zoom * 1.5))}
          >
            放大
          </button>
          <button
            style={{
              padding: '4px 8px',
              fontSize: 11,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
            }}
            onClick={() => onZoomChange(Math.max(0.1, zoom / 1.5))}
          >
            缩小
          </button>
        </div>
      </div>
    </div>
  );
};

export default LayerPanel;
