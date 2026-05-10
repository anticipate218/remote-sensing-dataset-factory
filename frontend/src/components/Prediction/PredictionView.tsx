/**
 * PredictionView - 模型预测视图
 * 预测进度 + 专业级结果对比（滑动/并排/叠加三种模式）
 *
 * 批量模式：当 selectedBatchFileIds.length > 1 时，自动切换到 BatchPredictionView，
 * 对所有勾选图像并行预测，完成后展示批量结果列表，可逐张点「精修」进入 annotate。
 */
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Card, Progress, Button, Row, Col, Space, Tag, message, Slider, Radio, Tooltip, Select } from 'antd';
import axios from 'axios';
import {
  ThunderboltOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  EditOutlined,
  ReloadOutlined,
  EyeOutlined,
  ColumnWidthOutlined,
  BlockOutlined,
  PictureOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ExpandOutlined,
  AppstoreOutlined,
  SyncOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { api, TaskResponse } from '../../services/api';
import { useAppStore } from '../../stores/appStore';
import WidgetPanel from '../MFLayout/WidgetPanel';
import { asyncPool, isAsyncPoolError } from '../../utils/asyncPool';

type CompareMode = 'slider' | 'sideBySide' | 'overlay';

// 滑动对比组件
const ImageCompareSlider: React.FC<{
  leftSrc: string;
  rightSrc: string;
  leftLabel?: string;
  rightLabel?: string;
}> = ({ leftSrc, rightSrc, leftLabel = '原始图像', rightLabel = '预测结果' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const updateSlider = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pos = ((clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(2, Math.min(98, pos)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateSlider(e.clientX);
  }, [updateSlider]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => updateSlider(e.clientX);
    const handleUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, updateSlider]);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      style={{
        position: 'relative', width: '100%', aspectRatio: '1',
        borderRadius: 12, overflow: 'hidden', cursor: 'ew-resize',
        background: '#0d1117', userSelect: 'none',
      }}
    >
      {/* 右侧图（预测结果，完整显示） */}
      <img src={rightSrc} alt={rightLabel} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }} />

      {/* 左侧图（原图，通过 clip 裁剪） */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
        <img src={leftSrc} alt={leftLabel} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>

      {/* 分割线 */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: `${sliderPos}%`, transform: 'translateX(-50%)',
        width: 3, background: '#74f7fd',
        boxShadow: '0 0 12px rgba(116,247,253,0.6)',
        zIndex: 10,
      }} />

      {/* 拖动手柄 */}
      <div style={{
        position: 'absolute', top: '50%', left: `${sliderPos}%`,
        transform: 'translate(-50%, -50%)',
        width: 36, height: 36, borderRadius: '50%',
        background: 'rgba(116,247,253,0.9)',
        border: '3px solid #fff',
        boxShadow: '0 0 20px rgba(116,247,253,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 11, cursor: 'ew-resize',
        fontSize: 14, color: '#0a0a0f', fontWeight: 700,
      }}>
        ⟨⟩
      </div>

      {/* 标签 */}
      <div style={{ position: 'absolute', top: 10, left: 10, padding: '4px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.7)', fontSize: 11, color: '#fff', zIndex: 5 }}>
        {leftLabel}
      </div>
      <div style={{ position: 'absolute', top: 10, right: 10, padding: '4px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.7)', fontSize: 11, color: '#74f7fd', zIndex: 5 }}>
        {rightLabel}
      </div>
    </div>
  );
};

// ============================================================================
// 批量预测视图 — 当 selectedBatchFileIds.length > 1 时启用
// 对所有勾选图像并行调用 api.predictSingle，统一一套类别配置；完成后展示
// 批量结果列表，可逐张「精修」跳转到 annotate 步骤。
// ============================================================================
const BatchPredictionView: React.FC = () => {
  const {
    classes,
    batchFiles, selectedBatchFileIds, batchTasks,
    setBatchTask, setActiveBatchFileId,
    setCurrentTask, setCurrentStep, markStepCompleted, setPredictionMask,
    resetBatchTasks,
  } = useAppStore();

  const targetFiles = useMemo(
    () => batchFiles.filter((f) => selectedBatchFileIds.includes(f.file_id)),
    [batchFiles, selectedBatchFileIds],
  );

  // 根据已有的 batchTasks 推导初始阶段：
  //  - 没有任何任务 → idle（首次进入）
  //  - 全部完成/失败 → review（用户从精修页面返回）
  //  - 否则（有 processing/pending）→ running（用户切走又切回）
  const initialPhase = useMemo<'idle' | 'running' | 'review'>(() => {
    const taskKeys = targetFiles.map((f) => f.file_id).filter((id) => batchTasks[id]);
    if (taskKeys.length === 0) return 'idle';
    const allDone = taskKeys.every((id) =>
      batchTasks[id]?.status === 'completed' || batchTasks[id]?.status === 'failed'
    );
    return allDone ? 'review' : 'running';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [phase, setPhase] = useState<'idle' | 'running' | 'review'>(initialPhase);
  const [concurrency, setConcurrency] = useState(2);
  const [selectedModelId, setSelectedModelId] = useState<string>('default');
  const [availableModels, setAvailableModels] = useState<Array<{ model_id: string; display_name: string }>>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    axios.get('/api/models').then((r) => setAvailableModels(r.data.models || [])).catch(() => {});
    return () => { if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current); };
  }, []);

  /** 对单个文件创建预测任务并轮询到完成 */
  const predictOne = useCallback(async (fileId: string, filename: string): Promise<TaskResponse> => {
    const classConfigs = classes.map((c) => ({ name: c.name, prompt: c.prompt, color: c.color }));
    const created = await api.predictSingle(fileId, classConfigs, selectedModelId);
    setBatchTask(fileId, { ...created, status: 'processing', progress: 0, message: '已创建', current_step: '初始化' } as any);

    while (true) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const status = await api.getTask(created.task_id);
        setBatchTask(fileId, status);
        if (status.status === 'completed') return status;
        if (status.status === 'failed') {
          throw new Error(status.error || status.message || `${filename} 预测失败`);
        }
      } catch (e) {
        // 瞬时网络错误：继续重试
      }
    }
  }, [classes, selectedModelId, setBatchTask]);

  const startBatch = useCallback(async () => {
    if (targetFiles.length === 0) {
      message.warning('没有勾选的文件');
      return;
    }
    if (classes.length === 0) {
      message.error('请先配置至少一个类别');
      return;
    }
    resetBatchTasks();
    setPhase('running');
    const t0 = Date.now();
    setElapsedMs(0);
    elapsedTimerRef.current = window.setInterval(() => setElapsedMs(Date.now() - t0), 250);

    const results = await asyncPool(
      concurrency,
      targetFiles,
      async (file) => predictOne(file.file_id, file.filename),
    );

    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    const ok = results.filter((r) => !isAsyncPoolError(r)).length;
    const failed = results.length - ok;
    const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
    if (failed > 0) {
      message.warning(`批量预测完成: ${ok}/${results.length} · ${failed} 失败 · 用时 ${elapsedSec}s`);
    } else {
      message.success(`批量预测完成: ${ok}/${results.length} · 用时 ${elapsedSec}s`);
    }
    if (ok > 0) markStepCompleted('predict');
    setPhase('review');
  }, [targetFiles, classes, concurrency, predictOne, resetBatchTasks, markStepCompleted]);

  /** 进入单张精修：把该 file 的 task 设为 currentTask，跳到 annotate */
  const handleEditOne = useCallback((fileId: string) => {
    const task = batchTasks[fileId];
    if (!task || task.status !== 'completed') {
      message.warning('该图像尚未完成，无法精修');
      return;
    }
    setActiveBatchFileId(fileId);
    setCurrentTask(task);
    setPredictionMask(api.getPredictionMaskUrl(task.task_id, false));
    setCurrentStep('annotate');
  }, [batchTasks, setActiveBatchFileId, setCurrentTask, setPredictionMask, setCurrentStep]);

  // 总进度统计
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
    return {
      total, completed, failed, processing, pending,
      overall: total > 0 ? Math.round(progressSum / total) : 0,
      allDone: (completed + failed) === total,
    };
  }, [targetFiles, batchTasks]);

  const elapsedSec = (elapsedMs / 1000).toFixed(1);

  return (
    <WidgetPanel title="批量语义分割预测" style={{ height: 'auto' }} bodyStyle={{ overflow: 'auto' }}>
      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '40px 20px' }}>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <AppstoreOutlined style={{ fontSize: 40, color: '#74f7fd', marginBottom: 12, filter: 'drop-shadow(0 0 16px rgba(116,247,253,0.5))' }} />
            <h1 style={{ fontSize: 28, fontFamily: 'SarasaMonoSC, Noto Sans SC', fontWeight: 700, marginBottom: 6 }}>
              <span className="gradient-text">批量 AI 推理</span>
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
              对 <Tag color="cyan">{targetFiles.length}</Tag> 张图像并行执行 SAM3/PRISM 分割，全部完成后逐张精修
            </p>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {phase === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <Card className="glass-card" style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ width: 72, height: 72, margin: '0 auto 20px', borderRadius: 18, background: 'linear-gradient(135deg, rgba(116,247,253,0.1), rgba(82,196,26,0.1))', border: '1px solid rgba(116,247,253,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ThunderboltOutlined style={{ fontSize: 32, color: '#74f7fd' }} />
                </div>
                <h3 style={{ fontSize: 18, marginBottom: 8 }}>准备开始批量预测</h3>
                <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
                  已配置 <Tag color="cyan">{classes.length}</Tag> 个类别，将对
                  <Tag color="purple" style={{ marginInline: 4 }}>{targetFiles.length}</Tag> 张图像统一执行
                </p>
                {availableModels.length > 1 && (
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginRight: 8 }}>模型:</span>
                    <Select value={selectedModelId} onChange={setSelectedModelId}
                      style={{ width: 220 }}
                      options={availableModels.map((m) => ({ value: m.model_id, label: m.display_name }))} />
                  </div>
                )}
                {/* 并发选择 */}
                <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'JetBrains Mono, monospace' }}>并发:</span>
                  {[1, 2, 4].map((n) => (
                    <Button key={n} size="middle" onClick={() => setConcurrency(n)}
                      style={{
                        background: concurrency === n ? 'linear-gradient(135deg,#74f7fd,#52c41a)' : 'transparent',
                        border: concurrency === n ? 'none' : '1px solid rgba(255,255,255,0.18)',
                        color: concurrency === n ? '#0a1c2c' : 'rgba(255,255,255,0.7)',
                        fontWeight: 700, minWidth: 70,
                      }}
                    >{n === 1 ? '顺序' : `×${n}`}</Button>
                  ))}
                  <Tooltip title="GPU 显存有限，建议从 ×2 开始；超大图请用顺序">
                    <Tag color="default" style={{ marginLeft: 4 }}>?</Tag>
                  </Tooltip>
                </div>
                <Button type="primary" size="large" icon={<ThunderboltOutlined />} onClick={startBatch}
                  style={{ height: 46, paddingInline: 36, background: 'linear-gradient(135deg, #52c41a, #74f7fd)', border: 'none', boxShadow: '0 0 24px rgba(116,247,253,0.3)', fontWeight: 600 }}>
                  开始批量预测（{targetFiles.length} 张）
                </Button>
              </Card>
            </motion.div>
          )}

          {(phase === 'running' || phase === 'review') && (
            <motion.div key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* 总进度 */}
              <div style={{
                padding: 16, marginBottom: 18,
                background: stats.allDone
                  ? 'linear-gradient(135deg, rgba(82,196,26,0.08), rgba(116,247,253,0.04))'
                  : 'linear-gradient(135deg, rgba(116,247,253,0.08), rgba(91,199,250,0.04))',
                border: `1px solid ${stats.allDone ? 'rgba(82,196,26,0.35)' : 'rgba(116,247,253,0.3)'}`,
                borderRadius: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <ThunderboltOutlined style={{ color: stats.allDone ? '#52c41a' : '#74f7fd', fontSize: 18 }} />
                  <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>
                    {stats.allDone ? '✓ 批量预测完成 — 点击下方任意一张进入精修' : `批量预测中… 并发 ×${concurrency}`}
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                    {stats.completed > 0 && <Tag color="green" icon={<CheckCircleOutlined />}>{stats.completed}</Tag>}
                    {stats.failed > 0 && <Tag color="red" icon={<CloseCircleOutlined />}>{stats.failed}</Tag>}
                    {stats.processing > 0 && <Tag color="cyan" icon={<SyncOutlined spin />}>{stats.processing}</Tag>}
                    <Tag icon={<ClockCircleOutlined />} color="default">{elapsedSec}s</Tag>
                  </span>
                </div>
                <Progress
                  percent={stats.overall}
                  status={stats.failed > 0 ? 'exception' : (stats.allDone ? 'success' : 'active')}
                  strokeColor={{ '0%': '#74f7fd', '100%': '#52c41a' }}
                  format={(p) => `${stats.completed + stats.failed}/${stats.total} (${p}%)`}
                />
              </div>

              {/* 文件级网格：每张缩略图 + 进度 + 状态 + 精修按钮 */}
              <Row gutter={[12, 12]}>
                {targetFiles.map((f) => {
                  const t = batchTasks[f.file_id];
                  const status = t?.status || 'pending';
                  const taskProg = t?.progress || 0;
                  const isCompleted = status === 'completed';
                  const isFailed = status === 'failed';
                  const cardBorder = isCompleted ? 'rgba(82,196,26,0.5)'
                    : isFailed ? 'rgba(255,77,79,0.5)'
                    : status === 'processing' ? 'rgba(0,240,255,0.45)'
                    : 'rgba(255,255,255,0.1)';
                  const maskUrl = isCompleted && t ? api.getPredictionMaskUrl(t.task_id, true) : null;
                  const previewUrl = maskUrl || f.preview_url;
                  return (
                    <Col span={6} key={f.file_id}>
                      <div style={{
                        padding: 10,
                        borderRadius: 10,
                        border: `1px solid ${cardBorder}`,
                        background: 'rgba(0,0,0,0.25)',
                        height: '100%',
                      }}>
                        {/* 缩略图（完成后显示分割结果） */}
                        <div
                          style={{
                            position: 'relative', height: 130, borderRadius: 6, overflow: 'hidden',
                            background: '#0d1117', marginBottom: 8,
                            cursor: isCompleted ? 'pointer' : 'default',
                          }}
                          onClick={() => isCompleted && handleEditOne(f.file_id)}
                        >
                          {previewUrl ? (
                            <img src={previewUrl} alt={f.filename}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => { (e.target as HTMLImageElement).src = f.preview_url || ''; }}
                            />
                          ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)' }}>
                              {status === 'processing' ? <LoadingOutlined spin style={{ fontSize: 24, color: '#74f7fd' }} /> : <PictureOutlined style={{ fontSize: 24 }} />}
                            </div>
                          )}
                          {/* 状态徽标 */}
                          <div style={{
                            position: 'absolute', top: 6, left: 6,
                            background: 'rgba(0,0,0,0.7)', borderRadius: 6,
                            padding: '2px 6px', fontSize: 10, color: '#fff',
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                            {isCompleted ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                              : isFailed ? <CloseCircleOutlined style={{ color: '#ff4757' }} />
                              : <SyncOutlined spin style={{ color: '#74f7fd' }} />}
                            {status}
                          </div>
                        </div>
                        {/* 文件名 */}
                        <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 600, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.filename}
                        </div>
                        {/* 进度条（处理中显示） */}
                        {!isCompleted && !isFailed && (
                          <Progress percent={taskProg} size="small" showInfo={false} strokeColor="#74f7fd" />
                        )}
                        {/* 完成后显示精修按钮 */}
                        {isCompleted && (
                          <Button
                            size="small" type="primary" icon={<EditOutlined />} block
                            onClick={() => handleEditOne(f.file_id)}
                            style={{ background: 'linear-gradient(135deg,#74f7fd,#5bc7fa)', border: 'none', fontWeight: 600 }}
                          >
                            精修这张
                          </Button>
                        )}
                        {isFailed && (
                          <div style={{ fontSize: 10, color: '#ff4757', textAlign: 'center', padding: 4 }}>
                            {t?.error || t?.message || '失败'}
                          </div>
                        )}
                      </div>
                    </Col>
                  );
                })}
              </Row>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </WidgetPanel>
  );
};

const PredictionView: React.FC = () => {
  const selectedBatchFileIds = useAppStore((s) => s.selectedBatchFileIds);
  // 批量模式：勾选 > 1 时走批量并行预测视图
  if (selectedBatchFileIds.length > 1) {
    return <BatchPredictionView />;
  }
  return <SinglePredictionView />;
};

const SinglePredictionView: React.FC = () => {
  const {
    uploadedFile, classes, currentTask, setCurrentTask,
    setCurrentStep, markStepCompleted, setPredictionMask,
  } = useAppStore();

  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('准备开始预测...');
  const [compareMode, setCompareMode] = useState<CompareMode>('slider');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  const [selectedModelId, setSelectedModelId] = useState<string>('default');
  const [availableModels, setAvailableModels] = useState<Array<{ model_id: string; display_name: string }>>([]);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    axios.get('/api/models').then(r => {
      setAvailableModels(r.data.models || []);
    }).catch(() => {});
  }, []);

  const startPrediction = async () => {
    if (!uploadedFile) { message.error('未找到上传的图像'); return; }
    if (classes.length === 0) { message.error('请先配置至少一个类别'); return; }
    setStatus('running');
    setProgress(0);
    setStatusMessage('正在创建预测任务...');
    try {
      const classConfigs = classes.map(c => ({ name: c.name, prompt: c.prompt, color: c.color }));
      const result = await api.predictSingle(uploadedFile.task_id, classConfigs, selectedModelId);
      pollTaskStatus(result.task_id);
    } catch (error) {
      setStatus('failed');
      setStatusMessage(`预测失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const pollTaskStatus = (taskId: string) => {
    const poll = async () => {
      try {
        const task = await api.getTask(taskId);
        setCurrentTask(task);
        setProgress(task.progress);
        setStatusMessage(task.message);
        if (task.status === 'completed') {
          setStatus('completed');
          markStepCompleted('predict');
          setPredictionMask(api.getPredictionMaskUrl(taskId, false));
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        } else if (task.status === 'failed') {
          setStatus('failed');
          setStatusMessage(task.error || '预测失败');
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      } catch (error) {
        console.error('轮询失败:', error);
      }
    };
    poll();
    pollRef.current = setInterval(poll, 1000);
    setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current); pollRef.current = null;
        setStatus('failed');
        setStatusMessage('预测超时（超过5分钟），请检查后端状态');
      }
    }, 5 * 60 * 1000);
  };

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const taskId = currentTask?.task_id;

  const renderCompare = () => {
    if (!taskId) return null;
    const originalUrl = api.getPredictionOriginalUrl(taskId);
    const maskUrl = api.getPredictionMaskUrl(taskId, true);

    if (compareMode === 'slider') {
      return <ImageCompareSlider leftSrc={originalUrl} rightSrc={maskUrl} />;
    }

    if (compareMode === 'sideBySide') {
      return (
        <Row gutter={12}>
          <Col span={12}>
            <div style={{ background: '#0d1117', borderRadius: 10, overflow: 'hidden', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={originalUrl} alt="Original" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform: `scale(${zoom})`, transition: 'transform 0.2s' }} />
            </div>
            <div style={{ textAlign: 'center', marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>原始图像</div>
          </Col>
          <Col span={12}>
            <div style={{ background: '#0d1117', borderRadius: 10, overflow: 'hidden', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={maskUrl} alt="Prediction" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform: `scale(${zoom})`, transition: 'transform 0.2s' }} />
            </div>
            <div style={{ textAlign: 'center', marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>预测结果</div>
          </Col>
        </Row>
      );
    }

    // overlay
    return (
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#0d1117', aspectRatio: '1' }}>
        <img src={originalUrl} alt="Original" style={{ width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${zoom})`, transition: 'transform 0.2s' }} />
        <img src={maskUrl} alt="Mask" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: overlayOpacity, mixBlendMode: 'normal', transform: `scale(${zoom})`, transition: 'transform 0.2s' }} />
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'rgba(0,0,0,0.75)', borderRadius: 20, backdropFilter: 'blur(10px)' }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>透明度</span>
          <Slider min={0} max={1} step={0.05} value={overlayOpacity} onChange={setOverlayOpacity} style={{ width: 120 }} />
          <span style={{ fontSize: 11, color: '#74f7fd', fontFamily: 'JetBrains Mono', width: 32 }}>{Math.round(overlayOpacity * 100)}%</span>
        </div>
      </div>
    );
  };

  return (
    <WidgetPanel title="语义分割预测" style={{ height: 'auto' }} bodyStyle={{ overflow: 'auto' }}>
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px' }}>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <ThunderboltOutlined style={{ fontSize: 40, color: '#74f7fd', marginBottom: 12, filter: 'drop-shadow(0 0 16px rgba(116,247,253,0.5))' }} />
          <h1 style={{ fontSize: 28, fontFamily: 'SarasaMonoSC, Noto Sans SC', fontWeight: 700, marginBottom: 6 }}>
            <span className="gradient-text">AI 智能推理</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>使用语义分割模型进行像素级地物分类</p>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {status === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
            <Card className="glass-card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ width: 72, height: 72, margin: '0 auto 20px', borderRadius: 18, background: 'linear-gradient(135deg, rgba(116,247,253,0.1), rgba(91,199,250,0.1))', border: '1px solid rgba(116,247,253,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ThunderboltOutlined style={{ fontSize: 32, color: '#74f7fd' }} />
              </div>
              <h3 style={{ fontSize: 18, marginBottom: 8 }}>准备开始预测</h3>
              <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
                已配置 <Tag color="cyan">{classes.length}</Tag> 个类别，图像 <Tag color="purple">{uploadedFile?.width}×{uploadedFile?.height}</Tag>
              </p>
              {availableModels.length > 1 && (
                <div style={{ marginBottom: 20 }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginRight: 8 }}>选择模型:</span>
                  <Select
                    value={selectedModelId}
                    onChange={setSelectedModelId}
                    style={{ width: 200 }}
                    options={availableModels.map(m => ({ value: m.model_id, label: m.display_name }))}
                  />
                </div>
              )}
              <Button type="primary" size="large" icon={<ThunderboltOutlined />} onClick={startPrediction}
                style={{ height: 46, paddingInline: 36, background: 'linear-gradient(135deg, #74f7fd, #5bc7fa)', border: 'none', boxShadow: '0 0 24px rgba(116,247,253,0.3)' }}>
                开始预测
              </Button>
            </Card>
          </motion.div>
        )}

        {status === 'running' && (
          <motion.div key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="glass-card" style={{ textAlign: 'center', padding: 40 }}>
              <Progress type="circle" percent={progress} size={140} strokeColor={{ '0%': '#74f7fd', '100%': '#5bc7fa' }} trailColor="rgba(255,255,255,0.08)"
                format={(p) => <div style={{ fontSize: 22, fontFamily: 'DouyuFont, sans-serif' }}>{p}%</div>} />
              <h3 style={{ fontSize: 16, marginTop: 20, marginBottom: 6 }}><LoadingOutlined spin style={{ marginRight: 6 }} />正在处理...</h3>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{statusMessage}</p>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 20, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                <span style={{ color: progress >= 10 ? '#74f7fd' : undefined }}>加载图像</span>
                <span>→</span>
                <span style={{ color: progress >= 30 ? '#74f7fd' : undefined }}>模型推理</span>
                <span>→</span>
                <span style={{ color: progress >= 80 ? '#74f7fd' : undefined }}>生成结果</span>
              </div>
            </Card>
          </motion.div>
        )}

        {status === 'completed' && (
          <motion.div key="completed" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {/* 操作栏 */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 16, padding: '10px 16px',
              background: 'rgba(116,250,189,0.05)', border: '1px solid rgba(116,250,189,0.2)', borderRadius: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircleOutlined style={{ fontSize: 20, color: '#74fabd' }} />
                <span style={{ fontWeight: 600 }}>预测完成</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* 模式切换 */}
                <Radio.Group value={compareMode} onChange={(e) => setCompareMode(e.target.value)} size="small" buttonStyle="solid">
                  <Tooltip title="滑动对比"><Radio.Button value="slider"><ColumnWidthOutlined /></Radio.Button></Tooltip>
                  <Tooltip title="并排对比"><Radio.Button value="sideBySide"><BlockOutlined /></Radio.Button></Tooltip>
                  <Tooltip title="叠加对比"><Radio.Button value="overlay"><PictureOutlined /></Radio.Button></Tooltip>
                </Radio.Group>

                {/* 缩放 */}
                {compareMode !== 'slider' && (
                  <Space size={4}>
                    <Button size="small" icon={<ZoomOutOutlined />} onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} />
                    <span style={{ fontSize: 11, color: '#74f7fd', fontFamily: 'JetBrains Mono', width: 36, textAlign: 'center', display: 'inline-block' }}>{Math.round(zoom * 100)}%</span>
                    <Button size="small" icon={<ZoomInOutlined />} onClick={() => setZoom(z => Math.min(3, z + 0.25))} />
                    <Button size="small" icon={<ExpandOutlined />} onClick={() => setZoom(1)} />
                  </Space>
                )}

                <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

                <Button type="primary" icon={<EditOutlined />} onClick={() => setCurrentStep('annotate')}
                  style={{ background: 'linear-gradient(135deg, #74f7fd, #5bc7fa)', border: 'none' }}>
                  进入编辑
                </Button>
              </div>
            </div>

            {/* 对比区 */}
            <Card className="glass-card" bodyStyle={{ padding: 12 }}>
              {renderCompare()}
            </Card>

            {/* 类别图例 */}
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {classes.map((cls) => (
                <div key={cls.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: `rgb(${cls.color[0]},${cls.color[1]},${cls.color[2]})` }} />
                  <span style={{ fontSize: 12 }}>{cls.name}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {status === 'failed' && (
          <motion.div key="failed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="glass-card" style={{ textAlign: 'center', padding: 40, background: 'linear-gradient(135deg, rgba(255,71,87,0.06), rgba(255,107,53,0.06))', border: '1px solid rgba(255,71,87,0.2)' }}>
              <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: 14, background: 'rgba(255,71,87,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>✕</div>
              <h3 style={{ fontSize: 18, marginBottom: 6 }}>预测失败</h3>
              <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 20, fontSize: 13 }}>{statusMessage}</p>
              <Space>
                <Button icon={<ReloadOutlined />} onClick={() => { setStatus('idle'); setProgress(0); }}>重试</Button>
                <Button onClick={() => setCurrentStep('configure')}>返回配置</Button>
              </Space>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </WidgetPanel>
  );
};

export default PredictionView;
