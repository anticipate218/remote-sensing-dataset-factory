/**
 * RS Dataset Factory - 处理进度视图
 * 科技感UI设计 - 简体中文版
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { 
  Card, Typography, Row, Col, Button, Progress, Tag, Tooltip, message
} from 'antd';
import { 
  ThunderboltOutlined, LoadingOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ClockCircleOutlined, SyncOutlined,
  PlayCircleOutlined, RocketOutlined, AppstoreOutlined,
  PauseCircleOutlined,
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { api, createWebSocket, DatasetConfig, TaskStatus, TaskResult, TaskResponse } from '../../services/api';
import { useAppStore } from '../../stores/appStore';
import ParamPanel from '../ParamPanel/ParamPanel';
import { asyncPool, isAsyncPoolError } from '../../utils/asyncPool';

const { Title, Text } = Typography;

// 处理阶段配置
const STAGES = [
  { key: 'queued', label: '排队中', icon: '⏳', color: '#faad14' },
  { key: 'loading', label: '加载图像', icon: '📷', color: '#1890ff' },
  { key: 'predicting', label: '模型推理', icon: '🧠', color: '#722ed1' },
  { key: 'splitting', label: '数据集切分', icon: '✂️', color: '#13c2c2' },
  { key: 'info', label: '生成信息', icon: '📊', color: '#52c41a' },
  { key: 'visualizing', label: '生成可视化', icon: '🎨', color: '#eb2f96' },
  { key: 'packaging', label: '打包下载', icon: '📦', color: '#fa8c16' },
  { key: 'completed', label: '已完成', icon: '✅', color: '#52c41a' },
];

// 圆形进度组件
const CircularProgress: React.FC<{ percent: number; size?: number }> = ({ 
  percent, 
  size = 200 
}) => {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {/* 背景圆 */}
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(102, 126, 234, 0.15)"
          strokeWidth={strokeWidth}
        />
        {/* 进度圆 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#ff00aa" />
          </linearGradient>
        </defs>
      </svg>
      
      {/* 扫描线动画 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '100%',
            height: '2px',
            background: 'linear-gradient(90deg, transparent, #00f0ff, transparent)',
            transformOrigin: 'left center',
            animation: 'radar-scan 2s linear infinite',
          }}
        />
      </div>

      {/* 中心内容 */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 42,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #00f0ff 0%, #8b5cf6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            lineHeight: 1,
          }}
        >
          {percent.toFixed(1)}%
        </div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>
          处理进度
        </div>
      </div>

      {/* 外圈脉冲效果 */}
      <div
        style={{
          position: 'absolute',
          top: -10,
          left: -10,
          right: -10,
          bottom: -10,
          borderRadius: '50%',
          border: '1px solid rgba(0, 240, 255, 0.2)',
          animation: 'pulse-ring 2s ease-out infinite',
        }}
      />

      <style>{`
        @keyframes radar-scan {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.1); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

// 时间线组件
const ProcessTimeline: React.FC<{ currentStep: string; progress: number }> = ({ 
  currentStep, 
  progress 
}) => {
  const currentIndex = STAGES.findIndex(s => s.key === currentStep);

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        position: 'relative',
        padding: '0 20px',
      }}>
        {/* 背景连接线 */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 40,
          right: 40,
          height: 2,
          background: 'rgba(102, 126, 234, 0.2)',
          transform: 'translateY(-50%)',
          zIndex: 0,
        }} />
        
        {/* 进度连接线 */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 40,
          height: 2,
          background: 'linear-gradient(90deg, #00f0ff, #8b5cf6)',
          transform: 'translateY(-50%)',
          width: `calc(${Math.max(0, currentIndex) / (STAGES.length - 1) * 100}% - 40px)`,
          transition: 'width 0.5s ease',
          zIndex: 1,
          boxShadow: '0 0 10px rgba(0, 240, 255, 0.5)',
        }} />

        {STAGES.map((stage, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isPending = index > currentIndex;

          return (
            <motion.div
              key={stage.key}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
                zIndex: 2,
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              {/* 节点 */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  background: isCompleted 
                    ? 'linear-gradient(135deg, #00ff88, #00f0ff)' 
                    : isCurrent 
                      ? 'linear-gradient(135deg, #00f0ff, #8b5cf6)'
                      : 'rgba(26, 31, 46, 0.9)',
                  border: `2px solid ${isCompleted ? '#00ff88' : isCurrent ? '#00f0ff' : 'rgba(102, 126, 234, 0.3)'}`,
                  boxShadow: isCurrent 
                    ? '0 0 20px rgba(0, 240, 255, 0.6), 0 0 40px rgba(0, 240, 255, 0.3)' 
                    : isCompleted 
                      ? '0 0 15px rgba(0, 255, 136, 0.4)'
                      : 'none',
                  transition: 'all 0.3s ease',
                }}
              >
                {isCompleted ? (
                  <CheckCircleOutlined style={{ color: '#0a0a0f', fontSize: 18 }} />
                ) : isCurrent ? (
                  <SyncOutlined spin style={{ color: '#0a0a0f', fontSize: 16 }} />
                ) : (
                  <span style={{ opacity: 0.5 }}>{stage.icon}</span>
                )}
              </div>

              {/* 标签 */}
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  fontWeight: isCurrent ? 600 : 400,
                  color: isCurrent ? '#00f0ff' : isCompleted ? '#00ff88' : 'rgba(255,255,255,0.4)',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.3s ease',
                }}
              >
                {stage.label}
              </div>

              {/* 当前阶段指示器 */}
              {isCurrent && (
                <motion.div
                  style={{
                    position: 'absolute',
                    top: -8,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#00f0ff',
                  }}
                  animate={{ 
                    scale: [1, 1.5, 1],
                    opacity: [1, 0.5, 1],
                  }}
                  transition={{ 
                    duration: 1.5, 
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

// 终端日志组件
const TerminalLog: React.FC<{ logs: string[] }> = ({ logs }) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLogStyle = (log: string) => {
    if (log.includes('[ERROR]')) return { color: '#ff4757', prefix: '✗' };
    if (log.includes('[SUCCESS]')) return { color: '#00ff88', prefix: '✓' };
    if (log.includes('[WARN]')) return { color: '#ffb800', prefix: '⚠' };
    if (log.includes('[INFO]')) return { color: '#00f0ff', prefix: '›' };
    return { color: 'rgba(255,255,255,0.7)', prefix: '›' };
  };

  const highlightSyntax = (text: string) => {
    return text
      .replace(/\[(ERROR|SUCCESS|WARN|INFO|PROCESSING)\]/g, '<span class="log-tag">[$1]</span>')
      .replace(/(\d+\.?\d*%)/g, '<span class="log-number">$1</span>')
      .replace(/(task_id|任务|完成|失败|开始|加载)/g, '<span class="log-keyword">$1</span>');
  };

  return (
    <div className="terminal-container">
      {/* 终端头部 */}
      <div className="terminal-header">
        <div className="terminal-dots">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
        </div>
        <div className="terminal-title">处理日志 - Terminal</div>
      </div>

      {/* 终端内容 */}
      <div className="terminal-body">
        {logs.length === 0 ? (
          <div className="terminal-empty">
            <span className="cursor-blink">_</span> 等待处理开始...
          </div>
        ) : (
          <AnimatePresence>
            {logs.map((log, index) => {
              const style = getLogStyle(log);
              const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
              
              return (
                <motion.div
                  key={index}
                  className="log-entry"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <span className="log-time">{time}</span>
                  <span className="log-prefix" style={{ color: style.color }}>{style.prefix}</span>
                  <span 
                    className="log-content"
                    dangerouslySetInnerHTML={{ __html: highlightSyntax(log) }}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={logEndRef} />
      </div>

      <style>{`
        .terminal-container {
          background: linear-gradient(180deg, #0d1117 0%, #0a0a0f 100%);
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid rgba(0, 240, 255, 0.1);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.03);
        }
        .terminal-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: rgba(0, 0, 0, 0.3);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .terminal-dots {
          display: flex;
          gap: 6px;
        }
        .dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }
        .dot.red { background: #ff5f56; }
        .dot.yellow { background: #ffbd2e; }
        .dot.green { background: #27ca40; }
        .terminal-title {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          color: rgba(255,255,255,0.5);
        }
        .terminal-body {
          padding: 16px;
          max-height: 320px;
          overflow-y: auto;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          line-height: 1.8;
        }
        .terminal-empty {
          color: rgba(255,255,255,0.3);
          text-align: center;
          padding: 40px;
        }
        .cursor-blink {
          animation: blink 1s step-end infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .log-entry {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 4px 0;
        }
        .log-time {
          color: rgba(0, 255, 136, 0.6);
          font-size: 11px;
          min-width: 70px;
        }
        .log-prefix {
          font-weight: 600;
          min-width: 12px;
        }
        .log-content {
          flex: 1;
          color: rgba(255,255,255,0.85);
          word-break: break-all;
        }
        .log-tag {
          color: #8b5cf6;
          font-weight: 600;
        }
        .log-number {
          color: #00f0ff;
        }
        .log-keyword {
          color: #ff00aa;
        }
      `}</style>
    </div>
  );
};

// ========================================================================
// 批量并行处理视图 — 当 selectedBatchFileIds.length > 1 时启用
// ========================================================================
const BatchProcessingView: React.FC = () => {
  const {
    batchFiles, selectedBatchFileIds, batchTasks,
    setBatchTask, setCurrentStep, datasetName, classes, params,
    setActiveBatchFileId, addLog, clearLogs, markStepCompleted,
  } = useAppStore();

  const [isStarted, setIsStarted] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [concurrency, setConcurrency] = useState(2);
  const elapsedTimerRef = useRef<number | null>(null);
  const pollingIdsRef = useRef<Set<string>>(new Set());

  // 待处理的文件
  const targetFiles = useMemo(
    () => batchFiles.filter((f) => selectedBatchFileIds.includes(f.file_id)),
    [batchFiles, selectedBatchFileIds],
  );

  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  /** 对单个文件创建 task 并轮询到完成 */
  const processOne = useCallback(async (fileId: string, filename: string): Promise<TaskResponse> => {
    const config: DatasetConfig = {
      name: `${datasetName}_${filename.replace(/\.[^.]+$/, '')}`,
      classes: classes.map((c) => ({ name: c.name, prompt: c.prompt, color: c.color })),
      params,
    };
    addLog(`[INFO] [${filename}] 创建任务...`);
    const task = await api.createTask(fileId, config);
    setBatchTask(fileId, task);
    pollingIdsRef.current.add(task.task_id);

    while (true) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const status = await api.getTask(task.task_id);
        setBatchTask(fileId, status);
        if (status.status === 'completed') {
          addLog(`[OK] [${filename}] 完成`);
          pollingIdsRef.current.delete(task.task_id);
          return status;
        }
        if (status.status === 'failed') {
          addLog(`[ERR] [${filename}] 失败: ${status.error || status.message || ''}`);
          pollingIdsRef.current.delete(task.task_id);
          throw new Error(status.error || status.message || 'failed');
        }
      } catch (e) {
        // 单次轮询失败可能是网络抖动，继续重试，但累计太多次就放弃
      }
    }
  }, [datasetName, classes, params, setBatchTask, addLog]);

  const startBatch = useCallback(async () => {
    if (targetFiles.length === 0) {
      message.warning('没有勾选的文件');
      return;
    }
    clearLogs();
    setIsStarted(true);
    const t0 = Date.now();
    setStartedAt(t0);
    setElapsedMs(0);
    elapsedTimerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - t0);
    }, 250);

    addLog(`[INFO] 启动批量处理: ${targetFiles.length} 张图，并发 ${concurrency}`);

    const results = await asyncPool(
      concurrency,
      targetFiles,
      async (file) => processOne(file.file_id, file.filename),
    );

    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
    const ok = results.filter((r) => !isAsyncPoolError(r)).length;
    const failed = results.length - ok;
    if (failed > 0) {
      message.warning(`批量完成: ${ok}/${results.length} 成功，${failed} 失败 · 用时 ${elapsedSec}s`);
    } else {
      message.success(`批量完成: ${ok}/${results.length} · 用时 ${elapsedSec}s`);
    }
    markStepCompleted('processing' as any);
    setActiveBatchFileId(null);
    setCurrentStep('results' as any);
  }, [targetFiles, concurrency, processOne, addLog, clearLogs, setCurrentStep, setActiveBatchFileId, markStepCompleted]);

  // 进度统计
  const stats = useMemo(() => {
    let completed = 0, failed = 0, processing = 0, pending = 0;
    let progressSum = 0;
    targetFiles.forEach((f) => {
      const t = batchTasks[f.file_id];
      if (!t) { pending += 1; return; }
      if (t.status === 'completed') { completed += 1; progressSum += 100; }
      else if (t.status === 'failed') { failed += 1; }
      else if (t.status === 'processing') { processing += 1; progressSum += t.progress || 0; }
      else { pending += 1; }
    });
    const total = targetFiles.length;
    const overall = total > 0 ? Math.round(progressSum / total) : 0;
    return { total, completed, failed, processing, pending, overall, allDone: (completed + failed) === total };
  }, [targetFiles, batchTasks]);

  const elapsedSec = (elapsedMs / 1000).toFixed(1);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 20px' }}>
      <Row gutter={24}>
        <Col span={16}>
          <Card className="glass-card scanline" style={{ marginBottom: 24, overflow: 'hidden' }}>
            {/* 标题 */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.2) 0%, rgba(82, 196, 26, 0.2) 100%)',
                border: '1px solid rgba(0, 240, 255, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 20,
              }}>
                <AppstoreOutlined style={{ fontSize: 28, color: '#00f0ff' }} />
              </div>
              <div style={{ flex: 1 }}>
                <Title level={3} style={{ margin: 0 }}>
                  <span className="gradient-text">批量数据集处理</span>
                  <Tag color="cyan" style={{ marginLeft: 12, verticalAlign: 'middle' }}>
                    {targetFiles.length} 张 · 并发 {concurrency}
                  </Tag>
                </Title>
                <Text style={{ color: 'rgba(255,255,255,0.5)' }}>
                  对所有勾选图像统一应用同一套类别配置，并行执行 SAM3/PRISM 分割
                </Text>
              </div>
            </div>

            {!isStarted ? (
              /* 准备就绪：让用户调并发数 + 启动 */
              <motion.div
                style={{ textAlign: 'center', padding: '40px 0 50px' }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'JetBrains Mono, monospace' }}>
                    并发路数:
                  </Text>
                  {[1, 2, 4].map((n) => (
                    <Button
                      key={n}
                      size="middle"
                      onClick={() => setConcurrency(n)}
                      style={{
                        background: concurrency === n ? 'linear-gradient(135deg,#00f0ff,#52c41a)' : 'transparent',
                        border: concurrency === n ? 'none' : '1px solid rgba(255,255,255,0.18)',
                        color: concurrency === n ? '#0a1c2c' : 'rgba(255,255,255,0.7)',
                        fontWeight: 700,
                        minWidth: 70,
                      }}
                    >
                      {n === 1 ? '顺序' : `×${n}`}
                    </Button>
                  ))}
                  <Tooltip title="GPU 显存有限，建议从 ×2 开始；超大图请用顺序">
                    <Tag color="default" style={{ marginLeft: 4 }}>?</Tag>
                  </Tooltip>
                </div>
                <Button
                  type="primary"
                  size="large"
                  icon={<ThunderboltOutlined />}
                  onClick={startBatch}
                  style={{
                    height: 52, paddingLeft: 40, paddingRight: 40,
                    fontSize: 16, fontWeight: 600,
                    background: 'linear-gradient(135deg, #52c41a 0%, #00f0ff 100%)',
                    border: 'none',
                  }}
                >
                  启动批量处理（{targetFiles.length} 张）
                </Button>
              </motion.div>
            ) : (
              /* 处理中：总进度 + 文件级网格 */
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                {/* 总进度 */}
                <div style={{
                  padding: 16, marginBottom: 18,
                  background: 'linear-gradient(135deg, rgba(0,240,255,0.06), rgba(82,196,26,0.04))',
                  border: '1px solid rgba(0,240,255,0.25)',
                  borderRadius: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                    <ThunderboltOutlined style={{ color: '#00f0ff', fontSize: 18 }} />
                    <Text strong style={{ color: '#fff', fontSize: 15 }}>
                      {stats.allDone ? '✓ 批量处理完成' : '批量处理进行中…'}
                    </Text>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                      {stats.completed > 0 && <Tag color="green" icon={<CheckCircleOutlined />}>{stats.completed}</Tag>}
                      {stats.failed > 0 && <Tag color="red" icon={<CloseCircleOutlined />}>{stats.failed}</Tag>}
                      {stats.processing > 0 && <Tag color="cyan" icon={<SyncOutlined spin />}>{stats.processing}</Tag>}
                      {stats.pending > 0 && <Tag color="default" icon={<PauseCircleOutlined />}>{stats.pending}</Tag>}
                      <Tag icon={<ClockCircleOutlined />} color="default">{elapsedSec}s</Tag>
                    </span>
                  </div>
                  <Progress
                    percent={stats.overall}
                    status={stats.failed > 0 ? 'exception' : (stats.allDone ? 'success' : 'active')}
                    strokeColor={{ '0%': '#00f0ff', '100%': '#52c41a' }}
                    format={(p) => `${stats.completed + stats.failed}/${stats.total} (${p}%)`}
                  />
                </div>

                {/* 文件级状态网格 */}
                <Row gutter={[12, 12]}>
                  {targetFiles.map((f) => {
                    const t = batchTasks[f.file_id];
                    const status: TaskStatus = (t?.status as TaskStatus) || 'pending';
                    const progress = t?.progress || 0;
                    const cardBorder = status === 'completed' ? 'rgba(82,196,26,0.5)'
                      : status === 'failed' ? 'rgba(255,77,79,0.5)'
                      : status === 'processing' ? 'rgba(0,240,255,0.45)'
                      : 'rgba(255,255,255,0.1)';
                    const statusIcon = status === 'completed' ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                      : status === 'failed' ? <CloseCircleOutlined style={{ color: '#ff4757' }} />
                      : status === 'processing' ? <SyncOutlined spin style={{ color: '#00f0ff' }} />
                      : <ClockCircleOutlined style={{ color: 'rgba(255,255,255,0.4)' }} />;
                    return (
                      <Col span={8} key={f.file_id}>
                        <div style={{
                          padding: 10,
                          borderRadius: 10,
                          border: `1px solid ${cardBorder}`,
                          background: 'rgba(0,0,0,0.25)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            {f.preview_url && (
                              <img src={f.preview_url} alt={f.filename}
                                style={{ width: 38, height: 38, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: '#fff', fontSize: 12, fontWeight: 600, display: 'block' }} ellipsis>
                                {f.filename}
                              </Text>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                                {statusIcon}
                                <span>{status === 'processing' ? (t?.current_step || '处理中') : status}</span>
                              </div>
                            </div>
                          </div>
                          <Progress
                            percent={progress}
                            size="small"
                            showInfo={false}
                            status={status === 'failed' ? 'exception' : (status === 'completed' ? 'success' : 'active')}
                            strokeColor={status === 'completed' ? '#52c41a' : '#00f0ff'}
                          />
                        </div>
                      </Col>
                    );
                  })}
                </Row>
              </motion.div>
            )}
          </Card>
        </Col>

        <Col span={8}>
          <Card className="glass-card" style={{ height: '100%' }}>
            <Title level={5} style={{ marginTop: 0 }}>处理参数</Title>
            <ParamPanel />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

// 主组件
const ProcessingView: React.FC = () => {
  const { selectedBatchFileIds } = useAppStore();
  // 批量模式：勾选 > 1 时走批量流程
  if (selectedBatchFileIds.length > 1) {
    return <BatchProcessingView />;
  }

  return <SingleProcessingView />;
};

const SingleProcessingView: React.FC = () => {
  const {
    uploadedFile, datasetName, classes, params,
    currentTask, setCurrentTask, setCurrentStep,
    logs, addLog, clearLogs
  } = useAppStore();

  const [isStarted, setIsStarted] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);

  // 预估剩余时间（基于进度和已用时间）
  const estimatedRemaining = useMemo(() => {
    if (!currentTask?.progress || currentTask.progress <= 0 || elapsedTime <= 0) {
      return null;
    }
    const totalEstimate = (elapsedTime / currentTask.progress) * 100;
    const remaining = Math.max(0, totalEstimate - elapsedTime);
    return Math.round(remaining);
  }, [currentTask?.progress, elapsedTime]);

  const startProcessing = useCallback(async () => {
    if (!uploadedFile) return;

    clearLogs();
    setIsStarted(true);
    addLog('[INFO] 开始创建处理任务...');

    try {
      const config: DatasetConfig = {
        name: datasetName,
        classes: classes.map(c => ({
          name: c.name,
          prompt: c.prompt,
          color: c.color,
        })),
        params,
      };

      const task = await api.createTask(uploadedFile.task_id, config);
      setCurrentTask(task);
      addLog(`[INFO] 任务已创建: ${task.task_id}`);

      timerRef.current = window.setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);

      try {
        wsRef.current = createWebSocket(task.task_id, (data) => {
          if (data.type === 'progress' || data.type === 'status') {
            const status = data.status as TaskStatus | undefined;
            const progress = data.progress as number | undefined;
            const current_step = data.current_step as string | undefined;
            const msgText = data.message as string | undefined;
            const result = data.result as TaskResult | undefined;
            const error = data.error as string | undefined;

            setCurrentTask({
              ...task,
              status: status ?? task.status,
              progress: progress ?? task.progress,
              current_step: current_step ?? task.current_step,
              message: msgText ?? task.message,
              result: result,
            });

            if (msgText) {
              addLog(`[${status?.toUpperCase() || 'INFO'}] ${msgText}`);
            }

            if (status === 'completed') {
              addLog('[SUCCESS] 数据集生成完成！');
              setCurrentStep('results');
            } else if (status === 'failed') {
              addLog(`[ERROR] 处理失败: ${error || msgText}`);
            }
          }
        });
      } catch {
        addLog('[WARN] WebSocket 连接失败，使用轮询模式');
      }

      pollRef.current = window.setInterval(async () => {
        try {
          const status = await api.getTask(task.task_id);
          setCurrentTask(status);

          if (status.status === 'completed') {
            addLog('[SUCCESS] 数据集生成完成！');
            setCurrentStep('results');
            if (pollRef.current) clearInterval(pollRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
          } else if (status.status === 'failed') {
            addLog(`[ERROR] 处理失败: ${status.error}`);
            if (pollRef.current) clearInterval(pollRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
          }
        } catch (e) {
          console.error('Poll error:', e);
        }
      }, 3000);

    } catch (error: any) {
      addLog(`[ERROR] 创建任务失败: ${error.message}`);
      setIsStarted(false);
    }
  }, [uploadedFile, datasetName, classes, params, setCurrentTask, addLog, clearLogs, setCurrentStep]);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 20px' }}>
      <Row gutter={24}>
        <Col span={16}>
          {/* 主处理卡片 */}
          <Card 
            className="glass-card scanline" 
            style={{ marginBottom: 24, overflow: 'hidden' }}
          >
            {/* 标题区域 */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
                  border: '1px solid rgba(0, 240, 255, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 20,
                }}
              >
                <RocketOutlined style={{ fontSize: 28, color: '#00f0ff' }} />
              </div>
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  <span className="gradient-text">智能数据集处理</span>
                </Title>
                <Text style={{ color: 'rgba(255,255,255,0.5)' }}>
                  基于 SAM3/PRISM 模型的语义分割处理引擎
                </Text>
              </div>
            </div>

            {!isStarted ? (
              /* 准备就绪状态 */
              <motion.div
                style={{ textAlign: 'center', padding: '40px 0 60px' }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                {/* 启动按钮 */}
                <motion.div
                  style={{
                    width: 160,
                    height: 160,
                    margin: '0 auto 32px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
                    border: '2px solid rgba(0, 240, 255, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={startProcessing}
                >
                  {/* 脉冲环 */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: -20,
                      borderRadius: '50%',
                      border: '1px solid rgba(0, 240, 255, 0.2)',
                      animation: 'pulse-ring 2s ease-out infinite',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: -40,
                      borderRadius: '50%',
                      border: '1px solid rgba(0, 240, 255, 0.1)',
                      animation: 'pulse-ring 2s ease-out infinite 0.5s',
                    }}
                  />
                  
                  <PlayCircleOutlined 
                    style={{ 
                      fontSize: 64, 
                      color: '#00f0ff',
                      filter: 'drop-shadow(0 0 20px rgba(0, 240, 255, 0.5))',
                    }} 
                  />
                </motion.div>

                <Title level={4} style={{ marginBottom: 8, color: '#f0f6fc' }}>
                  准备就绪
                </Title>
                <Text style={{ color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 24 }}>
                  已配置 <span style={{ color: '#00f0ff', fontWeight: 600 }}>{classes.length}</span> 个类别，点击上方按钮开始处理
                </Text>

                <Button
                  type="primary"
                  size="large"
                  icon={<ThunderboltOutlined />}
                  onClick={startProcessing}
                  className="btn-primary"
                  style={{
                    height: 52,
                    paddingLeft: 40,
                    paddingRight: 40,
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  开始处理
                </Button>
              </motion.div>
            ) : (
              /* 处理中状态 */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                {/* 圆形进度和统计 */}
                <Row gutter={32} align="middle" style={{ marginBottom: 32 }}>
                  <Col span={10} style={{ textAlign: 'center' }}>
                    <CircularProgress percent={currentTask?.progress || 0} />
                  </Col>
                  <Col span={14}>
                    <Row gutter={[16, 16]}>
                      <Col span={12}>
                        <div className="stat-card">
                          <div className="stat-icon">
                            {currentTask?.status === 'processing' ? (
                              <SyncOutlined spin style={{ color: '#00f0ff' }} />
                            ) : currentTask?.status === 'completed' ? (
                              <CheckCircleOutlined style={{ color: '#00ff88' }} />
                            ) : currentTask?.status === 'failed' ? (
                              <CloseCircleOutlined style={{ color: '#ff4757' }} />
                            ) : (
                              <LoadingOutlined style={{ color: '#faad14' }} />
                            )}
                          </div>
                          <div className="stat-content">
                            <div className="stat-label">当前状态</div>
                            <div className="stat-value" style={{
                              color: currentTask?.status === 'completed' ? '#00ff88' :
                                     currentTask?.status === 'failed' ? '#ff4757' : '#00f0ff'
                            }}>
                              {currentTask?.status === 'processing' ? '处理中' : 
                               currentTask?.status === 'completed' ? '已完成' :
                               currentTask?.status === 'failed' ? '失败' : '等待中'}
                            </div>
                          </div>
                        </div>
                      </Col>
                      <Col span={12}>
                        <div className="stat-card">
                          <div className="stat-icon">
                            <ClockCircleOutlined style={{ color: '#faad14' }} />
                          </div>
                          <div className="stat-content">
                            <div className="stat-label">已用时间</div>
                            <div className="stat-value" style={{ color: '#faad14' }}>
                              {formatTime(elapsedTime)}
                            </div>
                          </div>
                        </div>
                      </Col>
                      <Col span={12}>
                        <div className="stat-card">
                          <div className="stat-icon">
                            <ThunderboltOutlined style={{ color: '#8b5cf6' }} />
                          </div>
                          <div className="stat-content">
                            <div className="stat-label">当前阶段</div>
                            <div className="stat-value" style={{ color: '#8b5cf6' }}>
                              {STAGES.find(s => s.key === currentTask?.current_step)?.label || '准备中'}
                            </div>
                          </div>
                        </div>
                      </Col>
                      <Col span={12}>
                        <div className="stat-card">
                          <div className="stat-icon">
                            <ClockCircleOutlined style={{ color: '#00ff88' }} />
                          </div>
                          <div className="stat-content">
                            <div className="stat-label">预计剩余</div>
                            <div className="stat-value" style={{ color: '#00ff88' }}>
                              {estimatedRemaining !== null ? formatTime(estimatedRemaining) : '--:--'}
                            </div>
                          </div>
                        </div>
                      </Col>
                    </Row>
                  </Col>
                </Row>

                {/* 处理阶段时间线 */}
                <ProcessTimeline 
                  currentStep={currentTask?.current_step || 'queued'} 
                  progress={currentTask?.progress || 0}
                />
              </motion.div>
            )}
          </Card>

          {/* 终端日志 */}
          <Card 
            className="glass-card" 
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#00f0ff' }}>⚡</span>
                <span>实时处理日志</span>
              </div>
            }
            size="small"
          >
            <TerminalLog logs={logs} />
          </Card>
        </Col>

        <Col span={8}>
          <ParamPanel />
        </Col>
      </Row>

      <style>{`
        .stat-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: rgba(17, 24, 39, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
        }
        .stat-icon {
          font-size: 20px;
        }
        .stat-content {
          flex: 1;
        }
        .stat-label {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
          margin-bottom: 2px;
        }
        .stat-value {
          font-family: 'Orbitron', sans-serif;
          font-size: 18px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
};

export default ProcessingView;
