/**
 * ToolBar - 标注工具栏（v2 升级版）
 * 
 * 改进点：
 *   - 7 个工具：brush / eraser / polygon / rectangle / fill / eyedropper / pan
 *   - 统一 FontAwesome 图标，选中时呼吸光晕动画
 *   - 工具分组：绘制 | 形状 | 智能 | 移动
 *   - 笔刷大小有视觉刻度，hover 出现快捷键提示
 *   - Fill 工具加 tolerance 调节
 *   - "?" 浮层显示完整快捷键列表
 */
import React, { useState, useEffect } from 'react';
import { Slider, Tooltip, Popover } from 'antd';
import {
  UndoOutlined,
  RedoOutlined,
  SaveOutlined,
  RobotOutlined,
  RollbackOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { AnnotationTool } from '../../stores/appStore';

interface ToolBarProps {
  tool: AnnotationTool;
  brushSize: number;
  fillTolerance?: number;
  onToolChange: (tool: AnnotationTool) => void;
  onBrushSizeChange: (size: number) => void;
  onFillToleranceChange?: (tol: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onAIDiagnose?: () => void;
  onRevertRefine?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canRevertRefine?: boolean;
}

interface ToolDef {
  id: AnnotationTool;
  icon: string;          // FontAwesome class
  label: string;
  shortcut: string;
  group: 'paint' | 'shape' | 'smart' | 'nav';
  desc: string;
}

const TOOLS: ToolDef[] = [
  { id: 'brush',      icon: 'fa-solid fa-paintbrush',     label: '画笔',     shortcut: 'B', group: 'paint', desc: '按住拖动，绘制选中类别（笔刷大小可调）' },
  { id: 'eraser',     icon: 'fa-solid fa-eraser',         label: '橡皮擦',   shortcut: 'E', group: 'paint', desc: '按住拖动，擦除标注（变为背景）' },
  { id: 'polygon',    icon: 'fa-solid fa-draw-polygon',   label: '多边形',   shortcut: 'P', group: 'shape', desc: '点击添加顶点，靠近起点闭合填充' },
  { id: 'rectangle',  icon: 'fa-solid fa-vector-square',  label: '矩形',     shortcut: 'R', group: 'shape', desc: '拖曳画矩形并填充，建筑/田块友好' },
  { id: 'fill',       icon: 'fa-solid fa-fill-drip',      label: '油漆桶',   shortcut: 'F', group: 'smart', desc: '点击区域填充连通像素（容差可调）' },
  { id: 'eyedropper', icon: 'fa-solid fa-eye-dropper',    label: '吸管',     shortcut: 'I', group: 'smart', desc: '点击 mask 拾取该位置的类别并切换' },
  { id: 'pan',        icon: 'fa-solid fa-up-down-left-right', label: '平移', shortcut: 'H', group: 'nav',   desc: '拖动整个画布，配合滚轮缩放' },
];

const GROUP_TITLE: Record<ToolDef['group'], string> = {
  paint: '绘制',
  shape: '形状',
  smart: '智能',
  nav: '移动',
};

const ToolBar: React.FC<ToolBarProps> = ({
  tool,
  brushSize,
  fillTolerance = 32,
  onToolChange,
  onBrushSizeChange,
  onFillToleranceChange,
  onUndo,
  onRedo,
  onSave,
  onAIDiagnose,
  onRevertRefine,
  canUndo,
  canRedo,
  canRevertRefine,
}) => {
  // 快捷键监听
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      const tdef = TOOLS.find((t) => t.shortcut.toLowerCase() === k);
      if (tdef) {
        e.preventDefault();
        onToolChange(tdef.id);
      }
      if (k === '?') {
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onToolChange]);

  const renderToolGroup = (group: ToolDef['group']) => {
    const groupTools = TOOLS.filter((t) => t.group === group);
    return (
      <div className="toolbar-group" key={group} title={GROUP_TITLE[group]}>
        {groupTools.map((t) => (
          <Tooltip
            key={t.id}
            title={
              <div style={{ minWidth: 120 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>
                  {t.label} <span style={{ float: 'right', opacity: 0.6, fontSize: 10 }}>[{t.shortcut}]</span>
                </div>
                <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.5 }}>{t.desc}</div>
              </div>
            }
            placement="bottom"
            color="rgba(5, 50, 106, 0.96)"
          >
            <button
              className={`toolbar-btn ${tool === t.id ? 'active' : ''}`}
              onClick={() => onToolChange(t.id)}
            >
              <i className={t.icon} />
              {tool === t.id && <span className="toolbar-btn-pulse" />}
            </button>
          </Tooltip>
        ))}
      </div>
    );
  };

  return (
    <div className="annotation-toolbar">
      {/* 工具分组 */}
      {renderToolGroup('paint')}
      <div className="toolbar-divider" />
      {renderToolGroup('shape')}
      <div className="toolbar-divider" />
      {renderToolGroup('smart')}
      <div className="toolbar-divider" />
      {renderToolGroup('nav')}

      <div className="toolbar-divider" />

      {/* 笔刷大小（仅绘制工具显示） */}
      {(tool === 'brush' || tool === 'eraser') && (
        <div className="brush-size-control">
          <Tooltip title="笔刷大小（[ 减小 / ] 增大）" placement="bottom">
            <span className="brush-size-label">
              <i className="fa-solid fa-circle" style={{ fontSize: Math.min(brushSize / 4, 14), opacity: 0.7 }} />
              <span style={{ marginLeft: 6 }}>{brushSize}px</span>
            </span>
          </Tooltip>
          <Slider
            className="brush-size-slider"
            min={1}
            max={100}
            value={brushSize}
            onChange={onBrushSizeChange}
            tooltip={{ formatter: (v) => `${v}px` }}
          />
        </div>
      )}

      {/* Fill 容差（仅 fill 工具显示） */}
      {tool === 'fill' && onFillToleranceChange && (
        <div className="brush-size-control">
          <Tooltip title="颜色容差：值越大，填充范围越广（基于 RGB 距离）" placement="bottom">
            <span className="brush-size-label">
              <i className="fa-solid fa-droplet" style={{ opacity: 0.7 }} />
              <span style={{ marginLeft: 6 }}>容差 {fillTolerance}</span>
            </span>
          </Tooltip>
          <Slider
            className="brush-size-slider"
            min={0}
            max={100}
            value={fillTolerance}
            onChange={onFillToleranceChange}
            tooltip={{ formatter: (v) => `${v}` }}
          />
        </div>
      )}

      {/* Polygon 提示 */}
      {tool === 'polygon' && (
        <div className="tool-hint">
          <i className="fa-solid fa-circle-info" /> 点击放置顶点，靠近起点闭合（≥3 点）
        </div>
      )}

      {/* Rectangle 提示 */}
      {tool === 'rectangle' && (
        <div className="tool-hint">
          <i className="fa-solid fa-circle-info" /> 按住左键拖曳画矩形并填充
        </div>
      )}

      {/* Eyedropper 提示 */}
      {tool === 'eyedropper' && (
        <div className="tool-hint">
          <i className="fa-solid fa-circle-info" /> 点击图上像素，自动切换到对应类别
        </div>
      )}

      <div className="toolbar-divider" />

      {/* 撤销/重做 */}
      <div className="toolbar-group">
        <Tooltip title="撤销 (Ctrl+Z)" placement="bottom">
          <button className="toolbar-btn" onClick={onUndo} disabled={!canUndo}>
            <UndoOutlined />
          </button>
        </Tooltip>
        <Tooltip title="重做 (Ctrl+Shift+Z)" placement="bottom">
          <button className="toolbar-btn" onClick={onRedo} disabled={!canRedo}>
            <RedoOutlined />
          </button>
        </Tooltip>
      </div>

      {/* 快捷键帮助 */}
      <Popover
        open={helpOpen}
        onOpenChange={setHelpOpen}
        trigger="click"
        placement="bottomRight"
        color="rgba(5,50,106,0.96)"
        content={
          <div style={{ minWidth: 280, color: '#fff' }}>
            <div style={{ fontFamily: "'DouyuFont', sans-serif", fontSize: 14, color: '#74f7fd', marginBottom: 10, letterSpacing: 1 }}>
              ⌨ 快捷键速查
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4, fontSize: 11, fontFamily: "'SarasaMonoSC', monospace" }}>
              {TOOLS.map((t) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span><i className={t.icon} style={{ width: 18, color: '#74f7fd' }} /> {t.label}</span>
                  <kbd style={kbdStyle}>{t.shortcut}</kbd>
                </div>
              ))}
              <div style={dividerStyle} />
              <Row label="撤销 / 重做"><kbd style={kbdStyle}>Ctrl+Z</kbd> / <kbd style={kbdStyle}>Ctrl+Shift+Z</kbd></Row>
              <Row label="笔刷增大 / 减小"><kbd style={kbdStyle}>]</kbd> / <kbd style={kbdStyle}>[</kbd></Row>
              <Row label="保存标注"><kbd style={kbdStyle}>Ctrl+S</kbd></Row>
              <Row label="切换平移（临时）"><kbd style={kbdStyle}>Space</kbd> 按住</Row>
              <Row label="放大 / 缩小"><kbd style={kbdStyle}>滚轮</kbd></Row>
            </div>
          </div>
        }
      >
        <Tooltip title="快捷键帮助 (?)" placement="bottom">
          <button className="toolbar-btn" onClick={() => setHelpOpen((v) => !v)}>
            <QuestionCircleOutlined />
          </button>
        </Tooltip>
      </Popover>

      <div style={{ flex: 1 }} />

      {/* 撤销精修按钮 */}
      {onRevertRefine && (
        <Tooltip
          title={canRevertRefine ? '撤销最近一次专用模型精修，恢复到精修前的 mask' : '当前没有可撤销的精修'}
          placement="bottom"
        >
          <button
            className="ai-action-btn revert-btn"
            onClick={onRevertRefine}
            disabled={!canRevertRefine}
          >
            <RollbackOutlined />
            <span>撤销精修</span>
          </button>
        </Tooltip>
      )}

      {/* AI 诊断按钮 */}
      {onAIDiagnose && (
        <Tooltip title="使用 GPT 视觉模型分析当前结果，给出修正建议" placement="bottom">
          <button className="ai-action-btn diagnose-btn" onClick={onAIDiagnose}>
            <RobotOutlined />
            <span>AI 智能诊断</span>
          </button>
        </Tooltip>
      )}

      {/* 保存按钮 */}
      <Tooltip title="保存标注 (Ctrl+S)" placement="bottom">
        <button className="save-btn" onClick={onSave}>
          <SaveOutlined />
          <span>保存标注</span>
        </button>
      </Tooltip>
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
    <span>{label}</span>
    <span>{children}</span>
  </div>
);

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  minWidth: 22,
  padding: '1px 5px',
  margin: '0 2px',
  background: 'rgba(116,247,253,0.12)',
  border: '1px solid rgba(116,247,253,0.4)',
  borderRadius: 4,
  fontSize: 10,
  fontFamily: 'monospace',
  textAlign: 'center',
  color: '#74f7fd',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'rgba(116,247,253,0.15)',
  margin: '6px 0',
};

export default ToolBar;
