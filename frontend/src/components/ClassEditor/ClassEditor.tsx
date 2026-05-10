/**
 * RS Dataset Factory - 类别编辑器
 * 美观的卡片设计，遥感专用调色板，预设模板选择
 */
import React, { useState, useCallback, useEffect } from 'react';
import { 
  Card, Typography, Button, Space, Input, Tag, Tooltip,
  Row, Col, Popconfirm, message, Tabs, Alert, Modal
} from 'antd';
import { 
  PlusOutlined, DeleteOutlined, EditOutlined, 
  AppstoreOutlined, ArrowLeftOutlined,
  ArrowRightOutlined, CheckOutlined,
  StarOutlined, ThunderboltOutlined, SettingOutlined,
  BgColorsOutlined,
  GlobalOutlined, HomeOutlined, CloudOutlined, BulbOutlined,
  RobotOutlined, FilterOutlined, BookOutlined,
  InfoCircleOutlined, ExperimentOutlined,
} from '@ant-design/icons';
import { Spin, Progress } from 'antd';
import { HexColorPicker } from 'react-colorful';
import { motion, AnimatePresence } from 'framer-motion';
import { api, PresetConfig } from '../../services/api';
import { useAppStore, ClassItem, generateId, generateRandomColor } from '../../stores/appStore';
import WidgetPanel from '../MFLayout/WidgetPanel';

const { Title, Text } = Typography;

// 遥感专用调色板 - 按类别分组
const RS_PALETTES = {
  landcover: {
    name: '地物覆盖',
    icon: <GlobalOutlined />,
    colors: [
      { hex: '#006400', name: '森林', desc: '深绿色，适合森林/林地' },
      { hex: '#32CD32', name: '草地', desc: '浅绿色，适合草地/草原' },
      { hex: '#ADFF2F', name: '灌木', desc: '黄绿色，适合灌木/矮树' },
      { hex: '#228B22', name: '植被', desc: '森林绿，通用植被' },
      { hex: '#8B4513', name: '裸土', desc: '棕褐色，适合裸土/荒地' },
      { hex: '#DEB887', name: '沙地', desc: '浅棕色，适合沙地/沙漠' },
      { hex: '#FFD700', name: '农田', desc: '金黄色，适合农田/庄稼' },
      { hex: '#9ACD32', name: '水稻', desc: '黄绿色，适合水稻田' },
    ]
  },
  water: {
    name: '水体',
    icon: <CloudOutlined />,
    colors: [
      { hex: '#0000FF', name: '深水', desc: '深蓝色，适合深水区域' },
      { hex: '#1E90FF', name: '浅水', desc: '道奇蓝，适合浅水区域' },
      { hex: '#00CED1', name: '湖泊', desc: '青色，适合湖泊/池塘' },
      { hex: '#87CEEB', name: '河流', desc: '天蓝色，适合河流' },
      { hex: '#00BFFF', name: '水域', desc: '深天蓝，通用水体' },
      { hex: '#20B2AA', name: '湿地', desc: '浅海绿，适合湿地/沼泽' },
      { hex: '#5F9EA0', name: '港口', desc: '军蓝色，适合港口码头' },
      { hex: '#4682B4', name: '海洋', desc: '钢蓝色，适合海洋区域' },
    ]
  },
  urban: {
    name: '人工地物',
    icon: <HomeOutlined />,
    colors: [
      { hex: '#FF0000', name: '建筑', desc: '红色，适合建筑物屋顶' },
      { hex: '#DC143C', name: '住宅', desc: '深红色，适合居民区' },
      { hex: '#808080', name: '道路', desc: '灰色，适合道路/街道' },
      { hex: '#696969', name: '停车场', desc: '深灰色，适合停车场' },
      { hex: '#A9A9A9', name: '广场', desc: '银灰色，适合广场/硬化地面' },
      { hex: '#FF4500', name: '工业', desc: '橙红色，适合工业区' },
      { hex: '#FF6347', name: '商业', desc: '番茄色，适合商业区' },
      { hex: '#4B0082', name: '太阳能板', desc: '靛蓝色，适合光伏电站' },
    ]
  },
  infrastructure: {
    name: '基础设施',
    icon: <SettingOutlined />,
    colors: [
      { hex: '#FF8C00', name: '桥梁', desc: '深橙色，适合桥梁/立交' },
      { hex: '#FFD700', name: '跑道', desc: '金色，适合机场跑道' },
      { hex: '#00FF00', name: '铁路', desc: '亮绿色，适合铁路线' },
      { hex: '#FF1493', name: '船只', desc: '粉红色，适合船只/舰艇' },
      { hex: '#00FFFF', name: '车辆', desc: '青色，适合车辆' },
      { hex: '#FFFFFF', name: '温室', desc: '白色，适合温室大棚' },
      { hex: '#C0C0C0', name: '塔架', desc: '银色，适合电塔/信号塔' },
      { hex: '#800080', name: '其他', desc: '紫色，通用其他类别' },
    ]
  }
};

// 快捷颜色面板（通用颜色）
const QUICK_COLORS = [
  '#FF0000', '#FF4500', '#FF6347', '#FF7F50', '#FFA500', '#FFD700',
  '#FFFF00', '#ADFF2F', '#7CFC00', '#00FF00', '#32CD32', '#228B22',
  '#006400', '#00FA9A', '#00FFFF', '#00CED1', '#1E90FF', '#0000FF',
  '#0000CD', '#4B0082', '#8B008B', '#FF00FF', '#FF1493', '#C71585',
];

// 颜色选择器 Modal 组件
const ColorPickerModal: React.FC<{
  open: boolean;
  color: string;
  className?: string;
  onChange: (color: string) => void;
  onClose: () => void;
}> = ({ open, color, className: editClassName, onChange, onClose }) => {
  const [tempColor, setTempColor] = useState(color);
  const [activeTab, setActiveTab] = useState('picker');

  useEffect(() => { if (open) setTempColor(color); }, [open, color]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BgColorsOutlined style={{ color: '#74f7fd' }} />
          <span>颜色选择{editClassName ? ` — ${editClassName}` : ''}</span>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: tempColor, border: '2px solid rgba(255,255,255,0.3)',
            boxShadow: `0 0 12px ${tempColor}60`, marginLeft: 'auto',
          }} />
        </div>
      }
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="ok" type="primary" icon={<CheckOutlined />}
          onClick={() => { onChange(tempColor); onClose(); }}
          style={{ background: 'linear-gradient(135deg, #74f7fd 0%, #5bc7fa 100%)', border: 'none' }}>
          确定
        </Button>,
      ]}
      width={400}
      centered
      styles={{
        content: { background: 'rgba(5, 50, 106, 0.98)', border: '1px solid rgba(116, 247, 253, 0.2)' },
        header: { background: 'transparent', borderBottom: '1px solid rgba(255,255,255,0.08)' },
        footer: { borderTop: '1px solid rgba(255,255,255,0.08)' },
      }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        size="small"
        centered
        items={[
          {
            key: 'picker',
            label: '自定义',
            children: (
              <div style={{ padding: '8px 0' }}>
                <HexColorPicker color={tempColor} onChange={setTempColor} style={{ width: '100%', height: 160 }} />
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <Input value={tempColor} onChange={(e) => setTempColor(e.target.value)}
                    prefix={<div style={{ width: 14, height: 14, borderRadius: 3, background: tempColor }} />}
                    style={{ flex: 1 }} size="small" />
                </div>
                <div style={{ marginTop: 12 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, display: 'block', marginBottom: 6 }}>快捷选择</Text>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {QUICK_COLORS.map((c) => (
                      <div key={c} onClick={() => setTempColor(c)} style={{
                        width: 22, height: 22, borderRadius: 4, background: c, cursor: 'pointer',
                        border: tempColor.toUpperCase() === c.toUpperCase() ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                        boxShadow: tempColor.toUpperCase() === c.toUpperCase() ? `0 0 8px ${c}` : 'none',
                        transition: 'transform 0.1s',
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            ),
          },
          ...Object.entries(RS_PALETTES).map(([key, palette]) => ({
            key,
            label: <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{palette.icon} {palette.name}</span>,
            children: (
              <div style={{ padding: '8px 0', maxHeight: 280, overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {palette.colors.map((ci) => (
                    <div key={ci.hex} onClick={() => setTempColor(ci.hex)} style={{
                      padding: 10, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                      background: tempColor.toUpperCase() === ci.hex.toUpperCase() ? `${ci.hex}25` : 'rgba(255,255,255,0.03)',
                      border: tempColor.toUpperCase() === ci.hex.toUpperCase() ? `2px solid ${ci.hex}` : '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: ci.hex, border: '2px solid rgba(255,255,255,0.2)', boxShadow: `0 2px 8px ${ci.hex}40`, flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>{ci.name}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ci.hex}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ),
          })),
        ]}
      />
    </Modal>
  );
};

const rgbToHex = (rgb: [number, number, number]): string => {
  return '#' + rgb.map(x => x.toString(16).padStart(2, '0')).join('');
};

const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [128, 128, 128];
};

// 类别卡片组件 — 点击色块直接弹出 Modal 颜色选择器
const ClassCard: React.FC<{
  classItem: ClassItem;
  isEditing: boolean;
  onEdit: () => void;
  onOpenColorPicker: () => void;
  onUpdate: (updates: Partial<ClassItem>) => void;
  onDelete: () => void;
  index: number;
}> = ({ classItem, isEditing, onEdit, onOpenColorPicker, onUpdate, onDelete, index }) => {
  const colorHex = rgbToHex(classItem.color);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: -20 }}
      transition={{ delay: index * 0.05 }}
      layout
    >
      <motion.div
        whileHover={{ y: -4, boxShadow: `0 8px 24px ${colorHex}40` }}
        transition={{ type: 'spring', stiffness: 300 }}
        style={{
          width: 260,
          background: `linear-gradient(135deg, ${colorHex}15 0%, ${colorHex}05 100%)`,
          border: isEditing ? `2px solid ${colorHex}` : `1px solid ${colorHex}40`,
          borderRadius: 16, overflow: 'hidden', position: 'relative',
        }}
      >
        <div style={{ height: 4, background: `linear-gradient(90deg, ${colorHex} 0%, ${colorHex}80 100%)` }} />

        <div style={{ position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: 8, background: `${colorHex}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: colorHex }}>
          {index + 1}
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <Tooltip title="点击修改颜色">
              <motion.div
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.95 }}
                onClick={onOpenColorPicker}
                style={{
                  width: 36, height: 36, borderRadius: 10, backgroundColor: colorHex,
                  marginRight: 12, cursor: 'pointer',
                  border: '3px solid rgba(255,255,255,0.2)',
                  boxShadow: `0 4px 12px ${colorHex}60`,
                }}
              />
            </Tooltip>
            <div style={{ flex: 1 }}>
              {isEditing ? (
                <Input value={classItem.name} onChange={(e) => onUpdate({ name: e.target.value })}
                  style={{ fontWeight: 600, background: 'rgba(0,0,0,0.2)', border: 'none' }} placeholder="类别名称" />
              ) : (
                <Text strong style={{ fontSize: 16 }}>{classItem.name}</Text>
              )}
            </div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ThunderboltOutlined /> 提示词
            </div>
            {isEditing ? (
              <Input.TextArea value={classItem.prompt} onChange={(e) => onUpdate({ prompt: e.target.value })}
                autoSize={{ minRows: 2, maxRows: 4 }} style={{ background: 'rgba(0,0,0,0.2)', border: 'none', fontSize: 13 }}
                placeholder="用于模型识别的提示词" />
            ) : (
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', display: 'block' }} ellipsis={{ tooltip: classItem.prompt }}>
                {classItem.prompt}
              </Text>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button block size="small" icon={isEditing ? <CheckOutlined /> : <EditOutlined />} onClick={onEdit}
              style={{ flex: 1, borderRadius: 8, background: isEditing ? 'linear-gradient(135deg, #74fabd 0%, #00d4aa 100%)' : `${colorHex}20`, borderColor: isEditing ? '#74fabd' : `${colorHex}40`, color: isEditing ? '#0a0a0f' : colorHex }}>
              {isEditing ? '保存' : '编辑'}
            </Button>
            <Popconfirm title="确定删除此类别？" onConfirm={onDelete} okText="删除" cancelText="取消">
              <Button size="small" icon={<DeleteOutlined />}
                style={{ borderRadius: 8, background: 'rgba(255,71,87,0.1)', borderColor: 'rgba(255,71,87,0.3)', color: '#ff4757', width: 36 }} />
            </Popconfirm>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// 场景分组定义
const SCENE_GROUPS: Array<{
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}> = [
  { key: 'single',   label: '单类专用',   icon: <StarOutlined />,      color: '#74fabd', description: '聚焦 1 个目标类别（建筑/道路/水体...）' },
  { key: 'urban',    label: '城市场景',   icon: <HomeOutlined />,      color: '#5bc7fa', description: '城市/居民区高分辨率场景' },
  { key: 'rural',    label: '农村场景',   icon: <CloudOutlined />,     color: '#f0c040', description: '农村/农业地区' },
  { key: 'general',  label: '通用',       icon: <GlobalOutlined />,    color: '#74f7fd', description: '通用遥感场景' },
  { key: 'academic', label: '学术基准',   icon: <BookOutlined />,      color: '#a78bfa', description: '与公开数据集（LoveDA/iSAID/OpenEarthMap）对齐' },
];

// 预设模板卡片（增强版：含 icon / tags / hover 完整类别列表）
const PresetCard: React.FC<{
  presetKey: string;
  preset: PresetConfig;
  onLoad: () => void;
  highlight?: boolean;
}> = ({ preset, onLoad, highlight }) => {
  const sceneTag = (preset.scene_tag as string) || 'general';
  const group = SCENE_GROUPS.find((g) => g.key === sceneTag) || SCENE_GROUPS[3];
  const tags = preset.tags || [];

  // hover tooltip：完整类别列表
  const tooltipContent = (
    <div style={{ maxWidth: 320, fontSize: 12, lineHeight: 1.6 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#fff' }}>
        {preset.icon || group.icon} {preset.name}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.65)', marginBottom: 8 }}>
        {preset.description}
      </div>
      {preset.source && (
        <div style={{ color: 'rgba(116,250,189,0.85)', fontSize: 11, marginBottom: 8, fontStyle: 'italic' }}>
          📖 {preset.source}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {tags.map((t) => (
          <span key={t} style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 4,
            background: 'rgba(116,247,253,0.15)', border: '1px solid rgba(116,247,253,0.3)',
            color: '#74f7fd',
          }}>{t}</span>
        ))}
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 6 }}>
        <div style={{ fontWeight: 600, color: '#74f7fd', marginBottom: 4 }}>
          {preset.classes.length - 1} 个类别：
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
          {preset.classes.slice(1).map((cls, i) => (
            <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                background: `rgb(${(preset.palette[i + 1] || [128,128,128]).join(',')})`,
                border: '1px solid rgba(255,255,255,0.25)', flexShrink: 0,
              }} />
              <span style={{ color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cls}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement="right" overlayStyle={{ maxWidth: 360 }}>
      <motion.div
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={onLoad}
        style={{
          background: highlight
            ? `linear-gradient(135deg, ${group.color}22 0%, ${group.color}08 100%)`
            : 'linear-gradient(135deg, rgba(116, 247, 253, 0.06) 0%, rgba(91, 199, 250, 0.06) 100%)',
          border: highlight ? `1px solid ${group.color}66` : '1px solid rgba(116, 247, 253, 0.15)',
          borderRadius: 12,
          padding: 12,
          cursor: 'pointer',
          marginBottom: 10,
          boxShadow: highlight ? `0 0 14px ${group.color}30` : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `linear-gradient(135deg, ${group.color} 0%, ${group.color}88 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginRight: 10, fontSize: 16, color: '#0a0a0f', fontWeight: 700,
          }}>
            {preset.icon || group.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 600, fontSize: 13, color: '#fff',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {preset.name}
            </div>
            <div style={{ fontSize: 11, color: group.color, marginTop: 1 }}>
              {preset.classes.length - 1} 类 · {group.label}
            </div>
          </div>
        </div>
        {tags.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
            {tags.slice(0, 3).map((t) => (
              <span key={t} style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 3,
                background: 'rgba(0,0,0,0.25)', color: 'rgba(255,255,255,0.6)',
              }}>{t}</span>
            ))}
          </div>
        ) : null}
        {/* 颜色预览条 */}
        <div style={{ display: 'flex', gap: 3 }}>
          {preset.palette.slice(1, 9).map((color, i) => (
            <div
              key={i}
              style={{
                flex: 1, height: 14, borderRadius: 3,
                backgroundColor: `rgb(${color.join(',')})`,
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            />
          ))}
          {preset.palette.length > 9 && (
            <div style={{
              flex: 1, height: 14, borderRadius: 3,
              background: 'rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, color: 'rgba(255,255,255,0.5)',
            }}>
              +{preset.palette.length - 9}
            </div>
          )}
        </div>
      </motion.div>
    </Tooltip>
  );
};

// AI 识图预设预览 Modal
type AIRecommendResult = PresetConfig & {
  per_class_reasons?: Array<{ name: string; prompt: string; color: string; area_share: number; reason_cn: string }>;
  model?: string;
  usage?: { total_tokens?: number };
};

const AIPresetPreviewModal: React.FC<{
  open: boolean;
  loading: boolean;
  progress: number;
  progressLabel: string;
  result: AIRecommendResult | null;
  error: string | null;
  onClose: () => void;
  onApply: (preset: AIRecommendResult) => void;
  onRetry: () => void;
}> = ({ open, loading, progress, progressLabel, result, error, onClose, onApply, onRetry }) => {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <RobotOutlined style={{ color: '#74fabd', fontSize: 20 }} />
          <span style={{ fontFamily: "'DouyuFont', sans-serif", letterSpacing: 1 }}>
            AI 智能识图 · 预设生成
          </span>
          <Tag color="cyan" style={{ marginLeft: 'auto', fontSize: 10 }}>GPT-5.5 Vision</Tag>
        </div>
      }
      width={760}
      centered
      destroyOnClose
      styles={{
        content: { background: 'rgba(5, 50, 106, 0.98)', border: '1px solid rgba(116, 247, 253, 0.2)' },
        header: { background: 'transparent', borderBottom: '1px solid rgba(255,255,255,0.08)' },
        footer: { borderTop: '1px solid rgba(255,255,255,0.08)' },
      }}
      footer={
        loading
          ? null
          : error
            ? [
              <Button key="retry" onClick={onRetry} icon={<RobotOutlined />}>重试</Button>,
              <Button key="cancel" type="primary" onClick={onClose}>关闭</Button>,
            ]
            : result
              ? [
                <Button key="cancel" onClick={onClose}>取消</Button>,
                <Button key="retry" onClick={onRetry} icon={<RobotOutlined />}>重新识别</Button>,
                <Button key="apply" type="primary" icon={<CheckOutlined />}
                  onClick={() => onApply(result)}
                  style={{ background: 'linear-gradient(135deg, #74fabd, #00d4aa)', border: 'none', color: '#0a0a0f', fontWeight: 600 }}>
                  应用此预设（{(result.classes?.length || 1) - 1} 类）
                </Button>,
              ]
              : null
      }
    >
      {loading && (
        <div style={{ padding: '32px 16px', textAlign: 'center' }}>
          <Spin size="large" indicator={<RobotOutlined spin style={{ fontSize: 36, color: '#74fabd' }} />} />
          <div style={{ marginTop: 18, color: '#74fabd', fontSize: 14 }}>{progressLabel}</div>
          <Progress
            percent={progress}
            status="active"
            strokeColor={{ '0%': '#74f7fd', '100%': '#74fabd' }}
            showInfo
            style={{ marginTop: 12, maxWidth: 400, margin: '12px auto 0' }}
          />
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 8 }}>
            首次识别约 10–25 秒，请稍候…
          </div>
        </div>
      )}
      {!loading && error && (
        <Alert
          type="error" showIcon message="AI 识图失败"
          description={<pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 }}>{error}</pre>}
        />
      )}
      {!loading && !error && result && (
        <div>
          <Alert
            type="success" showIcon icon={<RobotOutlined />}
            message={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong>{result.name}</strong>
                {result.detected_scene && (
                  <Tag color="cyan" style={{ fontSize: 10 }}>场景：{result.detected_scene}</Tag>
                )}
                {typeof result.confidence === 'number' && (
                  <Tag color={result.confidence >= 0.7 ? 'green' : result.confidence >= 0.5 ? 'gold' : 'orange'} style={{ fontSize: 10 }}>
                    置信度 {(result.confidence * 100).toFixed(0)}%
                  </Tag>
                )}
                {result.model && <Tag color="purple" style={{ fontSize: 10 }}>{result.model}</Tag>}
              </div>
            }
            description={result.reasoning || result.description}
            style={{ marginBottom: 16, background: 'rgba(116, 250, 189, 0.06)', border: '1px solid rgba(116, 250, 189, 0.25)' }}
          />
          <div style={{ marginBottom: 8, color: 'rgba(255,255,255,0.55)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <BulbOutlined />
            识别到 <strong style={{ color: '#74fabd' }}>{(result.classes?.length || 1) - 1}</strong> 个有效类别（按面积占比降序）：
          </div>
          <div style={{
            maxHeight: 360, overflowY: 'auto', paddingRight: 4,
            background: 'rgba(0,0,0,0.18)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', padding: 12,
          }}>
            {(result.per_class_reasons || (result.classes || []).slice(1).map((nm, i) => ({
              name: nm,
              prompt: result.prompts?.[nm] || nm,
              color: rgbToHex(result.palette[i + 1] as [number, number, number]),
              area_share: 0,
              reason_cn: '',
            }))).map((c, i) => (
              <div key={c.name + i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '8px 0', borderBottom: '1px dashed rgba(255,255,255,0.08)',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: c.color, border: '2px solid rgba(255,255,255,0.2)',
                  boxShadow: `0 0 8px ${c.color}66`, flexShrink: 0, marginTop: 2,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <strong style={{ color: '#fff', fontSize: 14 }}>#{i + 1} {c.name}</strong>
                    {c.area_share > 0 && (
                      <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>
                        ≈ {Math.round(c.area_share)}% 面积
                      </Tag>
                    )}
                  </div>
                  <div style={{
                    fontSize: 12, color: 'rgba(116, 247, 253, 0.85)',
                    fontFamily: "'SarasaMonoSC', monospace", marginBottom: 3,
                  }}>
                    💬 {c.prompt}
                  </div>
                  {c.reason_cn && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' }}>
                      💡 {c.reason_cn}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {result.usage?.total_tokens != null && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>
              ⚡ 共消耗 {result.usage.total_tokens} tokens
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

const ClassEditor: React.FC = () => {
  const { 
    classes, setClasses, addClass, removeClass, updateClass,
    datasetName, setDatasetName, setCurrentStep, markStepCompleted,
    uploadedFile,
  } = useAppStore();

  const [presets, setPresets] = useState<Record<string, PresetConfig>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [colorPickerTarget, setColorPickerTarget] = useState<{ id: string; color: string; name: string } | null>(null);
  const [newClassName, setNewClassName] = useState('');
  const [newClassPrompt, setNewClassPrompt] = useState('');
  const [newClassColor, setNewClassColor] = useState<string | null>(null);
  // 预设过滤（all / single / urban / rural / general / academic）
  const [presetFilter, setPresetFilter] = useState<string>('all');
  // AI 识图相关
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiProgressLabel, setAiProgressLabel] = useState('');
  const [aiResult, setAiResult] = useState<AIRecommendResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    api.getPresets().then(setPresets).catch(console.error);
  }, []);

  const handleLoadPreset = useCallback((presetKey: string) => {
    const preset = presets[presetKey];
    if (!preset) return;

    const classItems: ClassItem[] = preset.classes.slice(1).map((name, index) => ({
      id: generateId(),
      name,
      prompt: preset.prompts[name] || name,
      color: preset.palette[index + 1] as [number, number, number],
    }));

    setClasses(classItems);
    message.success(`已加载预设模板: ${preset.name}`);
  }, [presets, setClasses]);

  // 应用 AI 推荐的预设
  const handleApplyAiPreset = useCallback((preset: AIRecommendResult) => {
    const classItems: ClassItem[] = preset.classes.slice(1).map((name, index) => ({
      id: generateId(),
      name,
      prompt: preset.prompts[name] || name,
      color: preset.palette[index + 1] as [number, number, number],
    }));
    setClasses(classItems);
    setAiOpen(false);
    message.success({
      content: `已应用 AI 识图预设：${preset.name}（${classItems.length} 类）`,
      duration: 4,
    });
  }, [setClasses]);

  // 触发 AI 识图
  const runAiRecommend = useCallback(async () => {
    const fileId = uploadedFile?.task_id;
    if (!fileId) {
      message.warning({
        content: '请先在「上传图像」步骤上传一张影像，再使用 AI 识图',
        duration: 4,
      });
      return;
    }
    setAiOpen(true);
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    setAiProgress(5);
    setAiProgressLabel('准备调用 GPT-5.5 Vision…');

    let progressTimer: ReturnType<typeof setInterval> | null = null;
    try {
      // 模拟进度（实际是后端单次调用，前端这里给视觉进度）
      let p = 5;
      progressTimer = setInterval(() => {
        if (p < 88) {
          p += Math.max(1, Math.round((90 - p) * 0.06));
          setAiProgress(p);
          if (p < 25) setAiProgressLabel('上传图像到视觉模型…');
          else if (p < 55) setAiProgressLabel('GPT-5.5 Vision 正在分析地物…');
          else if (p < 80) setAiProgressLabel('生成类别 / 提示词 / 配色方案…');
          else setAiProgressLabel('整理输出…');
        }
      }, 350);

      const result = await api.aiRecommendPreset(fileId);
      if (progressTimer) clearInterval(progressTimer);
      setAiProgress(100);
      setAiProgressLabel('完成！');
      setAiResult(result as AIRecommendResult);
    } catch (e: any) {
      if (progressTimer) clearInterval(progressTimer);
      const msg = e?.message || String(e);
      setAiError(msg);
      message.error(`AI 识图失败: ${msg}`);
    } finally {
      setAiLoading(false);
    }
  }, [uploadedFile?.task_id]);

  // 当前过滤后的预设列表
  const filteredPresetEntries = React.useMemo(() => {
    const entries = Object.entries(presets);
    if (presetFilter === 'all') return entries;
    return entries.filter(([_, p]) => (p.scene_tag || 'general') === presetFilter);
  }, [presets, presetFilter]);

  // 按场景分组（仅在 filter='all' 时使用）
  const groupedPresets = React.useMemo(() => {
    const out: Record<string, Array<[string, PresetConfig]>> = {};
    Object.entries(presets).forEach(([k, p]) => {
      const tag = (p.scene_tag as string) || 'general';
      if (!out[tag]) out[tag] = [];
      out[tag].push([k, p]);
    });
    return out;
  }, [presets]);

  const handleAddClass = useCallback(() => {
    if (!newClassName.trim()) {
      message.warning('请输入类别名称');
      return;
    }

    if (classes.some(c => c.name === newClassName.trim())) {
      message.warning('类别名称已存在');
      return;
    }

    addClass({
      id: generateId(),
      name: newClassName.trim(),
      prompt: newClassPrompt.trim() || newClassName.trim(),
      color: newClassColor ? hexToRgb(newClassColor) : generateRandomColor(),
    });

    setNewClassName('');
    setNewClassPrompt('');
    setNewClassColor(null);
    message.success('类别添加成功');
  }, [newClassName, newClassPrompt, newClassColor, classes, addClass]);

  const handleNext = useCallback(() => {
    if (classes.length === 0) {
      message.warning('请至少添加一个类别');
      return;
    }
    markStepCompleted('configure');
    setCurrentStep('predict');
  }, [classes, setCurrentStep, markStepCompleted]);

  return (
    <WidgetPanel title="类别配置" style={{ height: 'auto' }} bodyStyle={{ overflow: 'auto' }}>
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '40px 20px' }}>
      <Row gutter={28}>
        {/* 左侧面板 */}
        <Col span={7}>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            {/* 重要提示 */}
            {classes.length === 0 && (
              <Alert
                message="提示词质量直接影响预测效果"
                description={
                  <div style={{ fontSize: 12 }}>
                    <p style={{ margin: '4px 0' }}>
                      建议使用下方<strong style={{ color: '#74f7fd' }}>预设模板</strong>，已针对遥感场景优化提示词。
                    </p>
                    <p style={{ margin: '4px 0', color: 'rgba(255,255,255,0.6)' }}>
                      提示词应使用简洁的英文，如: "building roof", "road highway", "bare soil"
                    </p>
                  </div>
                }
                type="info"
                showIcon
                icon={<BulbOutlined />}
                style={{ 
                  marginBottom: 16, 
                  background: 'rgba(116, 247, 253, 0.1)', 
                  border: '1px solid rgba(116, 247, 253, 0.3)',
                  borderRadius: 12
                }}
              />
            )}
            
            {/* AI 智能识图 */}
            <Card
              className="glass-card"
              style={{ marginBottom: 16 }}
              styles={{ body: { padding: 14 } }}
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RobotOutlined style={{ color: '#74fabd' }} />
                  <span>AI 智能识图生成预设</span>
                  <Tag color="green" style={{ marginLeft: 'auto', fontSize: 10 }}>GPT-5.5 Vision</Tag>
                </div>
              }
            >
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 10, lineHeight: 1.6 }}>
                让 GPT-5.5 视觉模型阅读您上传的影像，自动识别其中可见的地物，
                生成<strong style={{ color: '#74fabd' }}>定制化</strong>的语义类别 / 提示词 / 配色。
              </div>
              <Tooltip
                title={!uploadedFile?.task_id ? '请先在「上传图像」步骤完成上传' : '约 10–25 秒，将打开预览面板'}
                placement="bottom"
              >
                <Button
                  block
                  size="middle"
                  icon={<RobotOutlined />}
                  onClick={runAiRecommend}
                  disabled={!uploadedFile?.task_id || aiLoading}
                  loading={aiLoading}
                  style={{
                    height: 38,
                    borderRadius: 9,
                    background: !uploadedFile?.task_id
                      ? 'rgba(255,255,255,0.05)'
                      : 'linear-gradient(135deg, #74fabd 0%, #00d4aa 100%)',
                    border: 'none',
                    boxShadow: !uploadedFile?.task_id ? 'none' : '0 4px 12px rgba(116, 250, 189, 0.3)',
                    color: !uploadedFile?.task_id ? 'rgba(255,255,255,0.4)' : '#0a0a0f',
                    fontWeight: 600,
                  }}
                >
                  {!uploadedFile?.task_id ? '需要先上传图像' : 'AI 识图 → 一键生成预设'}
                </Button>
              </Tooltip>
              {uploadedFile?.task_id && (
                <div style={{
                  marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.45)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <InfoCircleOutlined />
                  <span>当前图像：{uploadedFile.filename}</span>
                </div>
              )}
            </Card>

            {/* 预设模板 */}
            <Card 
              className="glass-card" 
              style={{ marginBottom: 20 }}
              styles={{ body: { padding: 14 } }}
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AppstoreOutlined style={{ color: '#74f7fd' }} />
                  <span>预设模板库</span>
                  <Tag color="cyan" style={{ marginLeft: 'auto', fontSize: 10 }}>
                    {Object.keys(presets).length} 套
                  </Tag>
                </div>
              }
            >
              {/* 场景过滤 chip */}
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10,
                paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <button
                  onClick={() => setPresetFilter('all')}
                  style={{
                    padding: '3px 10px', fontSize: 11, borderRadius: 12, cursor: 'pointer',
                    background: presetFilter === 'all'
                      ? 'linear-gradient(135deg, #74f7fd, #5bc7fa)'
                      : 'rgba(255,255,255,0.06)',
                    border: presetFilter === 'all' ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    color: presetFilter === 'all' ? '#0a0a0f' : 'rgba(255,255,255,0.7)',
                    fontWeight: presetFilter === 'all' ? 700 : 500,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <FilterOutlined style={{ fontSize: 10 }} />
                  全部
                </button>
                {SCENE_GROUPS.map((g) => {
                  const count = (groupedPresets[g.key] || []).length;
                  const active = presetFilter === g.key;
                  if (count === 0) return null;
                  return (
                    <button
                      key={g.key}
                      onClick={() => setPresetFilter(g.key)}
                      style={{
                        padding: '3px 10px', fontSize: 11, borderRadius: 12, cursor: 'pointer',
                        background: active
                          ? `linear-gradient(135deg, ${g.color}, ${g.color}cc)`
                          : 'rgba(255,255,255,0.04)',
                        border: active ? 'none' : `1px solid ${g.color}33`,
                        color: active ? '#0a0a0f' : g.color,
                        fontWeight: active ? 700 : 500,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <span>{g.icon}</span>
                      {g.label}
                      <span style={{
                        fontSize: 9, opacity: 0.7, padding: '0 4px', borderRadius: 6,
                        background: active ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.08)',
                      }}>{count}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
                {presetFilter === 'all' ? (
                  // 分组渲染
                  SCENE_GROUPS.map((g) => {
                    const items = groupedPresets[g.key] || [];
                    if (items.length === 0) return null;
                    return (
                      <div key={g.key} style={{ marginBottom: 10 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '4px 0 6px', fontSize: 11,
                          color: g.color, fontWeight: 600,
                          letterSpacing: 0.5,
                        }}>
                          {g.icon}
                          <span>{g.label}</span>
                          <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>
                            · {g.description}
                          </span>
                        </div>
                        {items.map(([k, p]) => (
                          <PresetCard key={k} presetKey={k} preset={p} onLoad={() => handleLoadPreset(k)} />
                        ))}
                      </div>
                    );
                  })
                ) : (
                  filteredPresetEntries.map(([key, preset]) => (
                    <PresetCard
                      key={key}
                      presetKey={key}
                      preset={preset}
                      onLoad={() => handleLoadPreset(key)}
                      highlight
                    />
                  ))
                )}
                {filteredPresetEntries.length === 0 && presetFilter !== 'all' && (
                  <div style={{ textAlign: 'center', padding: 20, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                    该场景暂无预设
                  </div>
                )}
              </div>
            </Card>

            {/* 添加类别 */}
            <Card 
              className="glass-card"
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PlusOutlined style={{ color: '#74fabd' }} />
                  <span>添加类别</span>
                </div>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Input
                    placeholder="类别名称 (英文)"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    onPressEnter={handleAddClass}
                    prefix={<EditOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
                    style={{ background: 'rgba(0,0,0,0.2)', borderColor: 'rgba(116, 247, 253, 0.2)', borderRadius: 10, flex: 1 }}
                  />
                  <Tooltip title="选择颜色">
                    <div onClick={() => setColorPickerTarget({ id: '__new__', color: newClassColor || '#74f7fd', name: '新类别' })}
                      style={{
                        width: 36, height: 36, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
                        background: newClassColor || 'linear-gradient(135deg, #ccc, #888)',
                        border: '2px solid rgba(255,255,255,0.2)',
                        boxShadow: newClassColor ? `0 2px 8px ${newClassColor}60` : 'none',
                      }} />
                  </Tooltip>
                </div>
                <Input.TextArea
                  placeholder="提示词 (用于模型识别)"
                  value={newClassPrompt}
                  onChange={(e) => setNewClassPrompt(e.target.value)}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  style={{
                    background: 'rgba(0,0,0,0.2)',
                    borderColor: 'rgba(116, 247, 253, 0.2)',
                    borderRadius: 10,
                  }}
                />
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleAddClass}
                    block
                    size="large"
                    style={{
                      height: 44,
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #74fabd 0%, #00d4aa 100%)',
                      border: 'none',
                      boxShadow: '0 4px 16px rgba(116, 250, 189, 0.3)',
                      color: '#0a0a0f',
                      fontWeight: 600,
                    }}
                  >
                    添加类别
                  </Button>
                </motion.div>
              </Space>
            </Card>

            {/* 数据集名称 */}
            <Card 
              className="glass-card" 
              style={{ marginTop: 20 }}
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SettingOutlined style={{ color: '#ffb800' }} />
                  <span>数据集设置</span>
                </div>
              }
            >
              <div style={{ marginBottom: 8, color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                数据集名称
              </div>
              <Input
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                placeholder="输入数据集名称"
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  borderColor: 'rgba(116, 247, 253, 0.2)',
                  borderRadius: 10,
                }}
              />
            </Card>
          </motion.div>
        </Col>

        {/* 右侧：类别列表 */}
        <Col span={17}>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="glass-card">
              {/* 标题栏 */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: 28,
                paddingBottom: 20,
                borderBottom: '1px solid rgba(255,255,255,0.1)',
              }}>
                <div>
                  <Title level={3} style={{ margin: 0, marginBottom: 4 }}>
                    <span className="gradient-text">类别配置</span>
                  </Title>
                  <Text style={{ color: 'rgba(255,255,255,0.5)' }}>
                    配置分割任务的目标类别和对应的提示词
                  </Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Tag 
                    style={{ 
                      fontSize: 14, 
                      padding: '4px 12px',
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, #74f7fd 0%, #5bc7fa 100%)',
                      border: 'none',
                      color: '#fff',
                    }}
                  >
                    {classes.length} 个类别
                  </Tag>
                  <Button 
                    icon={<ArrowLeftOutlined />}
                    onClick={() => setCurrentStep('upload')}
                    style={{
                      borderRadius: 8,
                    }}
                  >
                    返回
                  </Button>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      type="primary"
                      icon={<ArrowRightOutlined />}
                      onClick={handleNext}
                      disabled={classes.length === 0}
                      size="large"
                      style={{
                        height: 40,
                        borderRadius: 8,
                        background: classes.length > 0 
                          ? 'linear-gradient(135deg, #74f7fd 0%, #5bc7fa 100%)'
                          : undefined,
                        border: 'none',
                        boxShadow: classes.length > 0 
                          ? '0 4px 16px rgba(116, 247, 253, 0.4)'
                          : undefined,
                      }}
                    >
                      开始处理
                    </Button>
                  </motion.div>
                </div>
              </div>

              {/* 类别列表 */}
              {classes.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    padding: 60,
                    textAlign: 'center',
                  }}
                >
                  <div style={{
                    width: 80,
                    height: 80,
                    margin: '0 auto 20px',
                    borderRadius: 20,
                    background: 'rgba(116, 247, 253, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <AppstoreOutlined style={{ fontSize: 36, color: '#74f7fd' }} />
                  </div>
                  <Title level={4} style={{ color: 'rgba(255,255,255,0.8)', marginBottom: 8 }}>
                    暂无类别
                  </Title>
                  <Text style={{ color: 'rgba(255,255,255,0.5)' }}>
                    请从左侧预设模板中选择，或手动添加新类别
                  </Text>
                </motion.div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, minHeight: 200 }}>
                  <AnimatePresence>
                    {classes.map((classItem, index) => (
                      <ClassCard
                        key={classItem.id}
                        classItem={classItem}
                        isEditing={editingId === classItem.id}
                        onEdit={() => setEditingId(editingId === classItem.id ? null : classItem.id)}
                        onOpenColorPicker={() => setColorPickerTarget({
                          id: classItem.id,
                          color: rgbToHex(classItem.color),
                          name: classItem.name,
                        })}
                        onUpdate={(updates) => updateClass(classItem.id, updates)}
                        onDelete={() => removeClass(classItem.id)}
                        index={index}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </Card>
          </motion.div>
        </Col>
      </Row>

      {/* 全局颜色选择器 Modal */}
      <ColorPickerModal
        open={!!colorPickerTarget}
        color={colorPickerTarget?.color || '#74f7fd'}
        className={colorPickerTarget?.name}
        onChange={(hex) => {
          if (!colorPickerTarget) return;
          if (colorPickerTarget.id === '__new__') {
            setNewClassColor(hex);
          } else {
            updateClass(colorPickerTarget.id, { color: hexToRgb(hex) });
          }
        }}
        onClose={() => setColorPickerTarget(null)}
      />

      {/* AI 识图预设预览 Modal */}
      <AIPresetPreviewModal
        open={aiOpen}
        loading={aiLoading}
        progress={aiProgress}
        progressLabel={aiProgressLabel}
        result={aiResult}
        error={aiError}
        onClose={() => {
          setAiOpen(false);
          setAiError(null);
        }}
        onApply={handleApplyAiPreset}
        onRetry={runAiRecommend}
      />
    </div>
    </WidgetPanel>
  );
};

export default ClassEditor;
