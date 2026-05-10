/**
 * RS Dataset Factory - 上传区域组件
 * 支持多格式遥感图像上传，科技感UI设计，可拖动缩放预览
 */
import React, { useState, useCallback, useMemo } from 'react';
import { 
  Upload, message, Card, Typography, Space, Row, Col, Button, 
  Badge, Divider, Tooltip, Alert, Tag, Radio
} from 'antd';
import { 
  CloudUploadOutlined, 
  FileImageOutlined,
  CheckCircleOutlined,
  ArrowRightOutlined,
  DeleteOutlined,
  InboxOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  ExpandOutlined,
  FileOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
  UndoOutlined,
  DragOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  BulbOutlined,
  ThunderboltOutlined,
  ScissorOutlined,
  PictureOutlined,
  AppstoreOutlined
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { api, ImageAnalysis } from '../../services/api';
import { useAppStore } from '../../stores/appStore';
import BatchUploader, { UploadedFileInfo } from '../common/BatchUploader';
import WidgetPanel from '../MFLayout/WidgetPanel';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

// 可拖动缩放的图片预览组件
const InteractiveImageViewer: React.FC<{ src: string; alt?: string }> = ({ src, alt = 'Preview' }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale(prev => Math.min(Math.max(0.5, prev + delta), 8));
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

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
    if (!isFullscreen) {
      handleReset();
    }
  }, [isFullscreen, handleReset]);

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
    borderRadius: 16,
    overflow: 'hidden',
    border: '2px solid rgba(116, 247, 253, 0.3)',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
    background: 'rgba(5, 50, 106, 0.8)',
    minHeight: 300,
  };

  return (
    <div style={containerStyle}>
      {/* 工具栏 */}
      <div style={{
        position: isFullscreen ? 'fixed' : 'absolute',
        top: isFullscreen ? 20 : 12,
        right: isFullscreen ? 20 : 12,
        zIndex: 10,
      }}>
        <div style={{
          background: 'rgba(5, 50, 106, 0.9)',
          backdropFilter: 'blur(10px)',
          borderRadius: 10,
          padding: '8px 14px',
          border: '1px solid rgba(116, 247, 253, 0.3)',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}>
          <Tooltip title="缩小 (滚轮向下)">
            <Button 
              type="text" 
              icon={<ZoomOutOutlined />} 
              onClick={() => setScale(prev => Math.max(0.5, prev - 0.25))}
              size="small"
              style={{ color: '#74f7fd' }}
            />
          </Tooltip>
          <span style={{ 
            color: '#74f7fd', 
            fontSize: 12, 
            fontFamily: 'JetBrains Mono, monospace',
            minWidth: 45,
            textAlign: 'center',
          }}>
            {Math.round(scale * 100)}%
          </span>
          <Tooltip title="放大 (滚轮向上)">
            <Button 
              type="text" 
              icon={<ZoomInOutlined />} 
              onClick={() => setScale(prev => Math.min(8, prev + 0.25))}
              size="small"
              style={{ color: '#74f7fd' }}
            />
          </Tooltip>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />
          <Tooltip title="重置">
            <Button 
              type="text" 
              icon={<UndoOutlined />} 
              onClick={handleReset}
              size="small"
              style={{ color: '#5bc7fa' }}
            />
          </Tooltip>
          <Tooltip title={isFullscreen ? "退出全屏 (ESC)" : "全屏查看"}>
            <Button 
              type="text" 
              icon={<FullscreenOutlined />} 
              onClick={toggleFullscreen}
              size="small"
              style={{ color: '#52c41a' }}
            />
          </Tooltip>
        </div>
      </div>

      {/* 拖动提示 */}
      {scale > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '6px 14px',
            borderRadius: 6,
            fontSize: 12,
            color: 'rgba(255,255,255,0.7)',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            border: '1px solid rgba(116, 247, 253, 0.2)',
          }}
        >
          <DragOutlined style={{ color: '#74f7fd' }} /> 按住鼠标拖动 | 滚轮缩放
        </motion.div>
      )}

      {/* 图片容器 */}
      <div
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
            maxHeight: isFullscreen ? '90vh' : 350,
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            position: 'fixed',
            bottom: 40,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
          }}
        >
          <Button 
            onClick={toggleFullscreen}
            size="large"
            style={{
              background: 'rgba(116, 247, 253, 0.2)',
              border: '1px solid rgba(102, 126, 234, 0.4)',
              color: '#fff',
              borderRadius: 10,
            }}
          >
            按 ESC 或点击关闭全屏
          </Button>
        </motion.div>
      )}
    </div>
  );
};

// 支持的文件格式
const SUPPORTED_FORMATS = [
  { ext: '.tif', name: 'GeoTIFF', color: '#74f7fd' },
  { ext: '.tiff', name: 'GeoTIFF', color: '#74f7fd' },
  { ext: '.png', name: 'PNG', color: '#52c41a' },
  { ext: '.jpg', name: 'JPEG', color: '#faad14' },
  { ext: '.jpeg', name: 'JPEG', color: '#faad14' },
  { ext: '.img', name: 'ENVI IMG', color: '#eb2f96' },
  { ext: '.hdf', name: 'HDF', color: '#13c2c2' },
  { ext: '.nc', name: 'NetCDF', color: '#722ed1' },
];

const ACCEPT_FORMATS = SUPPORTED_FORMATS.map(f => f.ext).join(',');

// 科技感进度条组件
const TechProgressBar: React.FC<{ percent: number; status?: string }> = ({ percent, status }) => {
  return (
    <div style={{ width: '100%', padding: '20px 0' }}>
      {/* 进度条外框 */}
      <div style={{
        position: 'relative',
        height: 8,
        background: 'rgba(102, 126, 234, 0.1)',
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid rgba(116, 247, 253, 0.2)',
      }}>
        {/* 进度条填充 */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={{
            height: '100%',
            background: 'linear-gradient(90deg, #74f7fd 0%, #5bc7fa 50%, #74f7fd 100%)',
            backgroundSize: '200% 100%',
            borderRadius: 4,
            boxShadow: '0 0 20px rgba(102, 126, 234, 0.6)',
          }}
        />
        
        {/* 扫描线动画 */}
        <motion.div
          animate={{
            x: ['-100%', '200%'],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'linear',
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '50%',
            height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
          }}
        />
      </div>

      {/* 进度数值 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
      }}>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
          {status || '正在上传...'}
        </Text>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 4,
        }}>
          <motion.span
            key={percent}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              fontSize: 28,
              fontWeight: 700,
              background: 'linear-gradient(135deg, #74f7fd 0%, #5bc7fa 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: 'monospace',
            }}
          >
            {percent}
          </motion.span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>%</span>
        </div>
      </div>

      {/* 数据点动画 */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 6,
        marginTop: 16,
      }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.2,
            }}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#74f7fd',
            }}
          />
        ))}
      </div>
    </div>
  );
};

// 格式标签组件
const FormatBadge: React.FC<{ format: typeof SUPPORTED_FORMATS[0] }> = ({ format }) => (
  <motion.div
    whileHover={{ scale: 1.05, y: -2 }}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 10px',
      borderRadius: 6,
      background: `${format.color}15`,
      border: `1px solid ${format.color}40`,
      fontSize: 12,
      color: format.color,
      fontWeight: 500,
      cursor: 'default',
    }}
  >
    {format.ext}
  </motion.div>
);

// 元数据卡片组件
const MetadataCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  unit?: string;
}> = ({ icon, label, value, color, unit }) => (
  <motion.div
    whileHover={{ scale: 1.02, y: -2 }}
    style={{
      background: `${color}10`,
      border: `1px solid ${color}30`,
      borderRadius: 12,
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}
  >
    <div style={{
      width: 44,
      height: 44,
      borderRadius: 10,
      background: `${color}20`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 20,
      color: color,
    }}>
      {icon}
    </div>
    <div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>
        {value}{unit && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  </motion.div>
);

// 智能分析结果组件
const AnalysisPanel: React.FC<{ analysis: ImageAnalysis }> = ({ analysis }) => {
  const scaleTypeLabels: Record<string, { label: string; color: string }> = {
    tiny: { label: '极小', color: '#ff4d4f' },
    small: { label: '小型', color: '#faad14' },
    medium: { label: '中等', color: '#52c41a' },
    large: { label: '大型', color: '#1890ff' },
    huge: { label: '超大', color: '#722ed1' },
  };

  const modeLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    single_label: { label: '单张标注', icon: <PictureOutlined />, color: '#faad14' },
    few_crops: { label: '少量切片', icon: <ScissorOutlined />, color: '#52c41a' },
    standard_crops: { label: '标准切片', icon: <AppstoreOutlined />, color: '#1890ff' },
    large_scale: { label: '大规模处理', icon: <ThunderboltOutlined />, color: '#722ed1' },
  };

  const scaleInfo = scaleTypeLabels[analysis.scale_type] || { label: '未知', color: '#999' };
  const modeInfo = modeLabels[analysis.processing_mode] || { label: '未知', icon: null, color: '#999' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      {/* 智能分析标题 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'linear-gradient(135deg, #74f7fd20 0%, #5bc7fa20 100%)',
          border: '1px solid rgba(116, 247, 253, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <BulbOutlined style={{ fontSize: 18, color: '#74f7fd' }} />
        </div>
        <div>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>智能分析</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>AI 自动识别图像特征</div>
        </div>
      </div>

      {/* 分析摘要 */}
      <Card
        size="small"
        style={{
          background: 'linear-gradient(135deg, rgba(116, 247, 253, 0.05) 0%, rgba(91, 199, 250, 0.05) 100%)',
          border: '1px solid rgba(116, 247, 253, 0.2)',
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ 
          color: 'rgba(255,255,255,0.85)', 
          fontSize: 14, 
          lineHeight: 1.8,
        }}>
          {analysis.analysis_summary}
        </div>
      </Card>

      {/* 关键指标 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <div style={{
            padding: '12px 16px',
            background: `${scaleInfo.color}15`,
            border: `1px solid ${scaleInfo.color}30`,
            borderRadius: 10,
            textAlign: 'center',
          }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 4 }}>图像规模</div>
            <Tag color={scaleInfo.color} style={{ margin: 0, fontWeight: 600 }}>
              {scaleInfo.label}图像
            </Tag>
          </div>
        </Col>
        <Col span={8}>
          <div style={{
            padding: '12px 16px',
            background: `${modeInfo.color}15`,
            border: `1px solid ${modeInfo.color}30`,
            borderRadius: 10,
            textAlign: 'center',
          }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 4 }}>处理模式</div>
            <Tag color={modeInfo.color} style={{ margin: 0, fontWeight: 600 }} icon={modeInfo.icon}>
              {modeInfo.label}
            </Tag>
          </div>
        </Col>
        <Col span={8}>
          <div style={{
            padding: '12px 16px',
            background: 'rgba(82, 196, 26, 0.15)',
            border: '1px solid rgba(82, 196, 26, 0.3)',
            borderRadius: 10,
            textAlign: 'center',
          }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 4 }}>预计样本</div>
            <div style={{ 
              color: '#52c41a', 
              fontSize: 18, 
              fontWeight: 700,
              fontFamily: 'DouyuFont, monospace',
            }}>
              {analysis.estimated_crops}
            </div>
          </div>
        </Col>
      </Row>

      {/* 推荐参数 */}
      {analysis.processing_mode !== 'single_label' && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(24, 144, 255, 0.1)',
          border: '1px solid rgba(24, 144, 255, 0.2)',
          borderRadius: 10,
          marginBottom: 16,
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            marginBottom: 8,
          }}>
            <ScissorOutlined style={{ color: '#1890ff' }} />
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>推荐切片参数</span>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>裁剪尺寸: </span>
              <span style={{ color: '#1890ff', fontWeight: 600, fontFamily: 'monospace' }}>
                {analysis.recommended_crop_size} × {analysis.recommended_crop_size}
              </span>
            </div>
            <div>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>步长: </span>
              <span style={{ color: '#1890ff', fontWeight: 600, fontFamily: 'monospace' }}>
                {analysis.recommended_stride}
              </span>
            </div>
            <div>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>重叠率: </span>
              <span style={{ color: '#1890ff', fontWeight: 600, fontFamily: 'monospace' }}>
                {Math.round((1 - analysis.recommended_stride / analysis.recommended_crop_size) * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 数据集预估 */}
      {analysis.processing_mode !== 'single_label' && analysis.estimated_crops > 1 && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(82, 196, 26, 0.1)',
          border: '1px solid rgba(82, 196, 26, 0.2)',
          borderRadius: 10,
          marginBottom: 16,
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            marginBottom: 8,
          }}>
            <AppstoreOutlined style={{ color: '#52c41a' }} />
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>数据集预估</span>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Tag color="green">训练集: ~{analysis.estimated_train_samples}</Tag>
            <Tag color="orange">验证集: ~{analysis.estimated_val_samples}</Tag>
            <Tag color="blue">测试集: ~{analysis.estimated_test_samples}</Tag>
          </div>
        </div>
      )}

      {/* 警告和建议 */}
      {analysis.warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {analysis.warnings.map((warning, index) => (
            <Alert
              key={index}
              type={warning.type === 'error' ? 'error' : warning.type === 'warning' ? 'warning' : 'info'}
              message={warning.title}
              description={warning.content}
              showIcon
              style={{
                background: warning.type === 'error' 
                  ? 'rgba(255, 77, 79, 0.1)' 
                  : warning.type === 'warning'
                  ? 'rgba(250, 173, 20, 0.1)'
                  : 'rgba(24, 144, 255, 0.1)',
                border: warning.type === 'error'
                  ? '1px solid rgba(255, 77, 79, 0.3)'
                  : warning.type === 'warning'
                  ? '1px solid rgba(250, 173, 20, 0.3)'
                  : '1px solid rgba(24, 144, 255, 0.3)',
                borderRadius: 8,
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
};

// 上传成功后的预览组件
const UploadedImagePreview: React.FC<{
  uploadedFile: any;
  onReset: () => void;
  onNext: () => void;
  formatFileSize: (bytes: number) => string;
  getFileFormat: (filename: string) => string;
}> = ({ uploadedFile, onReset, onNext, formatFileSize, getFileFormat }) => {
  const analysis = uploadedFile.metadata?.analysis as ImageAnalysis | undefined;

  return (
    <motion.div
      key="preview"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="glass-card" style={{ padding: 24 }}>
        {/* 成功标题 */}
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          style={{ textAlign: 'center', marginBottom: 24 }}
        >
          <div style={{
            width: 56,
            height: 56,
            margin: '0 auto 12px',
            borderRadius: '50%',
            background: 'rgba(82, 196, 26, 0.15)',
            border: '2px solid rgba(82, 196, 26, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <CheckCircleOutlined style={{ fontSize: 28, color: '#52c41a' }} />
          </div>
          <Title level={3} style={{ marginBottom: 4 }}>
            <span className="gradient-text">图像分析完成</span>
          </Title>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
            系统已自动分析图像特征并给出处理建议
          </Text>
        </motion.div>

        <Row gutter={32}>
          {/* 左侧：预览图 + 元数据 */}
          <Col span={10}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              {/* 预览图 */}
              <div style={{ position: 'relative', marginBottom: 16 }}>
                <InteractiveImageViewer 
                  src={api.getPreviewUrl(uploadedFile.task_id)} 
                  alt="遥感图像预览" 
                />
                <Badge
                  count={getFileFormat(uploadedFile.filename)}
                  style={{
                    position: 'absolute',
                    top: 50,
                    left: 12,
                    background: 'linear-gradient(135deg, #74f7fd 0%, #5bc7fa 100%)',
                    border: 'none',
                    padding: '0 12px',
                    height: 24,
                    lineHeight: '24px',
                    borderRadius: 6,
                    zIndex: 5,
                  }}
                />
              </div>

              {/* 文件名 */}
              <Card
                size="small"
                style={{
                  background: 'rgba(5, 50, 106, 0.6)',
                  border: '1px solid rgba(116, 247, 253, 0.2)',
                  borderRadius: 10,
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileOutlined style={{ fontSize: 16, color: '#74f7fd' }} />
                  <div style={{ 
                    color: '#fff', 
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}>
                    {uploadedFile.filename}
                  </div>
                </div>
              </Card>

              {/* 基本元数据 */}
              <Row gutter={[8, 8]}>
                <Col span={12}>
                  <MetadataCard
                    icon={<ExpandOutlined />}
                    label="图像尺寸"
                    value={`${uploadedFile.width} × ${uploadedFile.height}`}
                    color="#74f7fd"
                  />
                </Col>
                <Col span={12}>
                  <MetadataCard
                    icon={<DatabaseOutlined />}
                    label="波段数量"
                    value={uploadedFile.bands}
                    color="#5bc7fa"
                    unit="波段"
                  />
                </Col>
                <Col span={12}>
                  <MetadataCard
                    icon={<FileImageOutlined />}
                    label="文件大小"
                    value={formatFileSize(uploadedFile.file_size)}
                    color="#52c41a"
                  />
                </Col>
                <Col span={12}>
                  <MetadataCard
                    icon={<GlobalOutlined />}
                    label="像素总量"
                    value={analysis ? `${analysis.megapixels}` : `${((uploadedFile.width * uploadedFile.height) / 1000000).toFixed(2)}`}
                    color="#faad14"
                    unit="MP"
                  />
                </Col>
              </Row>
            </motion.div>
          </Col>

          {/* 右侧：智能分析 */}
          <Col span={14}>
            {analysis ? (
              <AnalysisPanel analysis={analysis} />
            ) : (
              <div style={{ 
                textAlign: 'center', 
                padding: 40,
                color: 'rgba(255,255,255,0.5)',
              }}>
                <InfoCircleOutlined style={{ fontSize: 32, marginBottom: 12 }} />
                <div>无法获取分析数据</div>
              </div>
            )}

            {/* 操作按钮 */}
            <Divider style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '20px 0' }} />
            
            <Space size="middle">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button 
                  icon={<DeleteOutlined />}
                  onClick={onReset}
                  size="large"
                  style={{
                    height: 44,
                    borderRadius: 10,
                    background: 'rgba(255, 77, 79, 0.1)',
                    borderColor: 'rgba(255, 77, 79, 0.3)',
                    color: '#ff4d4f',
                  }}
                >
                  重新上传
                </Button>
              </motion.div>
              
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRightOutlined />}
                  onClick={onNext}
                  style={{
                    height: 44,
                    paddingLeft: 32,
                    paddingRight: 32,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #74f7fd 0%, #5bc7fa 100%)',
                    border: 'none',
                    boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)',
                  }}
                >
                  {analysis?.processing_mode === 'single_label' ? '下一步：配置标注' : '下一步：配置类别'}
                </Button>
              </motion.div>
            </Space>
          </Col>
        </Row>
      </Card>
    </motion.div>
  );
};

const UploadZone: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMode, setUploadMode] = useState<'single' | 'batch'>('single');
  const {
    uploadedFile, setUploadedFile, setCurrentStep, markStepCompleted, setProcessingMode,
    batchFiles, setBatchFiles, selectedBatchFileIds, toggleBatchFileSelection, setSelectedBatchFileIds,
    resetBatchTasks, setActiveBatchFileId,
  } = useAppStore();
  // 单张模式中，从批量列表里挑出来"先看一张"的临时选择（不影响 batch 状态）
  const [previewSingleFromBatch, setPreviewSingleFromBatch] = useState<string | null>(null);

  const validateFile = (file: File): boolean => {
    const fileName = file.name.toLowerCase();
    const isValidFormat = SUPPORTED_FORMATS.some(f => fileName.endsWith(f.ext));
    
    if (!isValidFormat) {
      message.error(`不支持的文件格式。支持的格式: ${SUPPORTED_FORMATS.map(f => f.ext).join(', ')}`);
      return false;
    }
    
    return true;
  };

  const handleUpload = useCallback(async (file: File) => {
    if (!validateFile(file)) {
      return false;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus('准备上传...');

    try {
      // 模拟上传阶段
      const stages = [
        { progress: 15, status: '正在读取文件...' },
        { progress: 35, status: '正在传输数据...' },
        { progress: 60, status: '正在处理图像...' },
        { progress: 85, status: '正在生成预览...' },
      ];

      const result = await api.uploadImage(file, (progress) => {
        setUploadProgress(progress);
        const stage = stages.find(s => progress <= s.progress);
        if (stage) {
          setUploadStatus(stage.status);
        } else {
          setUploadStatus('即将完成...');
        }
      });
      
      setUploadProgress(100);
      setUploadStatus('上传完成!');
      setUploadedFile(result);
      message.success('遥感图像上传成功！');
    } catch (error: any) {
      message.error(error.response?.data?.detail || '上传失败，请重试');
    } finally {
      setTimeout(() => {
        setUploading(false);
      }, 500);
    }

    return false;
  }, [setUploadedFile]);

  const handleBatchUploaded = useCallback((files: UploadedFileInfo[]) => {
    // 写入全局 store；setBatchFiles 内部会自动把所有 id 全选
    setBatchFiles(files.map((f) => ({
      file_id: f.file_id,
      filename: f.filename,
      width: f.width,
      height: f.height,
      preview_url: f.preview_url,
    })));
    setPreviewSingleFromBatch(null);
    resetBatchTasks();
    setActiveBatchFileId(null);
    if (files.length > 0) {
      message.success(`已上传 ${files.length} 张，已默认全部选中`);
    }
  }, [setBatchFiles, resetBatchTasks, setActiveBatchFileId]);

  const handlePreviewSingleFromBatch = useCallback((fileInfo: UploadedFileInfo | { file_id: string; filename: string; width?: number; height?: number; preview_url?: string }) => {
    setPreviewSingleFromBatch(fileInfo.file_id);
    const w = fileInfo.width || 0;
    const h = fileInfo.height || 0;
    const isSmall = w > 0 && h > 0 && w <= 1024 && h <= 1024;
    setUploadedFile({
      task_id: fileInfo.file_id,
      filename: fileInfo.filename,
      width: w,
      height: h,
      bands: 3,
      file_size: 0,
      metadata: {
        analysis: {
          width: w, height: h,
          megapixels: parseFloat(((w * h) / 1e6).toFixed(2)),
          scale_type: isSmall ? 'small' : 'medium',
          processing_mode: isSmall ? 'single_label' : 'standard_crops',
          estimated_crops: isSmall ? 1 : Math.ceil((w / 512) * (h / 512)),
          recommended_crop_size: 512,
          recommended_stride: 384,
          estimated_train_samples: 0,
          estimated_val_samples: 0,
          estimated_test_samples: 0,
          analysis_summary: `图像 ${w}×${h}，已从批量上传中选择`,
          warnings: [],
        },
      },
    });
  }, [setUploadedFile]);

  const handleReset = useCallback(() => {
    if (uploadedFile) {
      api.deleteFile(uploadedFile.task_id).catch(() => {});
    }
    setUploadedFile(null);
    setUploadProgress(0);
    setUploadStatus('');
    setBatchFiles([]);
    setSelectedBatchFileIds([]);
    setPreviewSingleFromBatch(null);
    resetBatchTasks();
    setActiveBatchFileId(null);
  }, [uploadedFile, setUploadedFile, setBatchFiles, setSelectedBatchFileIds, resetBatchTasks, setActiveBatchFileId]);

  const handleNext = useCallback(() => {
    markStepCompleted('upload');

    // 根据图像分析结果设置处理模式
    const analysis = uploadedFile?.metadata?.analysis as ImageAnalysis | undefined;
    if (analysis?.processing_mode) {
      setProcessingMode(analysis.processing_mode as 'single_label' | 'dataset_crops');
    }

    setCurrentStep('configure');
  }, [setCurrentStep, markStepCompleted, uploadedFile, setProcessingMode]);

  /** 批量模式下"批量制作 N 张数据集"按钮的处理：
   * - 把第一张设为 uploadedFile（用于 ClassEditor 预设推荐 / 后续 fallback）
   * - 进入 configure 步骤
   * - 后续 ProcessingView 会读取 store 里的 selectedBatchFileIds 进行批量并行处理
   */
  const handleBatchNext = useCallback(() => {
    if (selectedBatchFileIds.length === 0) {
      message.warning('请至少勾选一张图像');
      return;
    }
    const firstSelected = batchFiles.find((f) => f.file_id === selectedBatchFileIds[0]);
    if (firstSelected) {
      handlePreviewSingleFromBatch(firstSelected);
    }
    markStepCompleted('upload');
    if (selectedBatchFileIds.length > 1) {
      setProcessingMode('dataset_crops');
    }
    resetBatchTasks();
    setActiveBatchFileId(null);
    setCurrentStep('configure');
    message.success(`已锁定 ${selectedBatchFileIds.length} 张图像，进入批量数据集制作流程`);
  }, [selectedBatchFileIds, batchFiles, handlePreviewSingleFromBatch, markStepCompleted, setProcessingMode, resetBatchTasks, setActiveBatchFileId, setCurrentStep]);

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / 1024).toFixed(2)} KB`;
  };

  const getFileFormat = (filename: string): string => {
    const ext = '.' + filename.split('.').pop()?.toLowerCase();
    const format = SUPPORTED_FORMATS.find(f => f.ext === ext);
    return format?.name || '未知格式';
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px' }}>
      <WidgetPanel title="影像上传" bodyStyle={{ overflow: 'auto' }}>
      <AnimatePresence mode="wait">
        {!uploadedFile ? (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
            <Card 
              className="glass-card"
              style={{ padding: 24 }}
            >
              {/* 标题区域 */}
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  <Title level={2} style={{ marginBottom: 8 }}>
                    <span className="gradient-text">上传遥感图像</span>
                  </Title>
                </motion.div>
                <Paragraph style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 16, fontSize: 15 }}>
                  支持多种遥感图像格式，最大支持 10GB 超大图像处理
                </Paragraph>
                
                {/* 支持格式标签 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {SUPPORTED_FORMATS.filter((f, i, arr) => 
                    arr.findIndex(x => x.name === f.name) === i
                  ).map((format) => (
                    <FormatBadge key={format.ext} format={format} />
                  ))}
                </div>
              </div>

              {/* 上传模式切换 */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <Radio.Group
                  value={uploadMode}
                  onChange={(e) => { setUploadMode(e.target.value); setBatchFiles([]); setSelectedBatchFile(null); }}
                  buttonStyle="solid"
                  size="middle"
                >
                  <Radio.Button value="single">
                    <FileOutlined style={{ marginRight: 6 }} />单张上传
                  </Radio.Button>
                  <Radio.Button value="batch">
                    <AppstoreOutlined style={{ marginRight: 6 }} />批量上传
                  </Radio.Button>
                </Radio.Group>
              </div>

              {uploadMode === 'single' ? (
                /* 单张上传区域 */
                <motion.div
                  onDragEnter={() => setIsDragging(true)}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={() => setIsDragging(false)}
                >
                  <Dragger
                    name="file"
                    multiple={false}
                    showUploadList={false}
                    beforeUpload={handleUpload}
                    disabled={uploading}
                    accept={ACCEPT_FORMATS}
                    style={{
                      background: isDragging 
                        ? 'rgba(102, 126, 234, 0.15)' 
                        : 'rgba(102, 126, 234, 0.05)',
                      border: isDragging 
                        ? '2px dashed #74f7fd' 
                        : '2px dashed rgba(116, 247, 253, 0.3)',
                      borderRadius: 20,
                      padding: uploading ? 30 : 50,
                      transition: 'all 0.3s ease',
                    }}
                  >
                    {uploading ? (
                      <div>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                          style={{
                            width: 80, height: 80, margin: '0 auto 20px',
                            borderRadius: '50%',
                            border: '3px solid rgba(116, 247, 253, 0.2)',
                            borderTopColor: '#74f7fd',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <CloudUploadOutlined style={{ fontSize: 32, color: '#74f7fd' }} />
                        </motion.div>
                        <TechProgressBar percent={uploadProgress} status={uploadStatus} />
                      </div>
                    ) : (
                      <>
                        <motion.div whileHover={{ scale: 1.1 }} transition={{ type: 'spring', stiffness: 300 }}>
                          <div style={{
                            width: 100, height: 100, margin: '0 auto 24px', borderRadius: 24,
                            background: 'linear-gradient(135deg, rgba(116, 247, 253, 0.2) 0%, rgba(91, 199, 250, 0.2) 100%)',
                            border: '2px solid rgba(116, 247, 253, 0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <InboxOutlined style={{ fontSize: 48, color: '#74f7fd' }} />
                          </div>
                        </motion.div>
                        <Title level={4} style={{ color: '#fff', marginBottom: 8 }}>
                          点击或拖拽文件到此区域上传
                        </Title>
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
                          支持 GeoTIFF、PNG、JPEG、ENVI IMG、HDF、NetCDF 等格式
                        </Text>
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} style={{ marginTop: 24 }}>
                          <Button
                            type="primary" size="large" icon={<CloudUploadOutlined />}
                            style={{
                              height: 48, paddingLeft: 32, paddingRight: 32, borderRadius: 12,
                              background: 'linear-gradient(135deg, #74f7fd 0%, #5bc7fa 100%)',
                              border: 'none', boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)',
                              fontSize: 15, pointerEvents: 'none',
                            }}
                          >
                            选择文件上传
                          </Button>
                        </motion.div>
                      </>
                    )}
                  </Dragger>
                </motion.div>
              ) : (
                /* 批量上传区域 — 真·批量：勾选 + 一次性配置一遍类别 + 并行分割 + 逐张审查 */
                <div>
                  <BatchUploader
                    mode="batch"
                    showModeSwitch={false}
                    onBatchUploaded={handleBatchUploaded}
                    accept={ACCEPT_FORMATS}
                    maxFiles={50}
                  />
                  {batchFiles.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{ marginTop: 16 }}
                    >
                      <Alert
                        type="success"
                        showIcon
                        icon={<ThunderboltOutlined />}
                        message={
                          <span>
                            <b>已勾选 {selectedBatchFileIds.length} / {batchFiles.length} 张</b>
                            ：将统一配置一次类别，对所有勾选图像
                            <Tag color="cyan" style={{ marginLeft: 6 }}>并行分割</Tag>
                            产出
                            <Tag color="green" style={{ marginLeft: 0 }}>{selectedBatchFileIds.length} 张标注</Tag>
                            的批量数据集
                          </span>
                        }
                        description="点击图像左上角勾选/取消选择；右侧按钮可一键全选或清空。配置完类别后会一次跑通整个批次，最后逐张审查与精修。"
                        style={{
                          background: 'rgba(82, 196, 26, 0.06)',
                          border: '1px solid rgba(82, 196, 26, 0.25)',
                          borderRadius: 10,
                          marginBottom: 12,
                        }}
                      />

                      {/* 批量操作工具栏 */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                        padding: '8px 12px', borderRadius: 10,
                        background: 'rgba(116, 247, 253, 0.04)',
                        border: '1px solid rgba(116, 247, 253, 0.15)',
                      }}>
                        <Tag color="cyan" style={{ fontWeight: 600, fontSize: 12 }}>
                          {selectedBatchFileIds.length} / {batchFiles.length}
                        </Tag>
                        <Button
                          size="small"
                          onClick={() => setSelectedBatchFileIds(batchFiles.map((f) => f.file_id))}
                          disabled={selectedBatchFileIds.length === batchFiles.length}
                          style={{ borderColor: 'rgba(116, 247, 253, 0.4)', color: '#74f7fd', background: 'transparent' }}
                        >
                          全选
                        </Button>
                        <Button
                          size="small"
                          onClick={() => setSelectedBatchFileIds([])}
                          disabled={selectedBatchFileIds.length === 0}
                          style={{ borderColor: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.6)', background: 'transparent' }}
                        >
                          清空
                        </Button>
                        <Button
                          size="small"
                          onClick={() => setSelectedBatchFileIds(
                            batchFiles.map((f) => f.file_id).filter((id) => !selectedBatchFileIds.includes(id))
                          )}
                          style={{ borderColor: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.6)', background: 'transparent' }}
                        >
                          反选
                        </Button>
                        <div style={{ flex: 1 }} />
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                          <Button
                            type="primary"
                            icon={<ArrowRightOutlined />}
                            onClick={handleBatchNext}
                            disabled={selectedBatchFileIds.length === 0}
                            style={{
                              height: 36,
                              paddingLeft: 18, paddingRight: 18,
                              borderRadius: 8,
                              background: selectedBatchFileIds.length > 0
                                ? 'linear-gradient(135deg, #52c41a 0%, #74f7fd 100%)'
                                : undefined,
                              border: 'none',
                              fontWeight: 600,
                            }}
                          >
                            批量制作 {selectedBatchFileIds.length} 张数据集
                          </Button>
                        </motion.div>
                      </div>

                      {/* 缩略图网格（多选） */}
                      <Row gutter={[12, 12]}>
                        {batchFiles.map((f) => {
                          const isSelected = selectedBatchFileIds.includes(f.file_id);
                          const isPreviewing = previewSingleFromBatch === f.file_id;
                          return (
                            <Col span={6} key={f.file_id}>
                              <motion.div
                                whileHover={{ scale: 1.02, y: -1 }}
                                whileTap={{ scale: 0.98 }}
                                style={{
                                  position: 'relative',
                                  cursor: 'pointer',
                                  borderRadius: 12,
                                  overflow: 'hidden',
                                  border: isSelected
                                    ? '2px solid #52c41a'
                                    : isPreviewing
                                      ? '2px solid #74f7fd'
                                      : '2px solid rgba(255,255,255,0.08)',
                                  background: isSelected
                                    ? 'rgba(82, 196, 26, 0.08)'
                                    : 'rgba(0,0,0,0.2)',
                                  transition: 'border 0.2s ease, background 0.2s ease',
                                }}
                              >
                                {/* 勾选图标（左上角，点击切换勾选） */}
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleBatchFileSelection(f.file_id);
                                  }}
                                  style={{
                                    position: 'absolute',
                                    top: 6, left: 6, zIndex: 5,
                                    width: 26, height: 26, borderRadius: 6,
                                    background: isSelected
                                      ? '#52c41a'
                                      : 'rgba(0,0,0,0.55)',
                                    border: isSelected
                                      ? '1.5px solid #52c41a'
                                      : '1.5px solid rgba(255,255,255,0.45)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontSize: 14, fontWeight: 700,
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                                  }}
                                  title={isSelected ? '取消选中' : '加入批量制作'}
                                >
                                  {isSelected ? '✓' : ''}
                                </div>
                                {/* 缩略图（点击切换勾选） */}
                                <div
                                  onClick={() => toggleBatchFileSelection(f.file_id)}
                                  style={{ width: '100%', height: 100 }}
                                >
                                  {f.preview_url && (
                                    <img
                                      src={f.preview_url}
                                      alt={f.filename}
                                      style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
                                    />
                                  )}
                                </div>
                                {/* 文件名 + 单张预览按钮 */}
                                <div style={{
                                  padding: '6px 8px',
                                  display: 'flex', alignItems: 'center', gap: 6,
                                  background: 'rgba(0,0,0,0.35)',
                                }}>
                                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', flex: 1 }} ellipsis>
                                    {f.filename}
                                  </Text>
                                  <Tooltip title="只看这张（预览模式，不进入批量）">
                                    <Button
                                      size="small"
                                      type="text"
                                      icon={<ZoomInOutlined />}
                                      onClick={(e) => { e.stopPropagation(); handlePreviewSingleFromBatch(f); }}
                                      style={{
                                        color: isPreviewing ? '#74f7fd' : 'rgba(255,255,255,0.5)',
                                        padding: 0, height: 22, width: 22,
                                      }}
                                    />
                                  </Tooltip>
                                </div>
                              </motion.div>
                            </Col>
                          );
                        })}
                      </Row>

                      <div style={{
                        marginTop: 10, padding: '8px 12px',
                        borderRadius: 8, fontSize: 11,
                        background: 'rgba(255,255,255,0.03)',
                        color: 'rgba(255,255,255,0.45)',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <BulbOutlined />
                        操作提示：点击图像或勾选框可加入/移出批次，
                        <ZoomInOutlined style={{ marginLeft: 2 }} /> 图标可切换为单张预览模式（仅查看，不分割）。
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {/* 功能特性卡片 */}
              <Row gutter={20} style={{ marginTop: 32 }}>
                {[
                  {
                    icon: <FileImageOutlined />,
                    title: '多格式支持',
                    desc: 'GeoTIFF / PNG / HDF / NetCDF',
                    color: '#74f7fd',
                  },
                  {
                    icon: <DatabaseOutlined />,
                    title: '多波段处理',
                    desc: 'RGB / 多光谱 / 高光谱',
                    color: '#5bc7fa',
                  },
                  {
                    icon: <GlobalOutlined />,
                    title: '地理信息',
                    desc: '自动保留投影坐标',
                    color: '#52c41a',
                  },
                  {
                    icon: <ExpandOutlined />,
                    title: '超大图像',
                    desc: '支持 10GB+ 文件',
                    color: '#faad14',
                  },
                ].map((item, index) => (
                  <Col span={6} key={index}>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      whileHover={{ y: -4 }}
                    >
                      <Card 
                        size="small" 
                        style={{ 
                          background: `${item.color}10`, 
                          border: `1px solid ${item.color}25`, 
                          textAlign: 'center',
                          borderRadius: 12,
                        }}
                      >
                        <div style={{
                          width: 40,
                          height: 40,
                          margin: '0 auto 12px',
                          borderRadius: 10,
                          background: `${item.color}20`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 20,
                          color: item.color,
                        }}>
                          {item.icon}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: 500 }}>
                          {item.title}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>
                          {item.desc}
                        </div>
                      </Card>
                    </motion.div>
                  </Col>
                ))}
              </Row>
            </Card>
          </motion.div>
        ) : (
          <UploadedImagePreview 
            uploadedFile={uploadedFile}
            onReset={handleReset}
            onNext={handleNext}
            formatFileSize={formatFileSize}
            getFileFormat={getFileFormat}
          />
        )}
      </AnimatePresence>
      </WidgetPanel>
    </div>
  );
};

export default UploadZone;
