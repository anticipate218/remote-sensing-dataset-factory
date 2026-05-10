/**
 * TasksPage v2 - 下游任务工作台（升级版）
 *
 * 升级：
 *  • 5 → 9 种任务（新增 建筑物提取 / 道路提取 / NDVI / 全色锐化）
 *  • 任务从「左侧垂直按钮」升级为「彩色卡片网格 + 头部图标 + 状态徽章」
 *  • 输入文件加「我的上传」picker（接入 /api/uploads，可挑历史文件 / AOI 捕获结果）
 *  • 任务结果加「进度时间轴」+ 多视图切换（NDVI 有 mask/overlay/colored 三视图）
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, Col, Row, Slider, Space, Tag, Typography, Upload, Modal, Empty,
  message, Image, Radio, Steps, Progress, Tooltip, Input, Popconfirm,
} from 'antd';
import {
  AimOutlined,
  CloudOutlined,
  EyeOutlined,
  FileImageOutlined,
  PlayCircleOutlined,
  SwapOutlined,
  ThunderboltOutlined,
  ZoomInOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  StarOutlined,
  ReloadOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  SearchOutlined,
  DeleteOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import BatchUploader, { UploadedFileInfo } from '../common/BatchUploader';
import WidgetPanel from '../MFLayout/WidgetPanel';
import PageHeader from '../common/PageHeader';

const { Text } = Typography;
const API_BASE = '/api';

interface TaskParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  description?: string;
}

interface TaskDef {
  id: string;
  name: string;
  desc: string;
  longDesc: string;
  icon: React.ReactNode;
  color: string;            // 主色
  gradient: string;         // 卡片渐变背景
  tag: string;              // 学术标签
  endpoint: string;
  resultEndpoint: string;
  params: TaskParam[];
  supportsBatch: boolean;
  needsTwoImages?: boolean;
  resultModes?: Array<{ key: string; label: string; query?: string }>;  // 多视图切换
}

const TASKS: TaskDef[] = [
  // === 检测 ===
  {
    id: 'object_detection',
    name: '目标检测',
    desc: 'YOLOv8s-OBB · DOTAv1 旋转检测',
    longDesc: '基于 YOLOv8s-OBB 的遥感旋转目标检测，支持飞机、舰船、车辆、桥梁等 15 类',
    icon: <AimOutlined />,
    color: '#ff6b35',
    gradient: 'linear-gradient(135deg, rgba(255,107,53,0.18), rgba(255,138,138,0.05))',
    tag: 'YOLOv8-OBB',
    endpoint: '/detect',
    resultEndpoint: '/detection/{tid}/result',
    params: [{ key: 'confidence', label: '置信度', min: 0.05, max: 0.95, step: 0.05, defaultValue: 0.25, description: '低于该值的检测框被丢弃' }],
    supportsBatch: true,
  },
  // === 提取 ===
  {
    id: 'building_extraction',
    name: '建筑物提取',
    desc: 'SAM3 PRISM-A · 语义分割',
    longDesc: '基于 SAM3 开放词汇语义分割，针对城区影像提取所有建筑物轮廓',
    icon: <HomeOutlined />,
    color: '#ff5757',
    gradient: 'linear-gradient(135deg, rgba(255,87,87,0.18), rgba(255,138,138,0.05))',
    tag: 'SAM3 / PRISM-A',
    endpoint: '/building-extraction',
    resultEndpoint: '/building/{tid}/result',
    params: [{ key: 'threshold', label: '置信度阈值', min: 0.1, max: 0.9, step: 0.05, defaultValue: 0.4, description: '阈值越高建筑物边界越严格' }],
    supportsBatch: false,
  },
  {
    id: 'road_extraction',
    name: '道路提取',
    desc: 'SAM3 PRISM-A · 线状目标',
    longDesc: '提取航拍影像中的道路网络，包含主干道、辅路、小径',
    icon: <EnvironmentOutlined />,
    color: '#ffd166',
    gradient: 'linear-gradient(135deg, rgba(255,209,102,0.18), rgba(255,209,102,0.04))',
    tag: 'SAM3 / Open-Vocab',
    endpoint: '/road-extraction',
    resultEndpoint: '/road/{tid}/result',
    params: [{ key: 'threshold', label: '置信度阈值', min: 0.1, max: 0.9, step: 0.05, defaultValue: 0.35 }],
    supportsBatch: false,
  },
  // === 增强 ===
  {
    id: 'super_resolution',
    name: '超分辨率',
    desc: 'TTST · IEEE TIP 2024',
    longDesc: '使用 TTST Transformer 提升遥感影像分辨率 2× / 4×，保留地物细节',
    icon: <ZoomInOutlined />,
    color: '#74fabd',
    gradient: 'linear-gradient(135deg, rgba(116,250,189,0.16), rgba(116,247,253,0.05))',
    tag: 'TTST',
    endpoint: '/super-resolution',
    resultEndpoint: '/sr/{tid}/result',
    params: [{ key: 'scale', label: '放大倍数', min: 2, max: 4, step: 1, defaultValue: 4 }],
    supportsBatch: true,
  },
  {
    id: 'pansharpen',
    name: '全色锐化',
    desc: 'Brovey 近似 · 高频注入',
    longDesc: '通过提取高频细节并注入到 RGB 影像，模拟全色锐化效果，提升观感锐度',
    icon: <StarOutlined />,
    color: '#a78bfa',
    gradient: 'linear-gradient(135deg, rgba(167,139,250,0.18), rgba(167,139,250,0.04))',
    tag: 'Pansharpen',
    endpoint: '/pansharpen',
    resultEndpoint: '/pansharpen/{tid}/result',
    params: [{ key: 'boost', label: '锐化强度', min: 0.5, max: 3.0, step: 0.1, defaultValue: 1.6 }],
    supportsBatch: true,
  },
  // === 大气校正 ===
  {
    id: 'dehaze',
    name: '去云去雾',
    desc: '暗通道先验 · DCP',
    longDesc: '基于 He 等人 CVPR 2009 暗通道先验，对薄雾、霾的影像做大气散射校正',
    icon: <CloudOutlined />,
    color: '#38bdf8',
    gradient: 'linear-gradient(135deg, rgba(56,189,248,0.18), rgba(56,189,248,0.04))',
    tag: 'DCP',
    endpoint: '/dehaze',
    resultEndpoint: '/dehaze/{tid}/result',
    params: [],
    supportsBatch: true,
  },
  // === 分析 ===
  {
    id: 'edge_detection',
    name: '边缘提取',
    desc: 'OpenCV Canny',
    longDesc: '双阈值 Canny 边缘检测，可绘制白色边缘 / 彩色叠加',
    icon: <EyeOutlined />,
    color: '#a855f7',
    gradient: 'linear-gradient(135deg, rgba(168,85,247,0.16), rgba(168,85,247,0.04))',
    tag: 'Canny',
    endpoint: '/edge-detection',
    resultEndpoint: '/edge/{tid}/result?overlay=true',
    params: [
      { key: 'low_threshold', label: '低阈值', min: 10, max: 200, step: 10, defaultValue: 50 },
      { key: 'high_threshold', label: '高阈值', min: 50, max: 300, step: 10, defaultValue: 150 },
    ],
    supportsBatch: true,
  },
  {
    id: 'ndvi_analysis',
    name: 'NDVI 植被分析',
    desc: '归一化植被指数 · 多光谱',
    longDesc: '计算 NDVI = (NIR-RED)/(NIR+RED)，自动着色并提取植被区域。支持 4 波段 GeoTIFF（含 NIR），3 波段 RGB 影像采用近似计算',
    icon: <ExperimentOutlined />,
    color: '#22c55e',
    gradient: 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(116,250,189,0.05))',
    tag: 'NDVI',
    endpoint: '/ndvi-analysis',
    resultEndpoint: '/ndvi/{tid}/result',
    params: [
      { key: 'threshold', label: '植被阈值', min: -0.5, max: 0.8, step: 0.05, defaultValue: 0.2, description: 'NDVI > 阈值 视为植被' },
    ],
    supportsBatch: false,
    resultModes: [
      { key: 'color', label: '着色 NDVI', query: 'mode=color' },
      { key: 'mask', label: '植被掩膜', query: 'mode=mask' },
      { key: 'overlay', label: '叠加原图', query: 'mode=overlay' },
    ],
  },
  // === 双时相 ===
  {
    id: 'change_detection',
    name: '变化检测',
    desc: '双时相像素级差分',
    longDesc: '上传两张同一区域的不同时间影像，自动配准+差分提取变化区域',
    icon: <SwapOutlined />,
    color: '#ec4899',
    gradient: 'linear-gradient(135deg, rgba(236,72,153,0.18), rgba(236,72,153,0.04))',
    tag: 'Change Detection',
    endpoint: '/change-detection',
    resultEndpoint: '/cd/{tid}/result',
    params: [{ key: 'threshold', label: '变化阈值', min: 10, max: 80, step: 5, defaultValue: 30 }],
    supportsBatch: false,
    needsTwoImages: true,
  },
];

// ===========================================================================
// 我的上传 - 文件选择器
// ===========================================================================
interface UploadItem {
  file_id: string;
  filename: string;
  uploaded_at: string;
  source: string;
  width: number;
  height: number;
  preview_url: string;
  site_name?: string | null;
}

const UploadsPicker: React.FC<{
  open: boolean;
  onCancel: () => void;
  onPick: (item: UploadItem) => void;
}> = ({ open, onCancel, onPick }) => {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'aoi_capture' | 'upload'>('all');
  const [search, setSearch] = useState('');
  // 多选模式：用于批量删除测试垃圾。默认 OFF（点缩略图直接选用）
  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const fetchUploads = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_BASE}/uploads`, { params: { limit: 500 } });
      setItems(r.data.items || []);
    } catch (e) {
      message.error('加载文件列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchUploads();
      setSearch('');
      setManageMode(false);
      setSelectedIds(new Set());
    }
  }, [open, fetchUploads]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (filter !== 'all') list = list.filter((x) => x.source === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((x) =>
        (x.filename || '').toLowerCase().includes(q) ||
        (x.site_name || '').toLowerCase().includes(q) ||
        x.file_id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, filter, search]);

  const allSelected = filteredItems.length > 0 && filteredItems.every((x) => selectedIds.has(x.file_id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        filteredItems.forEach((x) => next.delete(x.file_id));
        return next;
      }
      const next = new Set(prev);
      filteredItems.forEach((x) => next.add(x.file_id));
      return next;
    });
  };

  const doBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    let ok = 0; let fail = 0;
    // 顺序删除（每张体量很小，无并发必要；并发太高易触发后端文件锁）
    for (const id of Array.from(selectedIds)) {
      try {
        await axios.delete(`${API_BASE}/uploads/${id}`);
        ok++;
      } catch {
        fail++;
      }
    }
    setDeleting(false);
    setSelectedIds(new Set());
    if (fail === 0) message.success(`已删除 ${ok} 个文件`);
    else message.warning(`删除 ${ok} 成功，${fail} 失败`);
    fetchUploads();
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      width={820}
      title={
        <span style={{ color: '#fff', fontFamily: "'DouyuFont'", letterSpacing: 1 }}>
          <FolderOpenOutlined style={{ color: '#74f7fd', marginRight: 8 }} />
          我的上传 — 选择历史文件
        </span>
      }
      styles={{ body: { background: 'transparent', padding: '12px 0 0' } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <Radio.Group value={filter} onChange={(e) => setFilter(e.target.value)} size="small">
          <Radio.Button value="all">全部 ({items.length})</Radio.Button>
          <Radio.Button value="aoi_capture">AOI 捕获 ({items.filter((x) => x.source === 'aoi_capture').length})</Radio.Button>
          <Radio.Button value="upload">手动上传 ({items.filter((x) => x.source !== 'aoi_capture').length})</Radio.Button>
        </Radio.Group>
        <Space size={6}>
          <Input
            allowClear
            size="small"
            prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.4)' }} />}
            placeholder="按文件名 / ID 搜索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 200, background: 'rgba(0,0,0,0.25)' }}
          />
          <Button
            size="small"
            icon={manageMode ? <CloseOutlined /> : <DeleteOutlined />}
            danger={manageMode}
            onClick={() => { setManageMode(!manageMode); setSelectedIds(new Set()); }}
          >
            {manageMode ? '退出管理' : '管理'}
          </Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchUploads} loading={loading}>刷新</Button>
        </Space>
      </div>
      {manageMode && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', marginBottom: 10,
          background: 'rgba(255,77,79,0.08)', border: '1px solid rgba(255,77,79,0.25)', borderRadius: 6,
        }}>
          <Button size="small" onClick={toggleSelectAll}>{allSelected ? '取消全选' : '当前页全选'}</Button>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
            已选 <b style={{ color: '#ff7875' }}>{selectedIds.size}</b> 个文件
          </Text>
          <Popconfirm
            title="确认删除？"
            description={`将永久删除选中的 ${selectedIds.size} 个文件，此操作不可恢复`}
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            disabled={selectedIds.size === 0}
            onConfirm={doBatchDelete}
          >
            <Button size="small" danger icon={<DeleteOutlined />} disabled={selectedIds.size === 0} loading={deleting}>
              删除选中
            </Button>
          </Popconfirm>
        </div>
      )}
      {filteredItems.length === 0 ? (
        <Empty description={<span style={{ color: 'rgba(255,255,255,0.4)' }}>没有可用文件</span>} style={{ padding: 40 }} />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 12,
          maxHeight: 460,
          overflowY: 'auto',
          padding: 4,
        }}>
          {filteredItems.map((it) => {
            const isSelected = selectedIds.has(it.file_id);
            const handleActivate = () => {
              if (manageMode) {
                toggleSelect(it.file_id);
              } else {
                onPick(it);
                onCancel();
              }
            };
            return (
              <div
                key={it.file_id}
                role="button"
                aria-label={manageMode ? `${isSelected ? '取消选中' : '选中'}: ${it.site_name || it.filename}` : `选择文件: ${it.site_name || it.filename}`}
                tabIndex={0}
                onClick={handleActivate}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleActivate(); } }}
                style={{
                  background: isSelected ? 'rgba(255,77,79,0.12)' : 'rgba(116,247,253,0.04)',
                  border: `1px solid ${isSelected ? 'rgba(255,77,79,0.6)' : 'rgba(116,247,253,0.15)'}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.18s',
                  overflow: 'hidden',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  if (isSelected) return;
                  e.currentTarget.style.borderColor = manageMode ? 'rgba(255,77,79,0.4)' : 'rgba(116,247,253,0.55)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = manageMode ? '0 4px 14px rgba(255,77,79,0.15)' : '0 4px 14px rgba(116,247,253,0.18)';
                }}
                onMouseLeave={(e) => {
                  if (isSelected) return;
                  e.currentTarget.style.borderColor = 'rgba(116,247,253,0.15)';
                  e.currentTarget.style.transform = '';
                  e.currentTarget.style.boxShadow = '';
                }}
              >
                <div style={{ position: 'relative' }}>
                  <img
                    src={it.preview_url}
                    alt={it.filename}
                    style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block', background: '#000' }}
                  />
                  {it.source === 'aoi_capture' && (
                    <Tag color="cyan" style={{ position: 'absolute', top: 4, left: 4, fontSize: 9, margin: 0 }}>
                      AOI
                    </Tag>
                  )}
                  {manageMode && (
                    <div
                      aria-hidden
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        width: 18, height: 18, borderRadius: 4,
                        background: isSelected ? '#ff4d4f' : 'rgba(0,0,0,0.55)',
                        border: '1px solid rgba(255,255,255,0.6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 12, fontWeight: 700,
                        boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                      }}
                    >
                      {isSelected ? '✓' : ''}
                    </div>
                  )}
                </div>
                <div style={{ padding: '6px 8px', fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.site_name || it.filename}
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    {it.width} × {it.height}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
};

// ===========================================================================
// 主页面
// ===========================================================================
const TasksPage: React.FC = () => {
  const [selectedTaskId, setSelectedTaskId] = useState<string>('object_detection');
  const [uploadMode, setUploadMode] = useState<'single' | 'batch'>('single');
  const [fileId, setFileId] = useState<string | null>(null);
  const [fileId2, setFileId2] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewUrl2, setPreviewUrl2] = useState<string>('');
  const [batchFiles, setBatchFiles] = useState<UploadedFileInfo[]>([]);
  const [processing, setProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState('');
  const [resultViewMode, setResultViewMode] = useState<string>('color');
  const [batchResults, setBatchResults] = useState<Array<{ file: string; status: string; resultUrl?: string; elapsedMs?: number; startedAt?: number }>>([]);
  const [batchStartedAt, setBatchStartedAt] = useState<number>(0);
  const [batchElapsedMs, setBatchElapsedMs] = useState<number>(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSecond, setPickerSecond] = useState(false);  // 第二张时相
  const [progressInfo, setProgressInfo] = useState<{ progress: number; message: string }>({ progress: 0, message: '' });
  const [resultMeta, setResultMeta] = useState<any>(null);

  const selectedTask = TASKS.find((t) => t.id === selectedTaskId)!;
  const [paramValues, setParamValues] = useState<Record<string, number>>(() => {
    const x: Record<string, number> = {};
    selectedTask.params.forEach((p) => (x[p.key] = p.defaultValue));
    return x;
  });

  const onTaskChange = (id: string) => {
    setSelectedTaskId(id);
    const t = TASKS.find((x) => x.id === id)!;
    const next: Record<string, number> = {};
    t.params.forEach((p) => (next[p.key] = p.defaultValue));
    setParamValues(next);
    setResultUrl('');
    setBatchResults([]);
    setResultMeta(null);
    setResultViewMode(t.resultModes?.[0]?.key || 'color');
    if (t.needsTwoImages || !t.supportsBatch) setUploadMode('single');
  };

  const handleSingleUpload = useCallback(async (f: File, second = false) => {
    const formData = new FormData();
    formData.append('file', f);
    try {
      const res = await axios.post(`${API_BASE}/upload`, formData);
      const fid = res.data.file_id || res.data.task_id;
      const rawUrl = res.data.preview_url;
      const purl = rawUrl
        ? (rawUrl.startsWith('/api') ? rawUrl : `${API_BASE}${rawUrl}`)
        : `${API_BASE}/preview/${fid}`;
      if (second) {
        setFileId2(fid);
        setPreviewUrl2(purl);
      } else {
        setFileId(fid);
        setPreviewUrl(purl);
      }
      message.success(`已上传: ${res.data.filename}`);
    } catch {
      message.error('上传失败');
    }
    return false;
  }, []);

  const handlePickFromUploads = (item: UploadItem) => {
    if (pickerSecond) {
      setFileId2(item.file_id);
      setPreviewUrl2(item.preview_url);
    } else {
      setFileId(item.file_id);
      setPreviewUrl(item.preview_url);
      setBatchFiles([]);
    }
    message.success(`已选择: ${item.site_name || item.filename}`);
  };

  const runSingleTask = async () => {
    if (!fileId) {
      message.warning('请先上传或选择图像');
      return;
    }
    if (selectedTask.needsTwoImages && !fileId2) {
      message.warning('该任务需要两张图像');
      return;
    }

    const body =
      selectedTask.needsTwoImages
        ? { file_id_1: fileId, file_id_2: fileId2, ...paramValues }
        : { file_id: fileId, ...paramValues };

    const createResp = await axios.post(`${API_BASE}${selectedTask.endpoint}`, body);
    const taskId = createResp.data.task_id;

    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const status = await axios.get(`${API_BASE}/tasks/${taskId}`);
      setProgressInfo({
        progress: status.data.progress || 0,
        message: status.data.message || '处理中...',
      });
      if (status.data.status === 'completed') {
        const baseUrl = `${API_BASE}${selectedTask.resultEndpoint.replace('{tid}', taskId)}`;
        // 拼上 view mode 的 query param（NDVI 等多视图任务）
        const finalUrl = selectedTask.resultModes
          ? `${baseUrl}?${selectedTask.resultModes.find((m) => m.key === resultViewMode)?.query || ''}`
          : baseUrl;
        setResultUrl(finalUrl);
        setResultMeta({ ...status.data.result, _taskId: taskId });
        message.success('任务完成');
        return;
      }
      if (status.data.status === 'failed') {
        throw new Error(status.data.message || '任务失败');
      }
    }
    throw new Error('任务超时');
  };

  const runBatchTask = async () => {
    if (!batchFiles.length) {
      message.warning('请先上传批量图像');
      return;
    }
    const startedAt = Date.now();
    setBatchStartedAt(startedAt);
    setBatchElapsedMs(0);

    // 一次性提交：后端会为每个文件并行 spawn task
    const resp = await axios.post(`${API_BASE}/batch-task`, {
      file_ids: batchFiles.map((f) => f.file_id),
      task_type: selectedTaskId,
      params: paramValues,
    });

    const taskItems: Array<{ file_id: string; task_id: string }> = resp.data.task_items || [];
    const taskMap = new Map(taskItems.map((x) => [x.file_id, x.task_id]));

    const localResults = batchFiles.map((f) => ({
      file: f.filename,
      status: taskMap.has(f.file_id) ? 'processing' : 'failed',
      resultUrl: '',
      startedAt: Date.now(),
      elapsedMs: 0,
    }));
    setBatchResults(localResults);

    // 用计时器实时更新整体已用时间
    const elapsedTimer = setInterval(() => {
      setBatchElapsedMs(Date.now() - startedAt);
    }, 200);

    // 并行轮询：每轮 Promise.all 并行查询所有未完成任务的状态
    for (let round = 0; round < 240; round++) {
      await new Promise((r) => setTimeout(r, 800));

      const pendingIndices: number[] = [];
      const pendingTids: string[] = [];
      for (let i = 0; i < batchFiles.length; i++) {
        if (localResults[i].status === 'completed' || localResults[i].status === 'failed') continue;
        const tid = taskMap.get(batchFiles[i].file_id);
        if (!tid) {
          localResults[i].status = 'failed';
          continue;
        }
        pendingIndices.push(i);
        pendingTids.push(tid);
      }

      if (pendingIndices.length === 0) break;

      // 关键改进：同时查询所有 pending 任务，而不是串行
      const statuses = await Promise.all(
        pendingTids.map((tid) =>
          axios.get(`${API_BASE}/tasks/${tid}`).then((r) => r.data).catch(() => ({ status: 'failed' })),
        ),
      );

      statuses.forEach((s, k) => {
        const i = pendingIndices[k];
        const tid = pendingTids[k];
        if (s.status === 'completed') {
          localResults[i].status = 'completed';
          localResults[i].resultUrl = `${API_BASE}${selectedTask.resultEndpoint.replace('{tid}', tid)}`;
          localResults[i].elapsedMs = Date.now() - localResults[i].startedAt;
        } else if (s.status === 'failed') {
          localResults[i].status = 'failed';
          localResults[i].elapsedMs = Date.now() - localResults[i].startedAt;
        }
      });

      setBatchResults([...localResults]);
    }

    clearInterval(elapsedTimer);
    setBatchElapsedMs(Date.now() - startedAt);

    const ok = localResults.filter((x) => x.status === 'completed').length;
    const failed = localResults.length - ok;
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (failed > 0) {
      message.warning(`批量处理完成: ${ok}/${localResults.length} 成功，${failed} 失败 · 用时 ${elapsedSec}s（后端并行）`);
    } else {
      message.success(`批量处理完成: ${ok}/${localResults.length} · 用时 ${elapsedSec}s（后端并行）`);
    }
  };

  const execute = async () => {
    try {
      setProcessing(true);
      setResultUrl('');
      setResultMeta(null);
      setProgressInfo({ progress: 0, message: '提交任务...' });
      if (uploadMode === 'batch' && !selectedTask.needsTwoImages) {
        await runBatchTask();
      } else {
        await runSingleTask();
      }
    } catch (e: any) {
      message.error(e?.message || e?.response?.data?.detail || '执行失败');
    } finally {
      setProcessing(false);
    }
  };

  // 切换 NDVI 等任务的视图
  const switchResultView = (mode: string) => {
    setResultViewMode(mode);
    if (resultMeta?._taskId && selectedTask.resultModes) {
      const m = selectedTask.resultModes.find((x) => x.key === mode);
      if (m) {
        setResultUrl(`${API_BASE}${selectedTask.resultEndpoint.replace('{tid}', resultMeta._taskId)}?${m.query || ''}`);
      }
    }
  };

  // 时间轴数据
  const taskSteps = useMemo(() => {
    const baseSteps = [
      { title: '加载图像', percent: 20 },
      { title: '模型推理', percent: 50 },
      { title: '生成结果', percent: 85 },
      { title: '完成', percent: 100 },
    ];
    return baseSteps;
  }, []);

  const currentStep = useMemo(() => {
    const p = progressInfo.progress;
    if (p >= 100) return 4;
    if (p >= 85) return 3;
    if (p >= 50) return 2;
    if (p >= 20) return 1;
    if (p > 0) return 0;
    return -1;
  }, [progressInfo.progress]);

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 0', fontFamily: "'SarasaMonoSC', monospace" }}>
      <PageHeader
        theme="tasks"
        title="下游任务工作台"
        subtitle="Detection · Extraction · Super-Res · Pansharpen · Dehaze · Edge · NDVI · Change-Detect"
        iconClass="fa-solid fa-rocket"
        decoration="neural"
      />

      <Row gutter={16}>
        {/* 左侧：任务卡片网格 */}
        <Col span={9}>
          <WidgetPanel title={`任务库 · ${TASKS.length} 种`}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 10,
            }}>
              {TASKS.map((t) => {
                const active = t.id === selectedTaskId;
                return (
                  <Tooltip
                    key={t.id}
                    title={t.longDesc}
                    placement="top"
                    color="rgba(2, 14, 31, 0.95)"
                  >
                    <div
                      role="button"
                      aria-label={`选择任务: ${t.name}`}
                      tabIndex={0}
                      onClick={() => onTaskChange(t.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onTaskChange(t.id); }}
                      style={{
                        position: 'relative',
                        background: active ? t.gradient : 'rgba(255,255,255,0.025)',
                        border: `1px solid ${active ? t.color : 'rgba(255,255,255,0.06)'}`,
                        borderRadius: 10,
                        padding: '12px 10px 10px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: active ? `0 0 16px ${t.color}33` : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = 'rgba(116,247,253,0.05)';
                          e.currentTarget.style.borderColor = 'rgba(116,247,253,0.25)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.025)';
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                        }
                      }}
                    >
                      <div style={{
                        fontSize: 22,
                        color: t.color,
                        marginBottom: 6,
                      }}>
                        {t.icon}
                      </div>
                      <div style={{
                        fontSize: 12,
                        color: '#fff',
                        fontWeight: 600,
                        fontFamily: "'DouyuFont', sans-serif",
                        marginBottom: 3,
                      }}>
                        {t.name}
                      </div>
                      <div style={{
                        fontSize: 9,
                        color: active ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.4)',
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: 2,
                      }}>
                        {t.desc}
                      </div>
                      {active && (
                        <div style={{ position: 'absolute', top: 6, right: 6 }}>
                          <CheckCircleFilled style={{ color: t.color, fontSize: 14 }} />
                        </div>
                      )}
                    </div>
                  </Tooltip>
                );
              })}
            </div>
          </WidgetPanel>
        </Col>

        {/* 右侧：配置 + 结果 */}
        <Col span={15}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* 配置面板 */}
            <WidgetPanel title="任务配置" bodyStyle={{ overflow: 'visible' }}>
              <div style={{
                marginBottom: 14,
                padding: '10px 14px',
                borderRadius: 8,
                background: selectedTask.gradient,
                border: `1px solid ${selectedTask.color}55`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ color: selectedTask.color, fontSize: 18 }}>{selectedTask.icon}</span>
                  <span style={{ color: '#fff', fontFamily: "'DouyuFont', sans-serif", fontSize: 14 }}>
                    {selectedTask.name}
                  </span>
                  <Tag color="cyan" style={{ marginLeft: 'auto' }}>{selectedTask.tag}</Tag>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, lineHeight: 1.5 }}>
                  {selectedTask.longDesc}
                </div>
              </div>

              {/* 输入区：文件上传 + 我的上传 picker */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 1 }}>输入图像</Text>
                <Button
                  size="small"
                  icon={<FolderOpenOutlined />}
                  onClick={() => { setPickerSecond(false); setPickerOpen(true); }}
                  style={{ background: 'rgba(116,247,253,0.08)', borderColor: 'rgba(116,247,253,0.3)', color: '#74f7fd' }}
                >
                  我的上传
                </Button>
              </div>

              <BatchUploader
                mode={uploadMode}
                onModeChange={setUploadMode}
                onFileUploaded={(f) => {
                  setFileId(f.file_id);
                  setPreviewUrl(f.preview_url || '');
                  setBatchFiles([]);
                }}
                onBatchUploaded={(files) => {
                  setBatchFiles(files);
                  setFileId(files[0]?.file_id || null);
                }}
                compact
              />

              {selectedTask.needsTwoImages && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 1 }}>第二时相图像</Text>
                    <Button
                      size="small"
                      icon={<FolderOpenOutlined />}
                      onClick={() => { setPickerSecond(true); setPickerOpen(true); }}
                      style={{ background: 'rgba(116,247,253,0.08)', borderColor: 'rgba(116,247,253,0.3)', color: '#74f7fd' }}
                    >
                      我的上传
                    </Button>
                  </div>
                  <Upload.Dragger showUploadList={false} beforeUpload={(f) => handleSingleUpload(f, true)}>
                    <p style={{ color: '#fff' }}><FileImageOutlined /> 上传第二时相图像</p>
                  </Upload.Dragger>
                </div>
              )}

              {!!selectedTask.params.length && (
                <div style={{ marginTop: 16 }}>
                  {selectedTask.params.map((p) => (
                    <div key={p.key} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text style={{ color: '#fff' }}>{p.label}</Text>
                        <Text style={{ color: selectedTask.color, fontFamily: "'DincorosBlack'", fontSize: 13 }}>
                          {paramValues[p.key]}
                        </Text>
                      </div>
                      <Slider
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        value={paramValues[p.key]}
                        onChange={(v) => setParamValues((prev) => ({ ...prev, [p.key]: Number(v) }))}
                      />
                      {p.description && (
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: -4, fontStyle: 'italic' }}>
                          {p.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={execute}
                loading={processing}
                size="large"
                block
                style={{
                  marginTop: 12,
                  background: `linear-gradient(135deg, ${selectedTask.color}, ${selectedTask.color}AA)`,
                  border: 'none',
                  height: 40,
                  fontFamily: "'DouyuFont', sans-serif",
                  letterSpacing: 1.5,
                }}
              >
                开始执行 {selectedTask.name}
              </Button>

              {/* 进度时间轴 */}
              {processing && (
                <div style={{ marginTop: 16, padding: 14, background: 'rgba(116,247,253,0.04)', border: '1px solid rgba(116,247,253,0.15)', borderRadius: 8 }}>
                  <Steps
                    current={currentStep}
                    size="small"
                    items={taskSteps.map((s) => ({
                      title: <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{s.title}</span>,
                      icon: currentStep < 0 ? <ClockCircleOutlined /> : undefined,
                    }))}
                  />
                  <Progress
                    percent={Math.round(progressInfo.progress)}
                    strokeColor={{ from: selectedTask.color, to: '#74f7fd' }}
                    style={{ marginTop: 10 }}
                    size="small"
                  />
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 4, fontFamily: "'SarasaMonoSC', monospace" }}>
                    {progressInfo.message}
                  </div>
                </div>
              )}

              {/* 输入图像预览 */}
              {previewUrl && (
                <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: 'rgba(116,247,253,0.03)', border: '1px solid rgba(116,247,253,0.1)' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 6, display: 'block' }}>
                    输入图像预览
                  </Text>
                  <Image src={previewUrl} alt="input"
                    style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, objectFit: 'contain' }}
                    preview={{ mask: '点击放大' }} />
                </div>
              )}
              {previewUrl2 && (
                <div style={{ marginTop: 8, padding: 12, borderRadius: 10, background: 'rgba(91,199,250,0.03)', border: '1px solid rgba(91,199,250,0.1)' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 6, display: 'block' }}>时相2 预览</Text>
                  <Image src={previewUrl2} alt="input2"
                    style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, objectFit: 'contain' }}
                    preview={{ mask: '点击放大' }} />
                </div>
              )}
            </WidgetPanel>

            {/* 结果面板 */}
            <WidgetPanel title="任务结果" bodyStyle={{ overflow: 'auto' }}>
              {!resultUrl && batchResults.length === 0 && (
                <Empty
                  description={<span style={{ color: 'rgba(255,255,255,0.45)' }}>尚无任务结果，完成一次任务后将在此展示</span>}
                  imageStyle={{ filter: 'grayscale(1) opacity(0.4)' }}
                />
              )}

              {/* 单图结果 */}
              {resultUrl && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <Tag color="green" icon={<CheckCircleFilled />}>处理完成</Tag>
                    {resultMeta?.target_ratio !== undefined && (
                      <Tag color="cyan">目标占比 {resultMeta.target_ratio}%</Tag>
                    )}
                    {resultMeta?.veg_ratio !== undefined && (
                      <Tag color="green">植被覆盖 {resultMeta.veg_ratio}%</Tag>
                    )}
                    {resultMeta?.ndvi_mean !== undefined && (
                      <Tag color="blue">NDVI 均值 {resultMeta.ndvi_mean}</Tag>
                    )}
                    {resultMeta?.sharpness_ratio !== undefined && (
                      <Tag color="purple">锐度 ×{resultMeta.sharpness_ratio}</Tag>
                    )}
                    {resultMeta?.change_ratio !== undefined && (
                      <Tag color="magenta">变化 {resultMeta.change_ratio}%</Tag>
                    )}
                    <Button size="small" icon={<DownloadOutlined />}
                      onClick={() => { const a = document.createElement('a'); a.href = resultUrl; a.download = `${selectedTask.id}_result.png`; a.click(); }}>
                      下载结果
                    </Button>
                  </div>

                  {/* NDVI 等多视图任务的视图切换 */}
                  {selectedTask.resultModes && (
                    <div style={{ marginBottom: 10 }}>
                      <Radio.Group value={resultViewMode} onChange={(e) => switchResultView(e.target.value)} size="small">
                        {selectedTask.resultModes.map((m) => (
                          <Radio.Button key={m.key} value={m.key}>{m.label}</Radio.Button>
                        ))}
                      </Radio.Group>
                    </div>
                  )}

                  <Row gutter={12}>
                    {previewUrl && (
                      <Col span={12}>
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, display: 'block', marginBottom: 4 }}>原图</Text>
                        <Image src={previewUrl} alt="input"
                          style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}
                          preview={{ mask: '放大' }} />
                      </Col>
                    )}
                    <Col span={previewUrl ? 12 : 24}>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, display: 'block', marginBottom: 4 }}>结果</Text>
                      <Image src={resultUrl} alt="result"
                        style={{ width: '100%', borderRadius: 8, border: `1px solid ${selectedTask.color}55` }}
                        preview={{ mask: '放大' }} />
                    </Col>
                  </Row>
                </div>
              )}

              {/* 批量结果画廊 + 总体进度 */}
              {batchResults.length > 0 && (
                <div style={{ marginTop: resultUrl ? 16 : 0 }}>
                  {(() => {
                    const total = batchResults.length;
                    const ok = batchResults.filter(r => r.status === 'completed').length;
                    const failed = batchResults.filter(r => r.status === 'failed').length;
                    const running = batchResults.filter(r => r.status === 'processing').length;
                    const done = ok + failed;
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                    const allDone = done === total;
                    const elapsedSec = (batchElapsedMs / 1000).toFixed(1);
                    return (
                      <div style={{
                        marginBottom: 12, padding: 12,
                        background: allDone
                          ? 'linear-gradient(90deg, rgba(116,250,189,0.08), rgba(116,247,253,0.04))'
                          : 'linear-gradient(90deg, rgba(116,247,253,0.08), rgba(91,199,250,0.04))',
                        border: `1px solid ${allDone ? 'rgba(116,250,189,0.35)' : 'rgba(116,247,253,0.3)'}`,
                        borderRadius: 10,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                          <ThunderboltOutlined style={{ color: allDone ? '#74fabd' : '#74f7fd' }} />
                          <Text strong style={{ color: '#fff', fontFamily: "'SarasaMonoSC', monospace", fontSize: 13 }}>
                            {allDone ? '✓ 批量任务全部完成' : '后端并行处理中…'}
                          </Text>
                          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
                            {ok > 0 && <Tag color="green">✓ {ok}</Tag>}
                            {failed > 0 && <Tag color="red">✗ {failed}</Tag>}
                            {running > 0 && <Tag color="cyan"><ThunderboltOutlined spin /> {running}</Tag>}
                            <Tag color="default">{elapsedSec}s</Tag>
                          </span>
                        </div>
                        <Progress percent={pct} size="small"
                          status={failed > 0 ? 'exception' : (allDone ? 'success' : 'active')}
                          strokeColor={{ '0%': '#74f7fd', '100%': '#74fabd' }}
                          format={(p) => `${done}/${total} (${p}%)`}
                        />
                      </div>
                    );
                  })()}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginTop: 8 }}>
                    {batchResults.map((r) => (
                      <div key={r.file} style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: r.status === 'completed' ? '1px solid rgba(116,250,189,0.35)'
                              : r.status === 'failed' ? '1px solid rgba(255,77,79,0.35)'
                              : '1px solid rgba(116,247,253,0.18)',
                        borderRadius: 10, overflow: 'hidden', textAlign: 'center',
                      }}>
                        {r.resultUrl ? (
                          <Image src={r.resultUrl} alt={r.file}
                            style={{ width: '100%', height: 110, objectFit: 'cover' }}
                            preview={{ mask: '放大' }} />
                        ) : (
                          <div style={{ height: 110, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                            {r.status === 'processing' ? (
                              <>
                                <ThunderboltOutlined spin style={{ fontSize: 18, color: '#74f7fd' }} />
                                <span>处理中…</span>
                              </>
                            ) : r.status === 'failed' ? (
                              <>
                                <span style={{ fontSize: 18 }}>✗</span>
                                <span>失败</span>
                              </>
                            ) : '等待'}
                          </div>
                        )}
                        <div style={{ padding: '6px 8px', fontSize: 10, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.file}
                          <Tag color={r.status === 'completed' ? 'green' : r.status === 'failed' ? 'red' : 'blue'}
                            style={{ marginLeft: 4, fontSize: 9 }}>{r.status}</Tag>
                          {r.elapsedMs ? (
                            <Tag color="default" style={{ marginLeft: 2, fontSize: 9 }}>{(r.elapsedMs / 1000).toFixed(1)}s</Tag>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </WidgetPanel>
          </Space>
        </Col>
      </Row>

      <UploadsPicker
        open={pickerOpen}
        onCancel={() => setPickerOpen(false)}
        onPick={handlePickFromUploads}
      />
    </div>
  );
};

export default TasksPage;
