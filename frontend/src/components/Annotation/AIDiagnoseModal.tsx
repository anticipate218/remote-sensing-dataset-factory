/**
 * AIDiagnoseModal - 使用 GPT 视觉模型对当前分割结果进行诊断和修正建议
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Modal, message, Progress, Tag, Button, Space, Tooltip } from 'antd';
import {
  RobotOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
  EditOutlined,
  AimOutlined,
  PlusCircleOutlined,
  ReloadOutlined,
  UndoOutlined,
  EyeOutlined,
} from '@ant-design/icons';

interface RefinerMeta {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color: string;
  category?: string;
  tier?: number;
  inference_method?: string;
  hf_model?: string;
  needs_download?: boolean;
  rich_prompt?: string;
  match_keywords?: string[];
  architecture?: string;
}

interface ClassAssessment {
  class_name: string;
  quality: 'good' | 'fair' | 'poor' | 'missing' | 'absent';
  issue: string;
  estimated_iou: number;
  _auto_filtered?: boolean;
}

interface ClassPresenceEntry {
  index: number;
  name: string;
  pixel_count: number;
  ratio: number;
  ratio_pct: number;
  present: boolean;
  is_background: boolean;
}

interface PresenceStats {
  total_pixels: number;
  per_class: ClassPresenceEntry[];
  present_indices: number[];
  absent_indices: number[];
  background_index: number;
  absent_ratio_threshold: number;
}

type RecommendedAction =
  | {
      type: 'improve_prompt';
      class_name: string;
      current_prompt?: string;
      suggested_prompt: string;
      reason: string;
      priority: 'high' | 'medium' | 'low';
      _auto_added?: boolean;
    }
  | {
      type: 'refine_class';
      class_name: string;
      refiner_id: string;
      reason: string;
      priority: 'high' | 'medium' | 'low';
      _auto_added?: boolean;
    }
  | {
      type: 'manual_attention';
      region: string;
      issue: string;
      priority: 'high' | 'medium' | 'low';
      _auto_added?: boolean;
    }
  | {
      type: 'missing_class';
      suggested_class: string;
      suggested_prompt: string;
      reason: string;
      priority: 'high' | 'medium' | 'low';
      _auto_added?: boolean;
    };

interface DiagnoseReport {
  diagnosis: {
    overall_quality: 'excellent' | 'good' | 'fair' | 'poor';
    overall_score: number;
    summary: string;
    per_class_assessment: ClassAssessment[];
    recommended_actions: RecommendedAction[];
  };
  model: string;
  usage?: { total_tokens?: number };
  presence_stats?: PresenceStats | null;
  filtered_actions_dropped?: any[];
  auto_added_actions?: any[];
}

interface AIDiagnoseModalProps {
  open: boolean;
  taskId: string | null;
  onCancel: () => void;
  onApplied?: (action: { kind: string; payload: any }) => void;
}

const QUALITY_COLOR: Record<string, string> = {
  excellent: '#74fabd',
  good: '#74fabd',
  fair: '#f0c040',
  poor: '#ff8a8a',
  missing: '#ff4d4f',
  absent: 'rgba(185,207,255,0.4)',
};

const QUALITY_LABEL: Record<string, string> = {
  excellent: '优秀',
  good: '良好',
  fair: '一般',
  poor: '较差',
  missing: '漏检',
  absent: '未在场',
};

const PRIORITY_COLOR: Record<string, string> = {
  high: '#ff4d4f',
  medium: '#f0c040',
  low: '#74f7fd',
};

const AIDiagnoseModal: React.FC<AIDiagnoseModalProps> = ({
  open,
  taskId,
  onCancel,
  onApplied,
}) => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DiagnoseReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [appliedIdx, setAppliedIdx] = useState<Set<number>>(new Set());
  const [applyProgress, setApplyProgress] = useState<{
    label: string;
    progress: number;
    message: string;
  } | null>(null);
  const [autoFixing, setAutoFixing] = useState(false);
  const [reviewResult, setReviewResult] = useState<{
    class_name: string;
    verdict: 'better' | 'equal' | 'worse';
    before_score: number;
    after_score: number;
    delta: number;
    summary: string;
    issues_in_after: string[];
    recommend_keep: boolean;
    refine_task_id: string;
  } | null>(null);

  // 实时预览 / 撤销 / refiner 选择
  const [previewKey, setPreviewKey] = useState<number>(Date.now());
  const [canUndoRefine, setCanUndoRefine] = useState<boolean>(false);
  const [canUndoRerun, setCanUndoRerun] = useState<boolean>(false);
  const [parentTaskId, setParentTaskId] = useState<string | null>(null);
  const [reverting, setReverting] = useState<boolean>(false);
  const [refinersAll, setRefinersAll] = useState<RefinerMeta[]>([]);
  const [actionRefiner, setActionRefiner] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!open) {
      setReport(null);
      setError(null);
      setLoading(false);
      setApplyingIdx(null);
      setAppliedIdx(new Set());
      setApplyProgress(null);
      setAutoFixing(false);
      setReviewResult(null);
      setActionRefiner({});
      setCanUndoRefine(false);
      setCanUndoRerun(false);
      setParentTaskId(null);
    }
  }, [open]);

  // 拉取所有 refiner 元数据（用于内联模型切换器）
  useEffect(() => {
    if (!open || refinersAll.length > 0) return;
    fetch('/api/refiners')
      .then((r) => r.json())
      .then((d) => setRefinersAll(d?.refiners || []))
      .catch(() => {/* silent */});
  }, [open, refinersAll.length]);

  // 查询是否有可撤销的精修 / 可切回的父任务
  const refreshUndoState = useCallback(async () => {
    if (!taskId) {
      setCanUndoRefine(false);
      setCanUndoRerun(false);
      setParentTaskId(null);
      return;
    }
    try {
      const r = await fetch(`/api/refine-history/${taskId}`);
      if (r.ok) {
        const d = await r.json();
        setCanUndoRefine(!!d.can_undo_refine);
        setCanUndoRerun(!!d.can_undo_rerun);
        setParentTaskId(d.parent_task_id || null);
      }
    } catch {
      setCanUndoRefine(false);
      setCanUndoRerun(false);
      setParentTaskId(null);
    }
  }, [taskId]);

  useEffect(() => {
    if (open) refreshUndoState();
  }, [open, refreshUndoState, previewKey]);

  // 通知父组件刷新画布并自我刷新预览
  const refreshPreview = useCallback((notifyParent = true) => {
    setPreviewKey(Date.now());
    if (notifyParent) {
      onApplied?.({ kind: 'refine', payload: { live_refresh: true } });
    }
  }, [onApplied]);

  // 切换到父任务（撤销 ai-rerun）
  const switchToParent = useCallback((newTaskId: string) => {
    // 通过 custom event 让父组件 (AnnotationEditor / App) 切换 currentTask
    window.dispatchEvent(
      new CustomEvent('rs:switch-task', { detail: { taskId: newTaskId } }),
    );
  }, []);

  // 撤销最近一次操作：优先撤精修；都没有就切回父任务
  const handleUndo = useCallback(async () => {
    if (!taskId) return;
    setReverting(true);
    try {
      if (canUndoRefine) {
        // 撤销最近一次精修
        const r = await fetch(`/api/refine-revert/${taskId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.detail || `状态码 ${r.status}`);
        }
        const data = await r.json();
        message.success(data.message || '已撤销最近一次精修');
        refreshPreview(true);
        setAppliedIdx(new Set());
        setReviewResult(null);
      } else if (canUndoRerun && parentTaskId) {
        // 没有精修可撤，但有父任务 → 切回父任务（撤销 ai-rerun）
        message.success(`已撤销提示词优化，切回父任务 ${parentTaskId}`);
        switchToParent(parentTaskId);
        // 父切换后会 propagate 到 taskId prop，自动 refresh
      } else {
        message.info('没有可撤销的操作');
      }
    } catch (e: any) {
      message.error(`撤销失败: ${e.message || e}`);
    } finally {
      setReverting(false);
    }
  }, [taskId, canUndoRefine, canUndoRerun, parentTaskId, refreshPreview, switchToParent]);

  // 撤销全部：先把当前任务的精修全部撤销，再沿 parent 链一直爬到最早的根任务
  const handleUndoAll = useCallback(async () => {
    if (!taskId) return;
    setReverting(true);
    try {
      let curTaskId = taskId;
      let totalRefineUndone = 0;
      let totalRerunUndone = 0;
      // 沿 parent 链上溯，每个节点把精修撤光，再切到 parent；安全上限 30 层
      for (let depth = 0; depth < 30; depth++) {
        // 1. 在当前任务把精修全部撤销
        for (let i = 0; i < 50; i++) {
          const histResp = await fetch(`/api/refine-history/${curTaskId}`);
          if (!histResp.ok) break;
          const histData = await histResp.json();
          if (!histData.can_undo_refine) {
            // 没有精修可撤了 → 看是否有 parent
            if (histData.can_undo_rerun && histData.parent_task_id) {
              curTaskId = histData.parent_task_id;
              totalRerunUndone += 1;
              break; // 跳出内层循环，进入下一层
            }
            // 没有 parent 也没有精修 → 已经到根
            depth = 99; // 强制跳出外层
            break;
          }
          const r = await fetch(`/api/refine-revert/${curTaskId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          if (!r.ok) break;
          totalRefineUndone += 1;
        }
        if (depth >= 99) break;
      }

      if (totalRefineUndone === 0 && totalRerunUndone === 0) {
        message.info('没有可撤销的操作（已经是最初状态）');
      } else {
        const msgParts: string[] = [];
        if (totalRefineUndone > 0) msgParts.push(`${totalRefineUndone} 次精修`);
        if (totalRerunUndone > 0) msgParts.push(`${totalRerunUndone} 次提示词优化`);
        message.success(`已撤销全部：${msgParts.join(' + ')}，回到最根任务 ${curTaskId}`);
      }

      // 切到最根任务（如果有变化）
      if (curTaskId !== taskId) {
        switchToParent(curTaskId);
      } else {
        refreshPreview(true);
      }
      setAppliedIdx(new Set());
      setReviewResult(null);
    } catch (e: any) {
      message.error(`全部撤销失败: ${e.message || e}`);
    } finally {
      setReverting(false);
    }
  }, [taskId, refreshPreview, switchToParent]);

  // 给定类别名，返回该类别可用的所有 refiner（用于内联选择器）
  const matchingRefinersFor = useCallback(
    (className: string): RefinerMeta[] => {
      if (refinersAll.length === 0) return [];
      const text = className.toLowerCase();
      const matched = refinersAll.filter((r) => {
        if (r.category === 'any') return true;
        if (r.category && text.includes(r.category)) return true;
        if (
          r.match_keywords?.some((k) =>
            text.includes(k.toLowerCase()),
          )
        )
          return true;
        return false;
      });
      // 排序：Tier 1 (PRISM-A) → Tier 2 (SOTA) → Tier 3 (AI Vision)
      return matched.sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99));
    },
    [refinersAll],
  );

  const runDiagnose = async () => {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const resp = await fetch(`/api/ai-diagnose/${taskId}`, { method: 'POST' });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `状态码 ${resp.status}`);
      }
      const data = (await resp.json()) as DiagnoseReport;
      setReport(data);
    } catch (e: any) {
      setError(e.message || String(e));
      message.error(`AI 诊断失败: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  // 自动触发诊断
  useEffect(() => {
    if (open && taskId && !report && !loading && !error) {
      runDiagnose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId]);

  // 轮询某个任务直到完成 / 失败
  const pollTask = async (
    pollTaskId: string,
    label: string,
    timeoutMs = 5 * 60 * 1000,
  ): Promise<any> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const r = await fetch(`/api/tasks/${pollTaskId}`);
        if (r.ok) {
          const d = await r.json();
          setApplyProgress({
            label,
            progress: d.progress ?? 0,
            message: d.message ?? '处理中...',
          });
          if (d.status === 'completed') return d;
          if (d.status === 'failed') {
            throw new Error(d.error || d.message || '任务失败');
          }
        }
      } catch (e) {
        // 网络瞬时错误忽略
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error(`${label} 超时（${Math.round(timeoutMs / 1000)}s）`);
  };

  // 执行精修 + GPT 复查的组合流程
  const runRefineWithReview = async (
    className: string,
    refinerId: string,
  ): Promise<any> => {
    if (!taskId) throw new Error('无 taskId');

    const taskResp = await fetch(`/api/tasks/${taskId}`);
    const taskData = await taskResp.json();
    const classes: string[] = taskData?.result?.classes || [];
    const classIndex = classes.indexOf(className);
    if (classIndex < 1) {
      throw new Error(`类别 ${className} 不在任务中（index=${classIndex}）`);
    }

    // 1. 启动精修任务
    const resp = await fetch(`/api/refine-class/${taskId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class_name: className,
        class_index: classIndex,
        refiner_id: refinerId,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `状态码 ${resp.status}`);
    }
    const data = await resp.json();
    const refineTaskId: string | undefined = data?.refine_task_id;
    if (!refineTaskId) throw new Error('未获取到 refine_task_id');

    // 2. 轮询精修完成
    const taskResult = await pollTask(refineTaskId, `精修 [${className}]`);

    // 精修完成后立即刷新预览图（GPT 复查前先让用户看到效果）
    refreshPreview(true);

    // 检查是否被拒绝
    const rejected = taskResult?.result?.rejected || taskResult?.result?.stats?.rejected;
    if (rejected) {
      const reason =
        taskResult?.result?.stats?.reject_reason ||
        taskResult?.message ||
        '精修结果异常被拒绝';
      return {
        ...data,
        refine_task_id: refineTaskId,
        rejected: true,
        reason,
      };
    }

    // 3. 触发 GPT 复查
    setApplyProgress({
      label: `GPT 复查 [${className}]`,
      progress: 95,
      message: 'GPT 正在审阅 BEFORE / AFTER 对比...',
    });
    try {
      const reviewResp = await fetch(`/api/refine-review/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refine_task_id: refineTaskId }),
      });
      if (reviewResp.ok) {
        const reviewData = await reviewResp.json();
        const r = reviewData.review || {};
        const reviewObj = {
          class_name: className,
          refine_task_id: refineTaskId,
          verdict: r.verdict || 'equal',
          before_score: r.before_score ?? 50,
          after_score: r.after_score ?? 50,
          delta: r.delta ?? 0,
          summary: r.summary || '',
          issues_in_after: r.issues_in_after || [],
          recommend_keep: r.recommend_keep !== false,
        };
        setReviewResult(reviewObj as any);

        // 如果 GPT 强烈不建议保留，自动撤销
        if (reviewObj.verdict === 'worse' && reviewObj.recommend_keep === false) {
          message.warning(`GPT 复查认为精修结果变差（${reviewObj.delta}），正在自动撤销...`);
          await fetch(`/api/refine-revert/${taskId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refine_task_id: refineTaskId }),
          });
          refreshPreview(true);
          return {
            ...data,
            refine_task_id: refineTaskId,
            rejected: true,
            reason: `GPT 复查判定变差（${reviewObj.delta}）已自动回退`,
            review: reviewObj,
          };
        }

        return { ...data, refine_task_id: refineTaskId, review: reviewObj };
      }
    } catch (e) {
      console.warn('GPT review failed', e);
    }

    return { ...data, refine_task_id: refineTaskId };
  };

  // 一键应用全部精修建议：尊重用户对每个动作的 Tier 选择（不再强制 T3）
  // - 如果用户已经在某条卡片上点了 T1/T2/T3 → 用用户选的
  // - 否则 → 用 GPT 推荐的 refiner_id
  const runOneClickAutoFix = async () => {
    if (!taskId || !report) return;
    const allActions = report.diagnosis.recommended_actions;
    const refineActions: Array<{
      action: Extract<RecommendedAction, { type: 'refine_class' }>;
      globalIdx: number;
    }> = [];
    allActions.forEach((a, idx) => {
      if (a.type === 'refine_class') {
        refineActions.push({
          action: a as Extract<RecommendedAction, { type: 'refine_class' }>,
          globalIdx: idx,
        });
      }
    });

    if (refineActions.length === 0) {
      message.info('GPT 认为当前结果无需精修');
      return;
    }

    setAutoFixing(true);
    let successCount = 0;
    let rejectedCount = 0;
    const newAppliedIdx = new Set(appliedIdx);

    try {
      for (let i = 0; i < refineActions.length; i++) {
        const { action: a, globalIdx } = refineActions[i];
        // 已应用的跳过（避免重复执行）
        if (appliedIdx.has(globalIdx)) {
          continue;
        }
        // 用户在该卡片上选的 refiner 优先于 GPT 推荐
        const chosenRefinerId = actionRefiner[globalIdx] || a.refiner_id;
        const refinerMeta = refinersAll.find((r) => r.id === chosenRefinerId);
        const refinerLabel = refinerMeta?.name || chosenRefinerId;

        setApplyProgress({
          label: `[${i + 1}/${refineActions.length}] ${a.class_name} → ${refinerLabel}`,
          progress: 0,
          message: `准备调用 ${refinerLabel}...`,
        });
        try {
          const result = await runRefineWithReview(a.class_name, chosenRefinerId);
          if (result.rejected) {
            rejectedCount += 1;
          } else {
            successCount += 1;
          }
          newAppliedIdx.add(globalIdx);
        } catch (e: any) {
          console.error(`精修 ${a.class_name} 失败`, e);
          message.warning(`${a.class_name} 精修失败: ${e.message || e}（继续下一个）`);
        }
      }
      setAppliedIdx(newAppliedIdx);
      message.success(
        `批量精修完成：成功 ${successCount} 项，被拒/回退 ${rejectedCount} 项`,
      );
      onApplied?.({ kind: 'refine', payload: { auto_fix: true } });
    } finally {
      setAutoFixing(false);
      setApplyProgress(null);
    }
  };

  const applyAction = async (action: RecommendedAction, idx: number) => {
    if (!taskId) return;
    setApplyingIdx(idx);
    setApplyProgress({ label: '提交中...', progress: 0, message: '' });
    try {
      if (action.type === 'improve_prompt' || action.type === 'missing_class') {
        const body = action.type === 'improve_prompt'
          ? { new_prompts: { [action.class_name]: action.suggested_prompt } }
          : { additional_classes: [{ name: action.suggested_class, prompt: action.suggested_prompt }] };

        const resp = await fetch(`/api/ai-rerun/${taskId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.detail || `状态码 ${resp.status}`);
        }
        const data = await resp.json();
        const newTaskId: string | undefined = data?.new_task_id;
        if (!newTaskId) throw new Error('未获取到 new_task_id');

        const label = action.type === 'improve_prompt'
          ? `重新预测 [${action.class_name}]`
          : `新增类别 [${action.suggested_class}]`;
        await pollTask(newTaskId, label);
        message.success(`${label} 完成`);
        onApplied?.({ kind: 'rerun', payload: { ...data, switch_to: newTaskId } });
      } else if (action.type === 'refine_class') {
        // 用户在 UI 上选的 refiner 优先于 GPT 推荐
        const chosenRefinerId = actionRefiner[idx] || action.refiner_id;
        const result = await runRefineWithReview(action.class_name, chosenRefinerId);
        if (result.rejected) {
          message.warning(result.reason || '精修被拒绝');
        } else {
          message.success(
            `${action.class_name} 精修完成 · GPT 复查 ${result.verdict || '...'}（${result.delta >= 0 ? '+' : ''}${result.delta}）`
          );
        }
        // 通知父组件画布刷新（runRefineWithReview 内部已 refreshPreview，这里再显式触发一次保险）
        onApplied?.({ kind: 'refine', payload: result });
      } else if (action.type === 'manual_attention') {
        message.info(`请手动检查 ${action.region} 区域：${action.issue}`);
        onApplied?.({ kind: 'manual', payload: action });
      }
      setAppliedIdx((prev) => new Set(prev).add(idx));
    } catch (e: any) {
      message.error(`应用建议失败: ${e.message || e}`);
    } finally {
      setApplyingIdx(null);
      setApplyProgress(null);
    }
  };

  // 实时预览面板：sticky 顶部，无论用户滚到哪里都能看到当前 mask 状态
  const renderLivePreview = () => {
    if (!taskId) return null;
    const cacheBust = previewKey;
    return (
      <div
        style={{
          // ↓ sticky 让预览始终贴在彈窗内容顶部，用户滚动 / 应用建议都看得到
          position: 'sticky',
          top: -8, // 抵消父容器 paddingTop:8 让它贴边
          zIndex: 10,
          marginBottom: 12,
          padding: 10,
          background:
            'linear-gradient(180deg, rgba(5,50,106,0.95) 0%, rgba(5,50,106,0.85) 100%)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid rgba(116,247,253,0.25)',
          borderRadius: 8,
          boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontFamily: "'DouyuFont', sans-serif",
              fontSize: 12,
              color: '#74f7fd',
              letterSpacing: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <EyeOutlined /> 实时标注预览
            <span
              style={{
                fontSize: 10,
                color: 'rgba(185,207,255,0.55)',
                fontFamily: "'Source Han Serif SC', serif",
                fontStyle: 'italic',
                marginLeft: 6,
              }}
            >
              · 每次精修自动刷新（始终置顶）
            </span>
          </span>
          <Space size={6}>
            {(canUndoRefine || canUndoRerun) && (
              <>
                <Tooltip
                  title={
                    canUndoRefine
                      ? '撤销最近一次精修（refine_class）'
                      : canUndoRerun
                      ? `切回父任务 ${parentTaskId}（撤销提示词优化）`
                      : ''
                  }
                >
                  <Button
                    size="small"
                    icon={<UndoOutlined />}
                    loading={reverting}
                    onClick={handleUndo}
                    style={{
                      background: 'rgba(255,138,138,0.12)',
                      border: '1px solid rgba(255,138,138,0.4)',
                      color: '#ff8a8a',
                      fontSize: 11,
                    }}
                  >
                    {canUndoRefine ? '撤销一次' : '撤销重跑'}
                  </Button>
                </Tooltip>
                <Tooltip title="循环撤销所有精修 + 沿父任务链一直追溯到最初的根预测">
                  <Button
                    size="small"
                    danger
                    icon={<UndoOutlined />}
                    loading={reverting}
                    onClick={handleUndoAll}
                    style={{
                      background: 'rgba(255,77,79,0.18)',
                      border: '1px solid rgba(255,77,79,0.55)',
                      color: '#ff7875',
                      fontSize: 11,
                      fontFamily: "'DouyuFont', sans-serif",
                      letterSpacing: 0.5,
                    }}
                  >
                    全部撤销
                  </Button>
                </Tooltip>
              </>
            )}
            <Tooltip title="手动刷新预览">
              <Button
                size="small"
                type="text"
                icon={<ReloadOutlined />}
                onClick={() => refreshPreview(false)}
                style={{ color: '#74f7fd', fontSize: 11 }}
              />
            </Tooltip>
          </Space>
        </div>
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 200,
            background:
              'repeating-conic-gradient(rgba(255,255,255,0.04) 0 90deg, transparent 90deg 180deg) 0 0/14px 14px',
            borderRadius: 6,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* key={cacheBust} 强制 React 卸载/重挂 img 元素，保证浏览器重新请求新内容 */}
          <img
            key={`orig-${cacheBust}`}
            src={`/api/prediction/${taskId}/original?_=${cacheBust}`}
            alt="原图"
            onError={(e) => {
              (e.target as HTMLImageElement).style.opacity = '0.2';
            }}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
          />
          <img
            key={`mask-${cacheBust}`}
            src={`/api/prediction/${taskId}/mask?colored=true&_=${cacheBust}`}
            alt="标注层"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              margin: 'auto',
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              opacity: 0.55,
              mixBlendMode: 'screen',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
    );
  };

  const renderPanel = () => {
    if (loading) {
      return (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#b9cfff',
          }}
        >
          <LoadingOutlined style={{ fontSize: 32, color: '#74f7fd' }} />
          <div style={{ marginTop: 16, fontSize: 13 }}>
            正在调用 GPT 视觉模型分析图像...
          </div>
          <div style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>
            通常需要 30–60 秒
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div
          style={{
            padding: 20,
            background: 'rgba(255,68,68,0.1)',
            border: '1px solid rgba(255,68,68,0.3)',
            borderRadius: 6,
            color: '#ff8a8a',
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <WarningOutlined />
            <strong>诊断失败</strong>
          </div>
          <div style={{ fontSize: 12 }}>{error}</div>
          <Button
            type="primary"
            ghost
            style={{ marginTop: 12 }}
            onClick={runDiagnose}
          >
            重试
          </Button>
        </div>
      );
    }

    if (!report) return null;

    const d = report.diagnosis;
    const qualityColor = QUALITY_COLOR[d.overall_quality] || '#74f7fd';

    return (
      <div>
        {/* 总体评估 */}
        <div
          style={{
            padding: 12,
            background: `linear-gradient(135deg, ${qualityColor}1f, rgba(5,50,106,0.6))`,
            border: `1px solid ${qualityColor}55`,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontFamily: "'DouyuFont', sans-serif",
                  fontSize: 14,
                  color: '#fff',
                }}
              >
                整体评估
              </span>
              <Tag color={d.overall_quality === 'good' || d.overall_quality === 'excellent' ? 'success' : d.overall_quality === 'fair' ? 'warning' : 'error'}>
                {d.overall_quality.toUpperCase()}
              </Tag>
            </div>
            <div style={{ fontFamily: "'DincorosBlack'", fontSize: 28, color: qualityColor }}>
              {d.overall_score}
              <span style={{ fontSize: 12, opacity: 0.6 }}>/100</span>
            </div>
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(185,207,255,0.8)',
              lineHeight: 1.7,
              fontFamily: "'Source Han Sans CN', sans-serif",
            }}
          >
            {d.summary}
          </div>
        </div>

        {/* === 类别在场情况（presence）— v2 新增 === */}
        {report.presence_stats && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              background: 'linear-gradient(135deg, rgba(116,247,253,0.06), rgba(167,139,250,0.04))',
              border: '1px solid rgba(116,247,253,0.18)',
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <span
                style={{
                  fontFamily: "'DouyuFont', sans-serif",
                  fontSize: 13,
                  color: '#74f7fd',
                  letterSpacing: 1,
                }}
              >
                <i className="fa-solid fa-filter" style={{ marginRight: 6, fontSize: 11 }} />
                类别在场过滤
              </span>
              <Space size={6}>
                <Tag style={{
                  background: 'rgba(116,250,189,0.15)',
                  border: '1px solid rgba(116,250,189,0.45)',
                  color: '#74fabd',
                  fontFamily: "'SarasaMonoSC', monospace",
                  fontSize: 11,
                }}>
                  在场 {report.presence_stats.present_indices.length}
                </Tag>
                <Tag style={{
                  background: 'rgba(185,207,255,0.08)',
                  border: '1px solid rgba(185,207,255,0.25)',
                  color: 'rgba(185,207,255,0.7)',
                  fontFamily: "'SarasaMonoSC', monospace",
                  fontSize: 11,
                }}>
                  跳过 {report.presence_stats.absent_indices.length}
                </Tag>
                {report.filtered_actions_dropped && report.filtered_actions_dropped.length > 0 && (
                  <Tag style={{
                    background: 'rgba(240,192,64,0.15)',
                    border: '1px solid rgba(240,192,64,0.45)',
                    color: '#f0c040',
                    fontFamily: "'SarasaMonoSC', monospace",
                    fontSize: 11,
                  }}>
                    过滤建议 {report.filtered_actions_dropped.length}
                  </Tag>
                )}
              </Space>
            </div>

            {/* 在场类别（带百分比） */}
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: '#74fabd', fontSize: 10, fontFamily: "'SarasaMonoSC', monospace", marginRight: 6 }}>
                PRESENT (≥{(report.presence_stats.absent_ratio_threshold * 100).toFixed(1)}% 像素):
              </span>
              {report.presence_stats.per_class
                .filter((c) => c.present)
                .sort((a, b) => b.ratio - a.ratio)
                .map((c) => (
                  <Tag
                    key={c.index}
                    style={{
                      background: 'rgba(116,250,189,0.1)',
                      border: '1px solid rgba(116,250,189,0.35)',
                      color: '#fff',
                      fontFamily: "'SarasaMonoSC', monospace",
                      fontSize: 10,
                      marginRight: 4,
                      marginBottom: 4,
                    }}
                  >
                    {c.name} <span style={{ color: '#74fabd', marginLeft: 4 }}>{c.ratio_pct}%</span>
                  </Tag>
                ))}
            </div>

            {/* 不在场类别（折叠提示） */}
            {report.presence_stats.absent_indices.length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary
                  style={{
                    color: 'rgba(185,207,255,0.7)',
                    fontSize: 10,
                    fontFamily: "'SarasaMonoSC', monospace",
                    cursor: 'pointer',
                    userSelect: 'none',
                    listStyle: 'inside',
                  }}
                >
                  ABSENT — 图中未检出的 {report.presence_stats.absent_indices.length} 个类别（已自动从诊断中跳过）
                </summary>
                <div style={{ marginTop: 6, paddingLeft: 12 }}>
                  {report.presence_stats.per_class
                    .filter((c) => !c.present && !c.is_background)
                    .map((c) => (
                      <Tag
                        key={c.index}
                        style={{
                          background: 'rgba(185,207,255,0.05)',
                          border: '1px solid rgba(185,207,255,0.18)',
                          color: 'rgba(185,207,255,0.55)',
                          fontFamily: "'SarasaMonoSC', monospace",
                          fontSize: 10,
                          marginRight: 4,
                          marginBottom: 4,
                          textDecoration: 'line-through',
                        }}
                      >
                        {c.name} <span style={{ marginLeft: 4 }}>{c.pixel_count}px</span>
                      </Tag>
                    ))}
                </div>
              </details>
            )}

            <div
              style={{
                marginTop: 8,
                fontSize: 10,
                color: 'rgba(185,207,255,0.55)',
                fontFamily: "'Source Serif 4', serif",
                fontStyle: 'italic',
                lineHeight: 1.5,
              }}
            >
              💡 系统已根据 mask 像素占比识别出图中实际存在的类别，AI 仅针对它们做诊断与建议；
              对未检出的类别（如本图配置了 22 类但场景中只有少数几类）会自动跳过，避免产生误导性建议。
            </div>
          </div>
        )}

        {/* 按类别评估 */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontFamily: "'DouyuFont', sans-serif",
              fontSize: 13,
              color: '#74f7fd',
              marginBottom: 8,
              letterSpacing: 1,
            }}
          >
            按类别诊断
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 8,
            }}
          >
            {d.per_class_assessment.map((p) => {
              const c = QUALITY_COLOR[p.quality] || '#74f7fd';
              return (
                <div
                  key={p.class_name}
                  style={{
                    padding: 8,
                    background: 'rgba(5,50,106,0.4)',
                    border: `1px solid ${c}33`,
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        color: '#fff',
                        fontFamily: "'DouyuFont', sans-serif",
                        fontSize: 12,
                      }}
                    >
                      {p.class_name}
                    </span>
                    <span
                      style={{
                        color: c,
                        fontSize: 9,
                        padding: '1px 6px',
                        borderRadius: 3,
                        background: `${c}22`,
                        border: `1px solid ${c}55`,
                        textTransform: 'uppercase',
                      }}
                    >
                      {p.quality}
                    </span>
                  </div>
                  <Progress
                    percent={Math.round(p.estimated_iou * 100)}
                    size="small"
                    strokeColor={c}
                    showInfo={false}
                    style={{ marginBottom: 4 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
                    <span style={{ color: 'rgba(185,207,255,0.6)', fontStyle: 'italic', fontFamily: "'Source Serif 4', serif" }}>
                      Est. IoU
                    </span>
                    <span style={{ color: c, fontFamily: "'DincorosBlack'" }}>
                      {(p.estimated_iou * 100).toFixed(0)}%
                    </span>
                  </div>
                  {p.issue && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 10,
                        color: 'rgba(255,200,200,0.85)',
                        lineHeight: 1.5,
                      }}
                    >
                      ⚠ {p.issue}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 一键应用全部精修建议（按用户在每张卡片上选的 Tier 执行） */}
        {d.recommended_actions.some((a) => a.type === 'refine_class') && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              background:
                'linear-gradient(135deg, rgba(249,115,22,0.12), rgba(116,247,253,0.12))',
              border: '1px solid rgba(249,115,22,0.4)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <RobotOutlined style={{ fontSize: 22, color: '#f97316' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "'DouyuFont', sans-serif",
                  fontSize: 13,
                  color: '#fff',
                  marginBottom: 2,
                }}
              >
                一键应用全部精修建议
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(185,207,255,0.75)',
                  fontFamily: "'Source Han Serif SC', serif",
                  fontStyle: 'italic',
                }}
              >
                按你在下方每张卡片上选的 Tier（T1/T2/T3）依次执行；未手动选则采用 GPT 推荐。
                每步完成后 GPT 自动复查，变差时自动回退。
              </div>
            </div>
            <Button
              type="primary"
              size="middle"
              loading={autoFixing}
              disabled={applyingIdx !== null}
              onClick={runOneClickAutoFix}
              style={{
                background: 'linear-gradient(135deg, #f97316, #74f7fd)',
                border: 'none',
                color: '#fff',
                fontFamily: "'DouyuFont', sans-serif",
                letterSpacing: 1,
              }}
            >
              一键执行全部
            </Button>
          </div>
        )}

        {/* GPT 复查结果 */}
        {reviewResult && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              background:
                reviewResult.verdict === 'better'
                  ? 'rgba(116,250,189,0.10)'
                  : reviewResult.verdict === 'worse'
                  ? 'rgba(255,138,138,0.10)'
                  : 'rgba(240,192,64,0.10)',
              border: `1px solid ${
                reviewResult.verdict === 'better'
                  ? 'rgba(116,250,189,0.4)'
                  : reviewResult.verdict === 'worse'
                  ? 'rgba(255,138,138,0.4)'
                  : 'rgba(240,192,64,0.4)'
              }`,
              borderRadius: 8,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
                fontFamily: "'DouyuFont', sans-serif",
                fontSize: 12,
                color: '#fff',
              }}
            >
              <RobotOutlined />
              GPT 复查 [{reviewResult.class_name}]
              <Tag
                color={
                  reviewResult.verdict === 'better'
                    ? 'green'
                    : reviewResult.verdict === 'worse'
                    ? 'red'
                    : 'gold'
                }
                style={{ marginLeft: 'auto', fontSize: 10 }}
              >
                {reviewResult.verdict.toUpperCase()} ·{' '}
                {reviewResult.delta >= 0 ? '+' : ''}
                {reviewResult.delta}
              </Tag>
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#b9cfff',
                fontFamily: "'Source Han Serif SC', serif",
                marginBottom: 4,
              }}
            >
              {reviewResult.summary}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 12,
                fontSize: 10,
                color: 'rgba(185,207,255,0.7)',
              }}
            >
              <span>BEFORE: {reviewResult.before_score}</span>
              <span>AFTER: {reviewResult.after_score}</span>
              {!reviewResult.recommend_keep && (
                <span style={{ color: '#ff8a8a' }}>
                  · GPT 建议撤销
                </span>
              )}
            </div>
            {reviewResult.issues_in_after.length > 0 && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 10,
                  color: '#ff8a8a',
                  fontFamily: "'Source Han Serif SC', serif",
                }}
              >
                问题点：{reviewResult.issues_in_after.join('; ')}
              </div>
            )}
          </div>
        )}

        {/* 推荐动作 */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontFamily: "'DouyuFont', sans-serif",
              fontSize: 13,
              color: '#74f7fd',
              marginBottom: 8,
              letterSpacing: 1,
            }}
          >
            推荐修正动作 ({d.recommended_actions.length})
          </div>
          {d.recommended_actions.length === 0 && (
            <div
              style={{
                padding: 12,
                background: 'rgba(116,250,189,0.08)',
                border: '1px solid rgba(116,250,189,0.25)',
                borderRadius: 6,
                color: '#74fabd',
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              <CheckCircleOutlined /> AI 认为当前结果质量良好，无需修正
            </div>
          )}
          {d.recommended_actions.map((a, idx) => {
            const priority = (a as any).priority || 'medium';
            const pColor = PRIORITY_COLOR[priority] || '#74f7fd';
            const isApplied = appliedIdx.has(idx);
            const isApplying = applyingIdx === idx;

            let icon: React.ReactNode = <ThunderboltOutlined />;
            let title = '';
            let description = '';

            if (a.type === 'improve_prompt') {
              icon = <EditOutlined style={{ color: '#74f7fd' }} />;
              title = `优化 "${a.class_name}" 提示词`;
              description = `${a.current_prompt || '(未知)'} → "${a.suggested_prompt}"`;
            } else if (a.type === 'refine_class') {
              icon = <ThunderboltOutlined style={{ color: '#74fabd' }} />;
              title = `用专用模型精修 "${a.class_name}"`;
              const chosenId = actionRefiner[idx] || a.refiner_id;
              const meta = refinersAll.find((r) => r.id === chosenId);
              if (meta) {
                description = `${meta.name}`;
              } else {
                description = `精修器: ${chosenId}`;
              }
            } else if (a.type === 'manual_attention') {
              icon = <AimOutlined style={{ color: '#f0c040' }} />;
              title = `手动检查 ${a.region}`;
              description = a.issue;
            } else if (a.type === 'missing_class') {
              icon = <PlusCircleOutlined style={{ color: '#ff8a8a' }} />;
              title = `新增类别 "${a.suggested_class}"`;
              description = `提示词: "${a.suggested_prompt}"`;
            }

            const reason = (a as any).reason || (a as any).issue || '';

            return (
              <div
                key={idx}
                style={{
                  padding: 12,
                  background: 'rgba(5,50,106,0.4)',
                  border: `1px solid ${pColor}44`,
                  borderRadius: 6,
                  marginBottom: 8,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  transition: 'all 0.2s ease',
                  opacity: isApplied ? 0.55 : 1,
                }}
              >
                <div style={{ fontSize: 16, marginTop: 2 }}>{icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      alignItems: 'center',
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'DouyuFont', sans-serif",
                        fontSize: 12,
                        color: '#fff',
                      }}
                    >
                      {title}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        color: pColor,
                        padding: '0 6px',
                        borderRadius: 3,
                        background: `${pColor}22`,
                        border: `1px solid ${pColor}66`,
                        textTransform: 'uppercase',
                      }}
                    >
                      {priority}
                    </span>
                    {(a as any)._auto_added && (
                      <Tooltip title="GPT 未对该 PRESENT 类别给出建议；系统检测到 mask 中该类存在，自动补一条对应的 *_prism 精修建议（您可以应用或忽略）">
                        <span
                          style={{
                            fontSize: 9,
                            color: '#74fabd',
                            padding: '0 6px',
                            borderRadius: 3,
                            background: 'rgba(116,250,189,0.15)',
                            border: '1px dashed rgba(116,250,189,0.5)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          🤖 系统补充
                        </span>
                      </Tooltip>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#b9cfff',
                      marginBottom: 4,
                      fontFamily: "'SarasaMonoSC', monospace",
                      wordBreak: 'break-all',
                    }}
                  >
                    {description}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'rgba(185,207,255,0.7)',
                      lineHeight: 1.6,
                      fontStyle: 'italic',
                      fontFamily: "'Source Han Serif SC', serif",
                    }}
                  >
                    {reason}
                  </div>
                  {a.type === 'refine_class' && (() => {
                    const candidates = matchingRefinersFor(a.class_name);
                    if (candidates.length === 0) return null;
                    const chosen = actionRefiner[idx] || a.refiner_id;
                    return (
                      <div
                        style={{
                          marginTop: 8,
                          padding: 8,
                          background: 'rgba(0,0,0,0.25)',
                          borderRadius: 5,
                          border: '1px solid rgba(116,247,253,0.12)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            color: 'rgba(185,207,255,0.55)',
                            fontFamily: "'Source Serif 4', serif",
                            fontStyle: 'italic',
                            marginBottom: 6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <ThunderboltOutlined style={{ fontSize: 10 }} />
                          选择专有模型（GPT 推荐：
                          <span style={{ color: '#74fabd' }}>
                            {refinersAll.find((r) => r.id === a.refiner_id)?.name || a.refiner_id}
                          </span>
                          ）
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 4,
                          }}
                        >
                          {candidates.map((r) => {
                            const active = chosen === r.id;
                            const tierColor =
                              r.tier === 1
                                ? '#74f7fd'
                                : r.tier === 2
                                ? '#5bc7fa'
                                : '#f97316';
                            const tierLabel =
                              r.tier === 1
                                ? 'PRISM-A'
                                : r.tier === 2
                                ? 'SOTA'
                                : 'AI VISION';
                            // 提取类别图标 + 类别中文名 + 架构简称
                            const categoryMeta: Record<string, { icon: string; cn: string }> = {
                              building: { icon: '🏢', cn: '建筑物' },
                              road: { icon: '🛣️', cn: '道路' },
                              water: { icon: '💧', cn: '水体' },
                              vegetation: { icon: '🌳', cn: '植被' },
                              farmland: { icon: '🌾', cn: '农田' },
                              any: { icon: '🌐', cn: '通用' },
                            };
                            const cm = categoryMeta[r.category || 'any'] || categoryMeta.any;
                            // 架构简称（去掉冗长的 "ADE20K" 字样）
                            let archShort = r.name
                              .replace(/^建筑物精修\s·\s|^道路精修\s·\s|^水体精修\s·\s|^植被精修\s·\s|^农田精修\s·\s|^农田\/裸地精修\s·\s|^通用地物精修\s·\s/, '')
                              .replace(/\s\(ADE20K\)/g, '')
                              .replace(/\sADE20K/g, '')
                              .replace('AI 视觉边界精修 · ', '');
                            // GPT 推荐高亮
                            const isGptPicked = r.id === a.refiner_id;
                            return (
                              <Tooltip
                                key={r.id}
                                title={
                                  <div style={{ fontSize: 11, lineHeight: 1.6 }}>
                                    <div><b>{r.name}</b></div>
                                    {r.category && r.category !== 'any' && (
                                      <div style={{ marginTop: 4, color: '#74fabd' }}>
                                        🎯 专属类别：{cm.cn}（{r.category}）
                                      </div>
                                    )}
                                    {r.architecture && <div style={{ marginTop: 4 }}>🧬 {r.architecture}</div>}
                                    {r.hf_model && <div>⬇ {r.hf_model}</div>}
                                    {r.rich_prompt && <div>💬 {r.rich_prompt}</div>}
                                    {r.description && <div style={{ marginTop: 4, opacity: 0.8 }}>{r.description}</div>}
                                    {r.needs_download && (
                                      <div style={{ marginTop: 4, color: '#f0c040' }}>
                                        ⚠ 首次使用会下载预训练权重
                                      </div>
                                    )}
                                  </div>
                                }
                                placement="top"
                              >
                                <button
                                  onClick={() =>
                                    setActionRefiner((prev) => ({
                                      ...prev,
                                      [idx]: r.id,
                                    }))
                                  }
                                  disabled={isApplying}
                                  style={{
                                    padding: '4px 9px',
                                    fontSize: 10,
                                    background: active
                                      ? `linear-gradient(135deg, ${tierColor}33, rgba(5,50,106,0.4))`
                                      : 'rgba(5,50,106,0.5)',
                                    border: `1px solid ${active ? tierColor : isGptPicked ? 'rgba(116,250,189,0.45)' : 'rgba(116,247,253,0.15)'}`,
                                    borderRadius: 5,
                                    color: active ? tierColor : '#b9cfff',
                                    cursor: isApplying ? 'not-allowed' : 'pointer',
                                    fontFamily: "'DouyuFont', sans-serif",
                                    letterSpacing: 0.4,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    boxShadow: active ? `0 0 8px ${tierColor}66` : isGptPicked ? '0 0 6px rgba(116,250,189,0.35)' : 'none',
                                    transition: 'all 0.15s ease',
                                    position: 'relative',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 8,
                                      padding: '0 3px',
                                      borderRadius: 2,
                                      background: `${tierColor}33`,
                                      border: `1px solid ${tierColor}66`,
                                      color: tierColor,
                                    }}
                                  >
                                    T{r.tier}
                                  </span>
                                  <span style={{ fontSize: 11 }}>{cm.icon}</span>
                                  <span style={{ color: active ? tierColor : '#74fabd', fontWeight: 600 }}>
                                    {cm.cn}
                                  </span>
                                  <span style={{ opacity: 0.55 }}>·</span>
                                  <span>{archShort}</span>
                                  {r.needs_download && (
                                    <span style={{ color: '#f0c040', fontSize: 8 }}>⬇</span>
                                  )}
                                  <span
                                    style={{
                                      fontSize: 8,
                                      opacity: 0.7,
                                      marginLeft: 2,
                                    }}
                                  >
                                    {tierLabel}
                                  </span>
                                  {isGptPicked && (
                                    <span
                                      style={{
                                        position: 'absolute',
                                        top: -7,
                                        right: -7,
                                        background: 'linear-gradient(135deg,#74fabd,#00d4aa)',
                                        color: '#0a0a0f',
                                        fontSize: 8,
                                        fontWeight: 700,
                                        padding: '0 4px',
                                        borderRadius: 6,
                                        boxShadow: '0 0 6px rgba(116,250,189,0.6)',
                                      }}
                                    >
                                      GPT荐
                                    </span>
                                  )}
                                </button>
                              </Tooltip>
                            );
                          })}
                        </div>
                        {(() => {
                          const sel = refinersAll.find((r) => r.id === chosen);
                          if (!sel) return null;
                          const eta =
                            sel.inference_method === 'gpt_boundary'
                              ? '60–120 秒（GPT 视觉 + SAM3）'
                              : sel.needs_download
                              ? '首次 ~30s 下载 + 15–60 秒推理'
                              : sel.tier === 1
                              ? '10–30 秒（本地 SegEarth-OV-3 权重）'
                              : '10–60 秒';
                          return (
                            <div
                              style={{
                                marginTop: 6,
                                fontSize: 9,
                                color: 'rgba(185,207,255,0.5)',
                                fontFamily: "'SarasaMonoSC', monospace",
                              }}
                            >
                              ⏱ 预计耗时：{eta}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 80 }}>
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    loading={isApplying}
                    disabled={isApplied}
                    onClick={() => applyAction(a, idx)}
                    style={{ minWidth: 60 }}
                  >
                    {isApplied ? '已应用' : '应用'}
                  </Button>
                  {isApplying && applyProgress && (
                    <div style={{ width: 140 }}>
                      <Progress
                        percent={Math.round(applyProgress.progress)}
                        size="small"
                        status="active"
                        strokeColor="#74f7fd"
                        format={(p) => `${p}%`}
                      />
                      <div
                        style={{
                          fontSize: 9,
                          color: '#74f7fd',
                          marginTop: 2,
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={applyProgress.message}
                      >
                        {applyProgress.message || applyProgress.label}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 模型信息 */}
        <div
          style={{
            fontSize: 10,
            color: 'rgba(185,207,255,0.4)',
            fontStyle: 'italic',
            fontFamily: "'Source Serif 4', serif",
            textAlign: 'right',
          }}
        >
          Model: {report.model}
          {report.usage?.total_tokens && ` · ${report.usage.total_tokens} tokens`}
        </div>
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      width={720}
      destroyOnClose
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#74f7fd' }}>
          <RobotOutlined />
          <span style={{ fontFamily: "'DouyuFont', sans-serif", fontSize: 15 }}>
            AI 视觉智能诊断
          </span>
          <Tag
            style={{
              fontSize: 10,
              background: 'rgba(116,247,253,0.1)',
              border: '1px solid rgba(116,247,253,0.3)',
              color: '#74f7fd',
              fontFamily: "'Source Serif 4', serif",
              fontStyle: 'italic',
            }}
          >
            {report?.model ? `${report.model} Vision` : 'GPT-5 Vision'}
          </Tag>
        </div>
      }
    >
      <div style={{ paddingTop: 8, maxHeight: '78vh', overflowY: 'auto' }}>
        {renderLivePreview()}
        {renderPanel()}
      </div>
    </Modal>
  );
};

export default AIDiagnoseModal;
