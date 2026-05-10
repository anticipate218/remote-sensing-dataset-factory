/**
 * ClassPanel - 类别选择面板
 * 每个类别支持点击选择 + 「精修」按钮（专用模型对该类别二次分割）
 */
import React from 'react';
import { Tooltip } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { ClassItem } from '../../stores/appStore';

interface ClassPanelProps {
  classes: ClassItem[];
  selectedClassId: string | null;
  onSelectClass: (id: string) => void;
  onRefineClass?: (cls: ClassItem, classIndex: number) => void;
}

const ClassPanel: React.FC<ClassPanelProps> = ({
  classes,
  selectedClassId,
  onSelectClass,
  onRefineClass,
}) => {
  return (
    <div className="class-panel">
      <div className="class-panel-title">类别</div>
      <div className="class-list">
        {classes.map((cls, index) => (
          <div
            key={cls.id}
            className={`class-item ${selectedClassId === cls.id ? 'selected' : ''}`}
            onClick={() => onSelectClass(cls.id)}
          >
            <div
              className="class-color"
              style={{
                backgroundColor: `rgb(${cls.color[0]}, ${cls.color[1]}, ${cls.color[2]})`,
              }}
            />
            <span className="class-name">{cls.name}</span>
            <span className="class-shortcut">{index + 1}</span>
            {onRefineClass && (
              <Tooltip title={`使用专用模型精修「${cls.name}」`} placement="left">
                <button
                  className="class-refine-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    // 类别在 mask 中的灰度索引 = index + 1（0 是背景）
                    onRefineClass(cls, index + 1);
                  }}
                  style={{
                    marginLeft: 'auto',
                    background: 'rgba(116, 247, 253, 0.08)',
                    border: '1px solid rgba(116, 247, 253, 0.18)',
                    borderRadius: 4,
                    color: '#74f7fd',
                    width: 22,
                    height: 22,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    padding: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(116, 247, 253, 0.2)';
                    e.currentTarget.style.borderColor = '#74f7fd';
                    e.currentTarget.style.boxShadow = '0 0 8px rgba(116, 247, 253, 0.35)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(116, 247, 253, 0.08)';
                    e.currentTarget.style.borderColor = 'rgba(116, 247, 253, 0.18)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <ThunderboltOutlined style={{ fontSize: 11 }} />
                </button>
              </Tooltip>
            )}
          </div>
        ))}
        
        {classes.length === 0 && (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            color: 'rgba(255, 255, 255, 0.4)',
            fontSize: '13px',
          }}>
            暂无类别
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassPanel;
