/**
 * RS Dataset Factory - 结果展示视图
 * 科技感UI设计 - 简体中文版
 */
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { 
  Card, Typography, Row, Col, Button, Space, 
  Tag, Modal, message
} from 'antd';
import { 
  CheckCircleOutlined, DownloadOutlined, 
  PieChartOutlined, BarChartOutlined, EyeOutlined,
  ReloadOutlined, DatabaseOutlined, RocketOutlined,
  CloseOutlined, LeftOutlined, RightOutlined,
  TrophyOutlined, FireOutlined
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { api, TaskResult } from '../../services/api';
import { useAppStore } from '../../stores/appStore';

const { Title, Text } = Typography;

// 科技感配色
const CHART_COLORS = [
  '#00f0ff', '#8b5cf6', '#ff00aa', '#00ff88', 
  '#ffb800', '#ff6b35', '#3b82f6', '#ec4899'
];

// 庆祝动画粒子
const CelebrationParticles: React.FC = () => {
  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 2,
    duration: 2 + Math.random() * 2,
    size: 4 + Math.random() * 8,
    color: CHART_COLORS[Math.floor(Math.random() * CHART_COLORS.length)],
  }));

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      overflow: 'hidden',
      pointerEvents: 'none',
    }}>
      {particles.map(p => (
        <motion.div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            bottom: -20,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: p.color,
            boxShadow: `0 0 ${p.size}px ${p.color}`,
          }}
          initial={{ y: 0, opacity: 1 }}
          animate={{ 
            y: -400 - Math.random() * 200,
            x: (Math.random() - 0.5) * 100,
            opacity: [1, 1, 0],
            scale: [1, 0.5],
          }}
          transition={{ 
            duration: p.duration,
            delay: p.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
};

// 计数动画 Hook
const useCountUp = (end: number, duration: number = 1500, delay: number = 0) => {
  const [count, setCount] = useState(0);
  const countRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    const delayTimer = setTimeout(() => {
      startTimeRef.current = performance.now();
      
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);
        
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        countRef.current = Math.floor(easeOutQuart * end);
        setCount(countRef.current);
        
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        }
      };
      
      rafRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(delayTimer);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [end, duration, delay]);

  return count;
};

// 科技感统计卡片
const StatCard: React.FC<{
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  delay?: number;
}> = ({ title, value, icon, color, delay = 0 }) => {
  const numericValue = typeof value === 'number' ? value : parseFloat(value) || 0;
  const isNumeric = typeof value === 'number' || !isNaN(parseFloat(value as string));
  const animatedValue = useCountUp(isNumeric ? numericValue : 0, 1500, delay * 1000);
  const displayValue = isNumeric 
    ? (typeof value === 'string' && value.endsWith('s') 
        ? `${animatedValue}s` 
        : animatedValue)
    : value;

  return (
  <motion.div
    initial={{ opacity: 0, y: 30, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ delay, duration: 0.5, ease: 'easeOut' }}
    whileHover={{ scale: 1.02, y: -4 }}
    style={{ height: '100%' }}
  >
    <Card 
      className="glass-card" 
      style={{ 
        height: '100%',
        background: `linear-gradient(135deg, ${color}10 0%, transparent 100%)`,
        borderColor: `${color}30`,
        position: 'relative',
        overflow: 'hidden',
      }}
      bodyStyle={{ padding: '20px' }}
    >
      {/* 背景装饰 */}
      <div style={{
        position: 'absolute',
        top: -30,
        right: -30,
        width: 100,
        height: 100,
        background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
        borderRadius: '50%',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: `linear-gradient(135deg, ${color}20 0%, ${color}40 100%)`,
          border: `1px solid ${color}50`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          color: color,
          boxShadow: `0 0 20px ${color}30`,
        }}>
          {icon}
        </div>
        <div>
          <div style={{ 
            fontSize: 12, 
            color: 'rgba(255,255,255,0.5)',
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {title}
          </div>
          <div style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 28,
            fontWeight: 700,
            color: color,
            lineHeight: 1,
            textShadow: `0 0 20px ${color}50`,
          }}>
            {displayValue}
          </div>
        </div>
      </div>
    </Card>
  </motion.div>
);};

// 图片灯箱组件
const Lightbox: React.FC<{
  images: string[];
  currentIndex: number;
  visible: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}> = ({ images, currentIndex, visible, onClose, onPrev, onNext }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!visible) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose, onPrev, onNext]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 10, 15, 0.95)',
          backdropFilter: 'blur(20px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={onClose}
      >
        {/* 关闭按钮 */}
        <Button
          type="text"
          icon={<CloseOutlined />}
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            color: '#fff',
            fontSize: 20,
            zIndex: 1001,
          }}
          onClick={onClose}
        />

        {/* 上一张 */}
        <Button
          type="text"
          icon={<LeftOutlined />}
          style={{
            position: 'absolute',
            left: 20,
            color: '#fff',
            fontSize: 24,
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
            zIndex: 1001,
          }}
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
        />

        {/* 图片 */}
        <motion.img
          key={currentIndex}
          src={images[currentIndex]}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          style={{
            maxWidth: '90%',
            maxHeight: '90%',
            objectFit: 'contain',
            borderRadius: 8,
            boxShadow: '0 0 60px rgba(0, 240, 255, 0.3)',
          }}
          onClick={(e) => e.stopPropagation()}
        />

        {/* 下一张 */}
        <Button
          type="text"
          icon={<RightOutlined />}
          style={{
            position: 'absolute',
            right: 20,
            color: '#fff',
            fontSize: 24,
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
            zIndex: 1001,
          }}
          onClick={(e) => { e.stopPropagation(); onNext(); }}
        />

        {/* 计数器 */}
        <div style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.7)',
          fontSize: 14,
          fontFamily: 'Orbitron, sans-serif',
        }}>
          {currentIndex + 1} / {images.length}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// 发光下载按钮
const GlowButton: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
}> = ({ onClick, icon, children, primary = true, disabled = false }) => (
  <motion.button
    onClick={disabled ? undefined : onClick}
    whileHover={disabled ? {} : { scale: 1.02, y: -2 }}
    whileTap={disabled ? {} : { scale: 0.98 }}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '14px 32px',
      fontSize: 15,
      fontWeight: 600,
      fontFamily: 'Space Grotesk, sans-serif',
      letterSpacing: '0.02em',
      color: disabled ? 'rgba(255,255,255,0.5)' : (primary ? '#0a0a0f' : '#f0f6fc'),
      background: disabled 
        ? 'rgba(255,255,255,0.1)'
        : (primary 
          ? 'linear-gradient(135deg, #00f0ff 0%, #8b5cf6 50%, #ff00aa 100%)'
          : 'transparent'),
      backgroundSize: '200% 200%',
      border: primary ? 'none' : '1px solid rgba(255,255,255,0.2)',
      borderRadius: 12,
      cursor: disabled ? 'not-allowed' : 'pointer',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: disabled ? 'none' : (primary 
        ? '0 0 30px rgba(0, 240, 255, 0.4), 0 0 60px rgba(139, 92, 246, 0.2)'
        : 'none'),
      animation: (primary && !disabled) ? 'glow-pulse 2s ease-in-out infinite' : 'none',
      opacity: disabled ? 0.6 : 1,
    }}
  >
    {icon}
    {children}
    
    {/* 光效扫过 */}
    <div style={{
      position: 'absolute',
      top: 0,
      left: '-100%',
      width: '100%',
      height: '100%',
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
      animation: 'shine 3s infinite',
    }} />

    <style>{`
      @keyframes glow-pulse {
        0%, 100% { box-shadow: 0 0 30px rgba(0, 240, 255, 0.4), 0 0 60px rgba(139, 92, 246, 0.2); }
        50% { box-shadow: 0 0 40px rgba(0, 240, 255, 0.6), 0 0 80px rgba(139, 92, 246, 0.4); }
      }
      @keyframes shine {
        0% { left: -100%; }
        50%, 100% { left: 100%; }
      }
    `}</style>
  </motion.button>
);

// ============================================================================
// 批量结果视图 — 列出所有批次 task 的缩略图、状态、下载按钮，支持逐张审查精修
// ============================================================================
const BatchResultsView: React.FC = () => {
  const {
    batchFiles, selectedBatchFileIds, batchTasks,
    setActiveBatchFileId, setCurrentTask, setCurrentStep, reset,
  } = useAppStore();
  const [downloading, setDownloading] = useState<string | null>(null);

  const targetFiles = useMemo(
    () => batchFiles.filter((f) => selectedBatchFileIds.includes(f.file_id)),
    [batchFiles, selectedBatchFileIds],
  );
  const completedCount = targetFiles.filter((f) => batchTasks[f.file_id]?.status === 'completed').length;
  const failedCount = targetFiles.filter((f) => batchTasks[f.file_id]?.status === 'failed').length;

  const handleEditOne = useCallback((fileId: string) => {
    const task = batchTasks[fileId];
    if (!task) {
      message.warning('该图像尚未处理完成');
      return;
    }
    if (task.status !== 'completed') {
      message.warning(`当前状态: ${task.status}，无法精修`);
      return;
    }
    setActiveBatchFileId(fileId);
    setCurrentTask(task);
    setCurrentStep('annotate' as any);
    message.success('进入单张精修视图');
  }, [batchTasks, setActiveBatchFileId, setCurrentTask, setCurrentStep]);

  const handleDownloadOne = useCallback(async (fileId: string, filename: string) => {
    const task = batchTasks[fileId];
    if (!task || task.status !== 'completed') {
      message.warning('任务未完成，无法下载');
      return;
    }
    setDownloading(fileId);
    try {
      const baseName = filename.replace(/\.[^.]+$/, '');
      await api.downloadDataset(task.task_id, `${baseName}.zip`);
      message.success(`已下载 ${baseName}.zip`);
    } catch (e: any) {
      message.error(e?.message || '下载失败');
    } finally {
      setDownloading(null);
    }
  }, [batchTasks]);

  const handleDownloadAll = useCallback(async () => {
    const completedFiles = targetFiles.filter((f) => batchTasks[f.file_id]?.status === 'completed');
    if (completedFiles.length === 0) {
      message.warning('没有可下载的完成任务');
      return;
    }
    setDownloading('__all__');
    let ok = 0;
    for (const f of completedFiles) {
      const task = batchTasks[f.file_id];
      try {
        const baseName = f.filename.replace(/\.[^.]+$/, '');
        await api.downloadDataset(task.task_id, `${baseName}.zip`);
        ok += 1;
      } catch {}
    }
    setDownloading(null);
    message.success(`批量下载完成: ${ok}/${completedFiles.length}`);
  }, [targetFiles, batchTasks]);

  const handleNewBatch = useCallback(() => {
    reset();
    setCurrentStep('upload' as any);
  }, [reset, setCurrentStep]);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 20px' }}>
      {/* 顶部横幅 */}
      <Card className="glass-card" style={{ marginBottom: 24 }}>
        <Row align="middle" gutter={20}>
          <Col flex="0 0 auto">
            <div style={{
              width: 60, height: 60, borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(82,196,26,0.2), rgba(0,240,255,0.2))',
              border: '1px solid rgba(82,196,26,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <TrophyOutlined style={{ fontSize: 30, color: '#52c41a' }} />
            </div>
          </Col>
          <Col flex="1">
            <Title level={3} style={{ margin: 0 }}>
              <span className="gradient-text">批量数据集制作完成</span>
            </Title>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <Tag color="green" icon={<CheckCircleOutlined />}>{completedCount} 成功</Tag>
              {failedCount > 0 && <Tag color="red">{failedCount} 失败</Tag>}
              <Tag color="cyan">{targetFiles.length} 张总计</Tag>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                · 点击任意一张可进入精修，或一键下载全部
              </Text>
            </div>
          </Col>
          <Col flex="0 0 auto">
            <Space>
              <Button
                size="large"
                icon={<DownloadOutlined />}
                loading={downloading === '__all__'}
                disabled={completedCount === 0}
                onClick={handleDownloadAll}
                type="primary"
                style={{
                  background: 'linear-gradient(135deg,#52c41a,#00f0ff)',
                  border: 'none',
                  fontWeight: 600,
                }}
              >
                全部下载 ({completedCount})
              </Button>
              <Button size="large" icon={<ReloadOutlined />} onClick={handleNewBatch}>
                新批次
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 任务卡片网格 */}
      <Row gutter={[16, 16]}>
        {targetFiles.map((f) => {
          const task = batchTasks[f.file_id];
          const status = task?.status || 'pending';
          const result = task?.result as TaskResult | undefined;
          const isCompleted = status === 'completed';
          const isFailed = status === 'failed';
          const cardBorder = isCompleted ? 'rgba(82,196,26,0.5)' : isFailed ? 'rgba(255,77,79,0.5)' : 'rgba(255,255,255,0.1)';
          // 取一张可视化 thumb
          const thumbUrl = isCompleted && task ? `/api/visualizations/${task.task_id}/0` : f.preview_url;
          return (
            <Col span={8} key={f.file_id}>
              <Card
                className="glass-card"
                style={{ border: `1px solid ${cardBorder}`, height: '100%' }}
                styles={{ body: { padding: 12 } }}
              >
                <div style={{
                  position: 'relative', borderRadius: 8, overflow: 'hidden',
                  marginBottom: 10, height: 160,
                  background: 'rgba(0,0,0,0.4)',
                }}>
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={f.filename}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { (e.target as HTMLImageElement).src = f.preview_url || ''; }}
                    />
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)' }}>
                      <DatabaseOutlined style={{ fontSize: 32 }} />
                    </div>
                  )}
                  <div style={{
                    position: 'absolute', top: 8, left: 8,
                    background: 'rgba(0,0,0,0.7)', borderRadius: 6,
                    padding: '2px 8px', fontSize: 11, color: '#fff',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {isCompleted ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                      : isFailed ? <CloseCircleOutlined style={{ color: '#ff4757' }} />
                      : <FireOutlined style={{ color: '#00f0ff' }} />}
                    {status}
                  </div>
                </div>

                <Text style={{ color: '#fff', fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }} ellipsis>
                  {f.filename}
                </Text>

                {result && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    <Tag color="cyan" style={{ margin: 0, fontSize: 10 }}>训 {result.train_samples}</Tag>
                    <Tag color="green" style={{ margin: 0, fontSize: 10 }}>验 {result.val_samples}</Tag>
                    <Tag color="orange" style={{ margin: 0, fontSize: 10 }}>测 {result.test_samples}</Tag>
                  </div>
                )}

                <Space size={6} style={{ width: '100%' }}>
                  <Button
                    size="small"
                    type="primary"
                    icon={<EyeOutlined />}
                    disabled={!isCompleted}
                    onClick={() => handleEditOne(f.file_id)}
                    style={{
                      flex: 1,
                      background: isCompleted ? 'linear-gradient(135deg,#00f0ff,#8b5cf6)' : undefined,
                      border: 'none',
                    }}
                  >
                    精修
                  </Button>
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    disabled={!isCompleted}
                    loading={downloading === f.file_id}
                    onClick={() => handleDownloadOne(f.file_id, f.filename)}
                  >
                    下载
                  </Button>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
};

// 主组件
const ResultsView: React.FC = () => {
  const { currentTask, reset, setCurrentStep, selectedBatchFileIds } = useAppStore();
  // 批量模式：勾选 > 1 时走批量结果视图
  if (selectedBatchFileIds.length > 1) {
    return <BatchResultsView />;
  }
  const [visualizations, setVisualizations] = useState<string[]>([]);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showCelebration, setShowCelebration] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const result = currentTask?.result as TaskResult | undefined;
  // 使用任务ID来调用API（不是result中的task_id）
  const taskId = currentTask?.task_id;

  useEffect(() => {
    // 使用任务ID来获取可视化
    if (taskId && currentTask?.status === 'completed') {
      api.getVisualizations(taskId)
        .then(data => {
          console.log('可视化数据:', data);
          setVisualizations(data.visualizations || []);
        })
        .catch(err => {
          console.error('获取可视化失败:', err);
        });
    }

    // 3秒后关闭庆祝动画
    const timer = setTimeout(() => setShowCelebration(false), 3000);
    return () => clearTimeout(timer);
  }, [taskId, currentTask?.status]);

  if (!result) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Text style={{ color: 'rgba(255,255,255,0.5)' }}>暂无结果数据</Text>
      </div>
    );
  }

  const splitData = [
    { name: '训练集', value: result.train_samples, color: '#00f0ff' },
    { name: '验证集', value: result.val_samples, color: '#00ff88' },
    { name: '测试集', value: result.test_samples, color: '#ffb800' },
  ];

  const classDistData = Object.entries(result.class_distribution || {})
    .filter(([_, data]: [string, any]) => data.ratio > 0.001)
    .map(([name, data]: [string, any], index) => ({
      name,
      value: parseFloat((data.ratio * 100).toFixed(2)),
      pixels: data.pixels,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const handleDownload = async () => {
    // 使用任务ID来下载
    if (!taskId) {
      message.error('任务ID不存在');
      return;
    }
    
    setDownloading(true);
    try {
      await api.downloadDataset(taskId, result?.dataset_name ? `${result.dataset_name}.zip` : undefined);
      message.success('数据集下载完成！');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '下载失败';
      message.error(msg);
    } finally {
      setDownloading(false);
    }
  };

  const handleNewTask = () => {
    reset();
    setCurrentStep('upload');
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxVisible(true);
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 20px' }}>
      {/* 成功横幅 */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <Card 
          className="glass-card"
          style={{ 
            marginBottom: 32,
            background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.08) 0%, rgba(0, 240, 255, 0.08) 50%, rgba(139, 92, 246, 0.08) 100%)',
            border: '1px solid rgba(0, 255, 136, 0.3)',
            position: 'relative',
            overflow: 'hidden',
          }}
          bodyStyle={{ padding: '32px 40px' }}
        >
          {/* 庆祝粒子 */}
          {showCelebration && <CelebrationParticles />}

          {/* 背景装饰 */}
          <div style={{
            position: 'absolute',
            top: -100,
            right: -100,
            width: 300,
            height: 300,
            background: 'radial-gradient(circle, rgba(0, 255, 136, 0.1) 0%, transparent 70%)',
            borderRadius: '50%',
          }} />

          <Row align="middle" gutter={32}>
            <Col>
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 20,
                  background: 'linear-gradient(135deg, #00ff88 0%, #00f0ff 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 40px rgba(0, 255, 136, 0.5)',
                }}
              >
                <TrophyOutlined style={{ fontSize: 40, color: '#0a0a0f' }} />
              </motion.div>
            </Col>
            <Col flex={1}>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Title level={2} style={{ margin: 0, marginBottom: 8 }}>
                  <span className="gradient-text">🎉 数据集生成成功！</span>
                </Title>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15 }}>
                  处理耗时 <span style={{ color: '#00f0ff', fontWeight: 600 }}>{result.processing_time?.toFixed(1)}</span> 秒 · 
                  图像尺寸 <span style={{ color: '#8b5cf6', fontWeight: 600 }}>{result.image_size?.[0]} × {result.image_size?.[1]}</span> 像素
                </Text>
              </motion.div>
            </Col>
            <Col>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Space size={16}>
                  <GlowButton 
                    onClick={handleDownload} 
                    icon={downloading ? <span className="anticon anticon-loading anticon-spin"><svg viewBox="0 0 1024 1024" focusable="false" data-icon="loading" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M988 548c-19.9 0-36-16.1-36-36 0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 00-94.3-139.9 437.71 437.71 0 00-139.9-94.3C629 83.6 571.4 72 512 72c-19.9 0-36-16.1-36-36s16.1-36 36-36c69.1 0 136.2 13.5 199.3 40.3C772.3 66 827 103 googl874 150c47 47 83.9 101.8 109.7 162.7 26.7 63.1 40.2 130.2 40.2 199.3.1 19.9-16 36-35.9 36z"></path></svg></span> : <DownloadOutlined style={{ fontSize: 18 }} />}
                    primary
                    disabled={downloading}
                  >
                    {downloading ? '下载中...' : '下载数据集'}
                  </GlowButton>
                  <GlowButton 
                    onClick={handleNewTask} 
                    icon={<ReloadOutlined />}
                    primary={false}
                  >
                    新建任务
                  </GlowButton>
                </Space>
              </motion.div>
            </Col>
          </Row>
        </Card>
      </motion.div>

      {/* 统计卡片 */}
      <Row gutter={[20, 20]} style={{ marginBottom: 32 }}>
        <Col span={4}>
          <StatCard 
            title="总样本数" 
            value={result.total_samples ?? 0} 
            icon={<DatabaseOutlined />}
            color="#00f0ff"
            delay={0.1}
          />
        </Col>
        <Col span={4}>
          <StatCard 
            title="训练样本" 
            value={result.train_samples ?? 0} 
            icon={<RocketOutlined />}
            color="#00ff88"
            delay={0.15}
          />
        </Col>
        <Col span={4}>
          <StatCard 
            title="验证样本" 
            value={result.val_samples ?? 0} 
            icon={<FireOutlined />}
            color="#ffb800"
            delay={0.2}
          />
        </Col>
        <Col span={4}>
          <StatCard 
            title="测试样本" 
            value={result.test_samples ?? 0} 
            icon={<CheckCircleOutlined />}
            color="#ff6b35"
            delay={0.25}
          />
        </Col>
        <Col span={4}>
          <StatCard 
            title="类别数量" 
            value={result.num_classes ?? 0} 
            icon={<PieChartOutlined />}
            color="#8b5cf6"
            delay={0.3}
          />
        </Col>
        <Col span={4}>
          <StatCard 
            title="处理耗时" 
            value={`${result.processing_time?.toFixed(1)}s`} 
            icon={<CloseOutlined style={{ transform: 'rotate(45deg)' }} />}
            color="#ff00aa"
            delay={0.35}
          />
        </Col>
      </Row>

      {/* 图表区域 */}
      <Row gutter={24} style={{ marginBottom: 32 }}>
        {/* 类别分布图 */}
        <Col span={12}>
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card 
              className="glass-card scanline"
              title={
                <Space>
                  <BarChartOutlined style={{ color: '#00f0ff' }} />
                  <span>类别像素分布</span>
                  <Tag color="cyan" style={{ marginLeft: 8 }}>TOP {classDistData.length}</Tag>
                </Space>
              }
            >
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={classDistData} layout="vertical" margin={{ left: 20 }}>
                  <defs>
                    {classDistData.map((entry, index) => (
                      <linearGradient key={index} id={`barGrad${index}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={entry.color} stopOpacity={0.8} />
                        <stop offset="100%" stopColor={entry.color} stopOpacity={0.4} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis 
                    type="number" 
                    stroke="rgba(255,255,255,0.3)"
                    tickFormatter={(v) => `${v}%`}
                    fontSize={11}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    stroke="rgba(255,255,255,0.3)"
                    width={100}
                    tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      background: 'rgba(13, 17, 23, 0.95)', 
                      border: '1px solid rgba(0, 240, 255, 0.3)',
                      borderRadius: 12,
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                    }}
                    itemStyle={{ color: '#00f0ff' }}
                    formatter={(value: any) => [`${value}%`, '占比']}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {classDistData.map((_, index) => (
                      <Cell key={index} fill={`url(#barGrad${index})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </motion.div>
        </Col>

        {/* 数据集划分饼图 */}
        <Col span={12}>
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card 
              className="glass-card scanline"
              title={
                <Space>
                  <PieChartOutlined style={{ color: '#8b5cf6' }} />
                  <span>数据集划分比例</span>
                </Space>
              }
            >
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <defs>
                    {splitData.map((entry, index) => (
                      <linearGradient key={index} id={`pieGrad${index}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={entry.color} />
                        <stop offset="100%" stopColor={entry.color} stopOpacity={0.6} />
                      </linearGradient>
                    ))}
                  </defs>
                  <Pie
                    data={splitData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: 'rgba(255,255,255,0.3)' }}
                  >
                    {splitData.map((entry, index) => (
                      <Cell 
                        key={index} 
                        fill={`url(#pieGrad${index})`}
                        stroke={entry.color}
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      background: 'rgba(13, 17, 23, 0.95)', 
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: 12,
                    }}
                    formatter={(value: any, name: string) => [`${value} 张`, name]}
                  />
                  <Legend 
                    verticalAlign="bottom"
                    iconType="circle"
                    formatter={(value) => <span style={{ color: 'rgba(255,255,255,0.7)' }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </motion.div>
        </Col>
      </Row>

      {/* 可视化图片画廊 */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card 
          className="glass-card"
          title={
            <Space>
              <EyeOutlined style={{ color: '#ff00aa' }} />
              <span>可视化结果预览</span>
              <Tag 
                style={{ 
                  background: 'linear-gradient(135deg, #ff00aa20, #8b5cf620)',
                  border: '1px solid #ff00aa50',
                  color: '#ff00aa',
                }}
              >
                {visualizations.length} 张图像
              </Tag>
            </Space>
          }
        >
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20,
          }}>
            {visualizations.length === 0 ? (
              <div style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '60px 20px',
                color: 'rgba(255,255,255,0.5)',
              }}>
                <EyeOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }} />
                <div style={{ fontSize: 16 }}>正在加载可视化结果...</div>
                <div style={{ fontSize: 13, marginTop: 8, opacity: 0.6 }}>
                  如果长时间无法加载，请尝试刷新页面
                </div>
              </div>
            ) : visualizations.map((url, index) => {
              const filename = url.split('/').pop() || '';
              const name = filename.replace('.png', '').replace(/_/g, ' ');
              
              return (
                <motion.div
                  key={index}
                  className="vis-item"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + index * 0.05 }}
                  whileHover={{ scale: 1.03, y: -8 }}
                  onClick={() => openLightbox(index)}
                  style={{
                    borderRadius: 16,
                    overflow: 'hidden',
                    border: '1px solid rgba(0, 240, 255, 0.15)',
                    background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.8) 0%, rgba(30, 41, 59, 0.6) 100%)',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  <div style={{ 
                    position: 'relative', 
                    overflow: 'hidden',
                    height: 180,
                  }}>
                    <img 
                      src={url} 
                      alt={name} 
                      loading="lazy"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transition: 'transform 0.4s ease',
                      }}
                    />
                    {/* 悬浮遮罩 */}
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.8) 100%)',
                      opacity: 0,
                      transition: 'opacity 0.3s ease',
                    }} className="hover-overlay" />
                    {/* 发光边框效果 */}
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      border: '2px solid rgba(0, 240, 255, 0.5)',
                      borderRadius: 16,
                      opacity: 0,
                      transition: 'opacity 0.3s ease',
                      boxShadow: 'inset 0 0 20px rgba(0, 240, 255, 0.3)',
                    }} className="hover-glow" />
                    {/* 查看图标 */}
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%) scale(0.8)',
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #00f0ff 0%, #8b5cf6 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0,
                      transition: 'all 0.3s ease',
                      boxShadow: '0 0 40px rgba(0, 240, 255, 0.6)',
                    }} className="hover-icon">
                      <EyeOutlined style={{ fontSize: 24, color: '#fff' }} />
                    </div>
                    {/* 序号标签 */}
                    <div style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      padding: '4px 10px',
                      borderRadius: 8,
                      background: 'rgba(0, 0, 0, 0.6)',
                      backdropFilter: 'blur(4px)',
                      fontSize: 11,
                      fontFamily: 'Orbitron, sans-serif',
                      color: '#00f0ff',
                      border: '1px solid rgba(0, 240, 255, 0.3)',
                    }}>
                      #{String(index + 1).padStart(2, '0')}
                    </div>
                  </div>
                  <div style={{
                    padding: '14px 16px',
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.8)',
                    fontFamily: 'JetBrains Mono, monospace',
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.4) 100%)',
                    borderTop: '1px solid rgba(0, 240, 255, 0.1)',
                    textTransform: 'capitalize',
                  }}>
                    {name}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </Card>
      </motion.div>

      {/* Presence Scores */}
      {result.presence_scores && Object.keys(result.presence_scores).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          style={{ marginTop: 32 }}
        >
          <Card 
            className="glass-card"
            title={
              <Space>
                <BarChartOutlined style={{ color: '#ffb800' }} />
                <span>类别存在性评分</span>
              </Space>
            }
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {Object.entries(result.presence_scores)
                .sort(([, a]: [string, any], [, b]: [string, any]) => b - a)
                .map(([name, score]: [string, any], index) => {
                  const percent = (score * 100);
                  const color = percent > 30 ? '#00ff88' : percent > 15 ? '#ffb800' : '#ff4757';
                  
                  return (
                    <motion.div
                      key={name}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.7 + index * 0.03 }}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 20,
                        background: `${color}15`,
                        border: `1px solid ${color}40`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <div style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: color,
                        boxShadow: `0 0 8px ${color}`,
                      }} />
                      <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>{name}</span>
                      <span style={{ 
                        color: color, 
                        fontFamily: 'Orbitron, sans-serif',
                        fontWeight: 600,
                        fontSize: 13,
                      }}>
                        {percent.toFixed(1)}%
                      </span>
                    </motion.div>
                  );
                })}
            </div>
          </Card>
        </motion.div>
      )}

      {/* 灯箱 */}
      <Lightbox
        images={visualizations}
        currentIndex={lightboxIndex}
        visible={lightboxVisible}
        onClose={() => setLightboxVisible(false)}
        onPrev={() => setLightboxIndex(prev => (prev - 1 + visualizations.length) % visualizations.length)}
        onNext={() => setLightboxIndex(prev => (prev + 1) % visualizations.length)}
      />

      <style>{`
        .vis-item:hover .hover-overlay,
        .vis-item:hover .hover-icon,
        .vis-item:hover .hover-glow {
          opacity: 1 !important;
        }
        .vis-item:hover .hover-icon {
          transform: translate(-50%, -50%) scale(1) !important;
        }
        .vis-item:hover img {
          transform: scale(1.1) !important;
        }
        .vis-item {
          position: relative;
        }
        .vis-item::before {
          content: '';
          position: absolute;
          inset: -1px;
          background: linear-gradient(135deg, rgba(0, 240, 255, 0.3), rgba(139, 92, 246, 0.3));
          border-radius: 17px;
          opacity: 0;
          transition: opacity 0.3s ease;
          z-index: -1;
        }
        .vis-item:hover::before {
          opacity: 1;
        }
      `}</style>
    </div>
  );
};

export default ResultsView;
