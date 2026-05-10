/**
 * RefineClassModal - 类别精修对话框
 * 选择某个语义类别 + 内置精修器，对该类别进行模型级二次分割
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, message, Progress, Tag } from 'antd';
import {
  ThunderboltOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { ClassItem } from '../../stores/appStore';

interface RefinerMeta {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category?: string;
  tier?: number;
  paper?: string;
  repo?: string;
  architecture?: string;
  inference_method?: string;
  hf_model?: string;
  needs_download?: boolean;
  rich_prompt?: string;
}

interface RefineProgress {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  stats?: {
    refiner_name: string;
    original_pixels: number;
    refined_pixels: number;
    added_pixels: number;
    removed_pixels: number;
    delta_ratio: number;
  };
  error?: string;
}

interface RefineClassModalProps {
  open: boolean;
  taskId: string | null;
  targetClass: ClassItem | null;
  classIndex: number;
  onCancel: () => void;
  onCompleted: () => void;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  building: ['building', 'house', 'roof', '建筑', '房屋', '楼房'],
  road: ['road', 'highway', 'street', '道路', '公路', '街'],
  water: ['water', 'river', 'lake', 'pond', '水', '河', '湖'],
  vegetation: ['forest', 'tree', 'grass', 'shrub', '植被', '森林', '草'],
  farmland: ['farm', 'crop', 'rice', 'paddy', '农田', '耕地', '稻田'],
};

const CATEGORY_LABELS: Record<string, string> = {
  building: '建筑物',
  road: '道路',
  water: '水体',
  vegetation: '植被',
  farmland: '农田',
  multi: '多类别 / 通用地物',
  any: 'AI 视觉边界精修',
};

function detectCategory(cls: ClassItem | null): string | null {
  if (!cls) return null;
  const text = `${cls.name} ${cls.prompt || ''}`.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => text.includes(k.toLowerCase()))) {
      return cat;
    }
  }
  return null;
}

function suggestDefaultRefiner(refiners: RefinerMeta[], cls: ClassItem | null): string | null {
  // 默认选择策略：
  //   1. 该类别的 Tier 1 PRISM-A 精修器（最快、无需下载、最匹配）
  //   2. 若类别匹配但只有 Tier 2 → 选 Tier 2
  //   3. 完全匹配不到 → ai_gpt_boundary
  const cat = detectCategory(cls);
  if (cat) {
    const tier1 = refiners.find((r) => r.category === cat && r.tier === 1);
    if (tier1) return tier1.id;
    const anyTier = refiners.find((r) => r.category === cat);
    if (anyTier) return anyTier.id;
  }
  const ai = refiners.find((r) => r.id === 'ai_gpt_boundary');
  if (ai) return ai.id;
  return refiners[0]?.id || null;
}

const RefineClassModal: React.FC<RefineClassModalProps> = ({
  open,
  taskId,
  targetClass,
  classIndex,
  onCancel,
  onCompleted,
}) => {
  const [refiners, setRefiners] = useState<RefinerMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refineTaskId, setRefineTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState<RefineProgress | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const detectedCategory = useMemo(() => detectCategory(targetClass), [targetClass]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/refiners')
      .then((r) => r.json())
      .then((data) => {
        const list: RefinerMeta[] = data.refiners || [];
        setRefiners(list);
        setSelectedId(suggestDefaultRefiner(list, targetClass));
      })
      .catch(() => message.error('加载精修器列表失败'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      setRefineTaskId(null);
      setProgress(null);
      setSubmitting(false);
    }
  }, [open]);

  // 轮询精修进度
  useEffect(() => {
    if (!refineTaskId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const resp = await fetch(`/api/tasks/${refineTaskId}`);
        if (!resp.ok) throw new Error('查询失败');
        const data = await resp.json();
        if (cancelled) return;
        const next: RefineProgress = {
          status: data.status,
          progress: data.progress ?? 0,
          message: data.message ?? '',
          stats: data.result?.stats,
          error: data.error,
        };
        setProgress(next);
        if (data.status === 'completed') {
          message.success(`${targetClass?.name || '类别'} 精修完成`);
          setSubmitting(false);
          setTimeout(onCompleted, 600);
          return;
        }
        if (data.status === 'failed') {
          message.error(`精修失败: ${data.error || data.message}`);
          setSubmitting(false);
          return;
        }
      } catch (e) {
        // 忽略瞬时错误
      }
      if (!cancelled) setTimeout(tick, 1500);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [refineTaskId, onCompleted, targetClass?.name]);

  const startRefine = async () => {
    if (!taskId || !targetClass || !selectedId) {
      message.warning('请选择一个精修器');
      return;
    }
    setSubmitting(true);
    setProgress({
      status: 'pending',
      progress: 0,
      message: '正在创建精修任务...',
    });
    try {
      const resp = await fetch(`/api/refine-class/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_name: targetClass.name,
          class_index: classIndex,
          refiner_id: selectedId,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `状态码 ${resp.status}`);
      }
      const data = await resp.json();
      setRefineTaskId(data.refine_task_id);
    } catch (e: any) {
      message.error(`启动精修失败: ${e.message || e}`);
      setSubmitting(false);
      setProgress(null);
    }
  };

  const isProcessing =
    progress &&
    (progress.status === 'pending' || progress.status === 'processing');
  const isDone = progress?.status === 'completed';

  return (
    <Modal
      open={open}
      onCancel={() => {
        if (!submitting) onCancel();
      }}
      footer={null}
      width={560}
      destroyOnClose
      closable={!submitting}
      maskClosable={!submitting}
      title={
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#74f7fd' }}
        >
          <ThunderboltOutlined />
          <span style={{ fontFamily: "'DouyuFont', sans-serif", fontSize: 15 }}>
            语义类别精修
          </span>
          {targetClass && (
            <Tag
              color="cyan"
              style={{
                fontSize: 11,
                marginLeft: 8,
                background: `rgba(${targetClass.color.join(',')}, 0.15)`,
                borderColor: `rgba(${targetClass.color.join(',')}, 0.4)`,
                color: `rgb(${targetClass.color.join(',')})`,
              }}
            >
              {targetClass.name}
            </Tag>
          )}
        </div>
      }
    >
      <div style={{ paddingTop: 8 }}>
        {!progress && (
          <>
            <p
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: 12,
                lineHeight: 1.7,
                margin: '0 0 12px',
              }}
            >
              选择一个内置专用模型对当前类别进行二次精细分割。系统会用专用提示词集合驱动 SAM3，并应用形态学清理，
              <span style={{ color: '#74f7fd' }}>
                {' '}
                仅替换当前类别的像素
              </span>
              ，其它类别不受影响。
            </p>

            {detectedCategory && (
              <div
                style={{
                  background: 'rgba(116,247,253,0.06)',
                  border: '1px solid rgba(116,247,253,0.18)',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 11,
                  color: '#b9cfff',
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <CheckCircleOutlined style={{ color: '#74fabd' }} />
                检测到类别归属：
                <span style={{ color: '#74f7fd', fontWeight: 600 }}>
                  {CATEGORY_LABELS[detectedCategory] || detectedCategory}
                </span>
                ；推荐使用同类的 SOTA 模型，或选择
                <span style={{ color: '#f97316', fontWeight: 600 }}>
                  AI 视觉边界精修
                </span>
                获得最佳质量。
              </div>
            )}

            {/* 按类别分组渲染 */}
            <div style={{ marginBottom: 16, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
              {(() => {
                // 1. 优先排序：AI 视觉精修第一，同类排前
                const order: string[] = [];
                const aiId = 'ai_gpt_boundary';
                if (refiners.find((r) => r.id === aiId)) order.push('any');
                if (detectedCategory) order.push(detectedCategory);
                ['building', 'road', 'water', 'vegetation', 'farmland', 'multi'].forEach((c) => {
                  if (!order.includes(c)) order.push(c);
                });

                const grouped: Record<string, RefinerMeta[]> = {};
                refiners.forEach((r) => {
                  const cat = r.category || 'multi';
                  if (!grouped[cat]) grouped[cat] = [];
                  grouped[cat].push(r);
                });

                return order
                  .filter((c) => grouped[c]?.length)
                  .map((cat) => (
                    <div key={cat} style={{ marginBottom: 14 }}>
                      <div
                        style={{
                          fontSize: 11,
                          color: cat === 'any' ? '#f97316' : '#74f7fd',
                          fontFamily: "'DouyuFont', sans-serif",
                          letterSpacing: 1,
                          marginBottom: 6,
                          paddingBottom: 4,
                          borderBottom: `1px solid ${cat === 'any' ? 'rgba(249,115,22,0.25)' : 'rgba(116,247,253,0.15)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {cat === 'any' && '✦ '}
                        {CATEGORY_LABELS[cat] || cat.toUpperCase()}
                        <span style={{ color: 'rgba(185,207,255,0.45)', fontSize: 10 }}>
                          · {grouped[cat].length} 个模型
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          gap: 10,
                        }}
                      >
                        {grouped[cat].map((r) => {
                          const active = selectedId === r.id;
                          const isGpt = r.inference_method === 'gpt_boundary';
                          return (
                            <div
                              key={r.id}
                              onClick={() => setSelectedId(r.id)}
                              style={{
                                cursor: 'pointer',
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: `1px solid ${active ? r.color : 'rgba(116,247,253,0.12)'}`,
                                background: active
                                  ? `linear-gradient(135deg, ${r.color}28, rgba(5,50,106,0.6))`
                                  : 'rgba(5,50,106,0.35)',
                                transition: 'all 0.2s ease',
                                boxShadow: active ? `0 0 14px ${r.color}55` : 'none',
                                position: 'relative',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginBottom: 4,
                                }}
                              >
                                <i
                                  className={`fa-solid ${r.icon}`}
                                  style={{ color: r.color, fontSize: 14 }}
                                />
                                <span
                                  style={{
                                    fontFamily: "'DouyuFont', sans-serif",
                                    fontSize: 12,
                                    color: '#fff',
                                  }}
                                >
                                  {r.name}
                                </span>
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                                  {r.tier === 1 && (
                                    <Tag
                                      style={{
                                        fontSize: 9,
                                        padding: '0 5px',
                                        lineHeight: '14px',
                                        background: 'rgba(116,247,253,0.15)',
                                        border: '1px solid rgba(116,247,253,0.5)',
                                        color: '#74f7fd',
                                      }}
                                    >
                                      PRISM-A
                                    </Tag>
                                  )}
                                  {r.tier === 2 && (
                                    <Tag
                                      style={{
                                        fontSize: 9,
                                        padding: '0 5px',
                                        lineHeight: '14px',
                                        background: 'rgba(91,199,250,0.18)',
                                        border: '1px solid rgba(91,199,250,0.55)',
                                        color: '#5bc7fa',
                                      }}
                                    >
                                      SOTA
                                    </Tag>
                                  )}
                                  {r.needs_download && (
                                    <Tag
                                      style={{
                                        fontSize: 9,
                                        padding: '0 5px',
                                        lineHeight: '14px',
                                        background: 'rgba(240,192,64,0.15)',
                                        border: '1px solid rgba(240,192,64,0.5)',
                                        color: '#f0c040',
                                      }}
                                    >
                                      首次下载
                                    </Tag>
                                  )}
                                  {isGpt && (
                                    <Tag
                                      style={{
                                        fontSize: 9,
                                        padding: '0 5px',
                                        lineHeight: '14px',
                                        background: 'rgba(249,115,22,0.15)',
                                        border: '1px solid rgba(249,115,22,0.5)',
                                        color: '#f97316',
                                      }}
                                    >
                                      AI VISION
                                    </Tag>
                                  )}
                                </div>
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: 'rgba(185,207,255,0.65)',
                                  lineHeight: 1.5,
                                  fontFamily: "'Source Serif 4', serif",
                                  fontStyle: 'italic',
                                  marginBottom: 6,
                                }}
                              >
                                {r.description}
                              </div>
                              {r.paper && (
                                <div
                                  style={{
                                    fontSize: 9.5,
                                    color: 'rgba(185,207,255,0.5)',
                                    fontFamily: "'Source Serif 4', serif",
                                    fontStyle: 'italic',
                                    marginBottom: 2,
                                  }}
                                  title={r.paper}
                                >
                                  📖 {r.paper.length > 50 ? r.paper.slice(0, 50) + '…' : r.paper}
                                </div>
                              )}
                              {r.architecture && (
                                <div
                                  style={{
                                    fontSize: 9,
                                    color: 'rgba(116,247,253,0.55)',
                                    fontFamily: "'SarasaMonoSC', monospace",
                                    marginBottom: 2,
                                  }}
                                  title={r.architecture}
                                >
                                  🧬 {r.architecture.length > 55 ? r.architecture.slice(0, 55) + '…' : r.architecture}
                                </div>
                              )}
                              {r.hf_model && (
                                <div
                                  style={{
                                    fontSize: 9,
                                    color: 'rgba(91,199,250,0.55)',
                                    fontFamily: "'SarasaMonoSC', monospace",
                                    marginTop: 4,
                                    wordBreak: 'break-all',
                                  }}
                                >
                                  ⬇ {r.hf_model}
                                </div>
                              )}
                              {r.tier === 1 && r.rich_prompt && (
                                <div
                                  style={{
                                    fontSize: 9,
                                    color: 'rgba(116,247,253,0.55)',
                                    marginTop: 4,
                                    fontStyle: 'italic',
                                  }}
                                  title={r.rich_prompt}
                                >
                                  💬 {r.rich_prompt.length > 60 ? r.rich_prompt.slice(0, 60) + '…' : r.rich_prompt}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
              })()}
            </div>

            <div
              style={{
                background: 'rgba(240, 192, 64, 0.08)',
                border: '1px solid rgba(240,192,64,0.2)',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 11,
                color: '#f0c040',
                lineHeight: 1.6,
                display: 'flex',
                gap: 6,
                alignItems: 'flex-start',
              }}
            >
              <WarningOutlined style={{ marginTop: 3 }} />
              <span>
                精修会重新运行模型推理；
                {(() => {
                  const sel = refiners.find((r) => r.id === selectedId);
                  if (sel?.inference_method === 'gpt_boundary') {
                    return ' GPT 视觉边界精修需调用 GPT-5.5 + SAM3 box prompt，通常 60–120 秒；';
                  }
                  if (sel?.needs_download) {
                    return ' Tier-2 SOTA 模型首次使用会自动下载预训练权重（Mask2Former ~800MB / SegFormer ~320MB），后续从本地缓存加载；推理通常 15–60 秒；';
                  }
                  if (sel?.tier === 1) {
                    return ' Tier-1 PRISM-A 单类别精修使用本仓库 SegEarth-OV-3 权重，开放词汇、无需下载，通常 10–30 秒；';
                  }
                  return ' SOTA 模型精修通常 10–60 秒；';
                })()}
                精修后会自动备份当前 mask，如不满意可点击工具栏「撤销精修」回退；建议先 <kbd style={{ background: 'rgba(0,0,0,0.4)', padding: '0 4px', borderRadius: 3, fontFamily: 'monospace' }}>Ctrl+S</kbd> 保存当前手动编辑。
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 16,
              }}
            >
              <button
                onClick={onCancel}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(116,247,253,0.25)',
                  color: '#b9cfff',
                  padding: '6px 16px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                取消
              </button>
              <button
                onClick={startRefine}
                disabled={!selectedId}
                style={{
                  background: selectedId
                    ? 'linear-gradient(135deg, #74f7fd, #5bc7fa)'
                    : 'rgba(116,247,253,0.25)',
                  border: 'none',
                  color: selectedId ? '#001220' : 'rgba(255,255,255,0.4)',
                  padding: '6px 18px',
                  borderRadius: 6,
                  cursor: selectedId ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  fontSize: 13,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <ThunderboltOutlined />
                开始精修
              </button>
            </div>
          </>
        )}

        {progress && (
          <div style={{ padding: '12px 0' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 12,
              }}
            >
              {isProcessing && (
                <LoadingOutlined style={{ color: '#74f7fd', fontSize: 18 }} />
              )}
              {isDone && (
                <CheckCircleOutlined style={{ color: '#74fabd', fontSize: 18 }} />
              )}
              {progress.status === 'failed' && (
                <WarningOutlined style={{ color: '#ff4444', fontSize: 18 }} />
              )}
              <span style={{ color: '#fff', fontSize: 13 }}>
                {progress.message || '处理中...'}
              </span>
            </div>

            <Progress
              percent={Math.round(progress.progress)}
              strokeColor={{
                '0%': '#74fabd',
                '100%': '#74f7fd',
              }}
              status={
                progress.status === 'failed'
                  ? 'exception'
                  : isDone
                  ? 'success'
                  : 'active'
              }
            />

            {progress.stats && (
              <div
                style={{
                  marginTop: 16,
                  background: 'rgba(5,50,106,0.4)',
                  border: '1px solid rgba(116,247,253,0.12)',
                  borderRadius: 6,
                  padding: 12,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '8px 16px',
                  fontSize: 12,
                  fontFamily: "'SarasaMonoSC', monospace",
                }}
              >
                <div>
                  <div style={{ color: '#b9cfff', opacity: 0.6, fontSize: 10, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>
                    Original pixels
                  </div>
                  <div style={{ color: '#fff', fontFamily: "'DincorosBlack'", fontSize: 16 }}>
                    {progress.stats.original_pixels.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#b9cfff', opacity: 0.6, fontSize: 10, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>
                    Refined pixels
                  </div>
                  <div style={{ color: '#74f7fd', fontFamily: "'DincorosBlack'", fontSize: 16 }}>
                    {progress.stats.refined_pixels.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#b9cfff', opacity: 0.6, fontSize: 10, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>
                    Added (+)
                  </div>
                  <div style={{ color: '#74fabd', fontFamily: "'DincorosBlack'", fontSize: 16 }}>
                    +{progress.stats.added_pixels.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#b9cfff', opacity: 0.6, fontSize: 10, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>
                    Removed (−)
                  </div>
                  <div style={{ color: '#ff8a8a', fontFamily: "'DincorosBlack'", fontSize: 16 }}>
                    −{progress.stats.removed_pixels.toLocaleString()}
                  </div>
                </div>
                <div style={{ gridColumn: '1 / -1', borderTop: '1px solid rgba(116,247,253,0.1)', paddingTop: 8 }}>
                  <span style={{ color: '#b9cfff', opacity: 0.6, fontSize: 10, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>
                    Δ ratio:{' '}
                  </span>
                  <span
                    style={{
                      color:
                        progress.stats.delta_ratio > 0
                          ? '#74fabd'
                          : progress.stats.delta_ratio < 0
                          ? '#ff8a8a'
                          : '#fff',
                      fontFamily: "'DincorosBlack'",
                      fontSize: 13,
                    }}
                  >
                    {progress.stats.delta_ratio > 0 ? '+' : ''}
                    {(progress.stats.delta_ratio * 100).toFixed(2)}%
                  </span>
                </div>
              </div>
            )}

            {(isDone || progress.status === 'failed') && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: 16,
                }}
              >
                <button
                  onClick={isDone ? onCompleted : onCancel}
                  style={{
                    background: isDone
                      ? 'linear-gradient(135deg, #74fabd, #74f7fd)'
                      : 'rgba(255,68,68,0.2)',
                    border: 'none',
                    color: isDone ? '#001220' : '#ff8a8a',
                    padding: '6px 18px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  {isDone ? '应用并关闭' : '关闭'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default RefineClassModal;
