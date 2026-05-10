/**
 * RS Dataset Factory - 参数控制面板
 * 科技感滑块设计，参数分组显示，优化工具提示
 */
import React, { useState } from 'react';
import { 
  Card, Typography, Slider, InputNumber, Row, Col, Tooltip, Space,
  Collapse, Tag, Divider
} from 'antd';
import { 
  SettingOutlined, 
  QuestionCircleOutlined,
  ScissorOutlined,
  PercentageOutlined,
  AimOutlined,
  ThunderboltOutlined,
  SafetyOutlined,
  PieChartOutlined,
  ExperimentOutlined,
  ExpandOutlined
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useAppStore } from '../../stores/appStore';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface ParamItemProps {
  label: string;
  tooltip: string;
  description?: string;
  icon: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  suffix?: string;
  showPercent?: boolean;
  color?: string;
  marks?: Record<number, string>;
}

// 科技感滑块组件
const TechSlider: React.FC<{
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  color: string;
  showPercent?: boolean;
  suffix?: string;
  marks?: Record<number, string>;
}> = ({ value, min, max, step, onChange, color, showPercent, suffix, marks }) => {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ position: 'relative' }}>
      {/* 背景轨道 */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 0,
        right: 0,
        height: 8,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 4,
        overflow: 'hidden',
      }}>
        {/* 填充进度 */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.2 }}
          style={{
            height: '100%',
            background: `linear-gradient(90deg, ${color} 0%, ${color}80 100%)`,
            boxShadow: `0 0 12px ${color}60`,
            borderRadius: 4,
          }}
        />
        
        {/* 网格线 */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `repeating-linear-gradient(
            90deg,
            transparent,
            transparent 10%,
            rgba(255,255,255,0.05) 10%,
            rgba(255,255,255,0.05) 10.5%
          )`,
        }} />
      </div>

      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        marks={marks}
        tooltip={{ 
          formatter: (v) => (
            <span style={{ fontWeight: 600 }}>
              {v}{showPercent ? '%' : ''}{suffix || ''}
            </span>
          ),
        }}
        styles={{
          track: { background: 'transparent', height: 8 },
          rail: { background: 'transparent', height: 8 },
          handle: {
            width: 20,
            height: 20,
            marginTop: -6,
            background: color,
            border: '3px solid rgba(255,255,255,0.9)',
            boxShadow: `0 2px 8px ${color}80, 0 0 0 2px ${color}40`,
          },
        }}
      />
    </div>
  );
};

// 参数项组件
const ParamItem: React.FC<ParamItemProps> = ({
  label, tooltip, description, icon, value, min, max, step, 
  onChange, suffix, showPercent, color = '#00f0ff', marks
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      style={{
        padding: 16,
        marginBottom: 12,
        borderRadius: 14,
        background: isHovered 
          ? `linear-gradient(135deg, ${color}15 0%, ${color}05 100%)`
          : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isHovered ? `${color}40` : 'rgba(255,255,255,0.05)'}`,
        transition: 'all 0.3s ease',
      }}
    >
      {/* 标题行 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        marginBottom: 12,
        gap: 10,
      }}>
        <motion.div
          animate={{ scale: isHovered ? 1.1 : 1 }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${color}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: color,
            fontSize: 16,
          }}
        >
          {icon}
        </motion.div>
        
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text strong style={{ fontSize: 14 }}>{label}</Text>
            <Tooltip 
              title={
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
                  <div style={{ color: 'rgba(255,255,255,0.8)' }}>{tooltip}</div>
                  {description && (
                    <div style={{ 
                      marginTop: 8, 
                      paddingTop: 8, 
                      borderTop: '1px solid rgba(255,255,255,0.1)',
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.6)',
                    }}>
                      {description}
                    </div>
                  )}
                </div>
              }
              placement="right"
              overlayStyle={{ maxWidth: 280 }}
            >
              <QuestionCircleOutlined 
                style={{ 
                  color: 'rgba(255,255,255,0.3)', 
                  cursor: 'help',
                  fontSize: 12,
                }} 
              />
            </Tooltip>
          </div>
          {description && (
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              {description}
            </Text>
          )}
        </div>

        {/* 数值显示 */}
        <motion.div
          key={value}
          initial={{ scale: 1.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            minWidth: 80,
            textAlign: 'right',
          }}
        >
          <div style={{
            display: 'inline-flex',
            alignItems: 'baseline',
            padding: '6px 12px',
            borderRadius: 8,
            background: `${color}15`,
            border: `1px solid ${color}30`,
          }}>
            <span style={{
              fontSize: 18,
              fontWeight: 700,
              color: color,
              fontFamily: 'monospace',
            }}>
              {value}
            </span>
            <span style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.5)',
              marginLeft: 2,
            }}>
              {showPercent ? '%' : ''}{suffix || ''}
            </span>
          </div>
        </motion.div>
      </div>

      {/* 滑块和输入框 */}
      <Row gutter={16} align="middle">
        <Col span={18}>
          <TechSlider
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={onChange}
            color={color}
            showPercent={showPercent}
            suffix={suffix}
            marks={marks}
          />
        </Col>
        <Col span={6}>
          <InputNumber
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(v) => v !== null && onChange(v)}
            style={{ 
              width: '100%',
              background: 'rgba(0,0,0,0.2)',
              borderColor: `${color}30`,
              borderRadius: 8,
            }}
            size="small"
          />
        </Col>
      </Row>
    </motion.div>
  );
};

// 参数组标题
const GroupHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}> = ({ icon, title, description, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <div style={{
      width: 40,
      height: 40,
      borderRadius: 12,
      background: `linear-gradient(135deg, ${color}30 0%, ${color}10 100%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 18,
      color: color,
    }}>
      {icon}
    </div>
    <div>
      <div style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{description}</div>
    </div>
  </div>
);

const ParamPanel: React.FC = () => {
  const { params, setParams } = useAppStore();
  const [activeGroups, setActiveGroups] = useState<string[]>(['processing', 'dataset', 'quality']);

  return (
    <Card 
      className="glass-card"
      style={{ height: '100%', overflow: 'hidden' }}
      styles={{
        body: { 
          padding: 0, 
          height: 'calc(100% - 57px)', 
          overflow: 'auto',
        },
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <motion.div
            animate={{ rotate: [0, 180, 360] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #00f0ff 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SettingOutlined style={{ color: '#fff', fontSize: 16 }} />
          </motion.div>
          <div>
            <div style={{ fontWeight: 600 }}>处理参数</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>
              配置图像处理和数据集生成参数
            </div>
          </div>
        </div>
      }
    >
      <div style={{ padding: 16 }}>
        <Collapse
          activeKey={activeGroups}
          onChange={(keys) => setActiveGroups(keys as string[])}
          bordered={false}
          style={{ background: 'transparent' }}
          expandIconPosition="end"
        >
          {/* 图像处理参数组 */}
          <Panel
            key="processing"
            header={
              <GroupHeader
                icon={<ExperimentOutlined />}
                title="图像处理"
                description="控制图像预处理和分块参数"
                color="#00f0ff"
              />
            }
            style={{
              marginBottom: 12,
              background: 'rgba(102, 126, 234, 0.05)',
              border: '1px solid rgba(102, 126, 234, 0.15)',
              borderRadius: 16,
              overflow: 'hidden',
            }}
          >
            <ParamItem
              label="最大尺寸"
              tooltip="处理前将图像缩放到此最大尺寸，较大值保留更多细节但处理更慢"
              description="建议根据显存大小调整"
              icon={<ExpandOutlined />}
              value={params.max_size}
              min={5000}
              max={25000}
              step={1000}
              onChange={(v) => setParams({ max_size: v })}
              suffix=" px"
              color="#00f0ff"
              marks={{ 5000: '5K', 15000: '15K', 25000: '25K' }}
            />

            <ParamItem
              label="裁剪块大小"
              tooltip="滑动窗口的块大小，512 为标准值，较大值可捕捉更多上下文"
              description="模型输入尺寸"
              icon={<ScissorOutlined />}
              value={params.crop_size}
              min={256}
              max={1024}
              step={64}
              onChange={(v) => setParams({ crop_size: v })}
              suffix=" px"
              color="#8b5cf6"
              marks={{ 256: '256', 512: '512', 1024: '1024' }}
            />

            <ParamItem
              label="滑动步长"
              tooltip="滑动窗口的步长，较小值意味着更多重叠，预测更精细但更慢"
              description="重叠区域用于平滑拼接"
              icon={<ThunderboltOutlined />}
              value={params.stride}
              min={128}
              max={512}
              step={32}
              onChange={(v) => setParams({ stride: v })}
              suffix=" px"
              color="#13c2c2"
              marks={{ 128: '128', 320: '320', 512: '512' }}
            />

            <ParamItem
              label="置信度阈值"
              tooltip="模型预测的最低置信度阈值，低于此值的预测将被忽略"
              description="较高值减少误检，较低值减少漏检"
              icon={<AimOutlined />}
              value={params.confidence_threshold * 100}
              min={5}
              max={50}
              step={5}
              onChange={(v) => setParams({ confidence_threshold: v / 100 })}
              showPercent
              color="#faad14"
              marks={{ 5: '5%', 25: '25%', 50: '50%' }}
            />
          </Panel>

          {/* 数据集划分参数组 */}
          <Panel
            key="dataset"
            header={
              <GroupHeader
                icon={<PieChartOutlined />}
                title="数据集划分"
                description="配置训练/验证/测试集比例"
                color="#52c41a"
              />
            }
            style={{
              marginBottom: 12,
              background: 'rgba(82, 196, 26, 0.05)',
              border: '1px solid rgba(82, 196, 26, 0.15)',
              borderRadius: 16,
              overflow: 'hidden',
            }}
          >
            <ParamItem
              label="训练集比例"
              tooltip="用于训练模型的样本比例，通常设置为 70%-80%"
              description="主要用于模型学习"
              icon={<PercentageOutlined />}
              value={Math.round(params.train_ratio * 100)}
              min={50}
              max={90}
              step={5}
              onChange={(v) => setParams({ train_ratio: v / 100 })}
              showPercent
              color="#52c41a"
              marks={{ 50: '50%', 70: '70%', 90: '90%' }}
            />

            <ParamItem
              label="验证集比例"
              tooltip="用于验证模型性能的样本比例，通常设置为 10%-20%"
              description="用于调参和监控过拟合"
              icon={<PercentageOutlined />}
              value={Math.round(params.val_ratio * 100)}
              min={5}
              max={30}
              step={5}
              onChange={(v) => setParams({ val_ratio: v / 100 })}
              showPercent
              color="#1890ff"
              marks={{ 5: '5%', 15: '15%', 30: '30%' }}
            />

            {/* 测试集比例显示 */}
            <div style={{
              padding: 16,
              marginBottom: 12,
              borderRadius: 14,
              background: 'rgba(250, 173, 20, 0.05)',
              border: '1px solid rgba(250, 173, 20, 0.15)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'rgba(250, 173, 20, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <PercentageOutlined style={{ color: '#faad14' }} />
                  </div>
                  <div>
                    <Text strong>测试集比例</Text>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                      自动计算剩余比例
                    </div>
                  </div>
                </div>
                <Tag 
                  color="gold"
                  style={{
                    fontSize: 16,
                    padding: '4px 12px',
                    borderRadius: 8,
                    fontWeight: 600,
                  }}
                >
                  {Math.round((1 - params.train_ratio - params.val_ratio) * 100)}%
                </Tag>
              </div>
            </div>
          </Panel>

          {/* 质量控制参数组 */}
          <Panel
            key="quality"
            header={
              <GroupHeader
                icon={<SafetyOutlined />}
                title="质量控制"
                description="过滤低质量样本，确保数据质量"
                color="#eb2f96"
              />
            }
            style={{
              marginBottom: 12,
              background: 'rgba(235, 47, 150, 0.05)',
              border: '1px solid rgba(235, 47, 150, 0.15)',
              borderRadius: 16,
              overflow: 'hidden',
            }}
          >
            <ParamItem
              label="最小有效像素比"
              tooltip="每个裁剪块中有效像素的最低比例，过滤掉大面积空白或无效区域"
              description="排除低信息量的图块"
              icon={<PercentageOutlined />}
              value={Math.round(params.min_valid_ratio * 100)}
              min={10}
              max={80}
              step={5}
              onChange={(v) => setParams({ min_valid_ratio: v / 100 })}
              showPercent
              color="#eb2f96"
              marks={{ 10: '10%', 40: '40%', 80: '80%' }}
            />

            <ParamItem
              label="最小类别数"
              tooltip="每个裁剪块至少包含的类别数量，确保样本具有足够的多样性"
              description="提高样本信息密度"
              icon={<AimOutlined />}
              value={params.min_class_diversity}
              min={1}
              max={5}
              step={1}
              onChange={(v) => setParams({ min_class_diversity: v })}
              color="#722ed1"
              marks={{ 1: '1', 3: '3', 5: '5' }}
            />
          </Panel>
        </Collapse>

        {/* 参数汇总 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{
            marginTop: 8,
            padding: 16,
            borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
            border: '1px solid rgba(102, 126, 234, 0.2)',
          }}
        >
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            marginBottom: 12,
          }}>
            <ThunderboltOutlined style={{ color: '#faad14' }} />
            <Text strong style={{ fontSize: 13 }}>当前配置概览</Text>
          </div>
          <Row gutter={[12, 8]}>
            {[
              { label: '最大尺寸', value: `${params.max_size}px` },
              { label: '块大小', value: `${params.crop_size}px` },
              { label: '步长', value: `${params.stride}px` },
              { label: '置信度', value: `${(params.confidence_threshold * 100).toFixed(0)}%` },
              { label: '训练集', value: `${(params.train_ratio * 100).toFixed(0)}%` },
              { label: '验证集', value: `${(params.val_ratio * 100).toFixed(0)}%` },
            ].map((item, index) => (
              <Col span={8} key={index}>
                <div style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: 'rgba(0,0,0,0.2)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                    {item.label}
                  </div>
                  <div style={{ 
                    fontSize: 13, 
                    fontWeight: 600, 
                    color: '#00f0ff',
                    fontFamily: 'monospace',
                  }}>
                    {item.value}
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </motion.div>
      </div>
    </Card>
  );
};

export default ParamPanel;
