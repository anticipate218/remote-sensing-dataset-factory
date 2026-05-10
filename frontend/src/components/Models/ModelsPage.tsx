/**
 * ModelsPage - 模型管理页（重构版）
 * 
 * 三个 Tab：
 *   1. 预训练模型库   - 内置 + HF SOTA 模型，可下载/卸载
 *   2. 我的模型       - 用户上传的 SAM3 兼容权重
 *   3. 模型对比       - 在同一张图 + 同一个类别上跑多个模型
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, Empty, message, Popconfirm, Progress, Space, Table, Tabs, Tag, Tooltip, Upload,
  Select, Input, Row, Col, Spin, Slider,
} from 'antd';
import {
  CheckCircleOutlined, CloudDownloadOutlined, DeleteOutlined,
  InboxOutlined, ThunderboltOutlined, ExperimentOutlined,
  CloudOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import WidgetPanel from '../MFLayout/WidgetPanel';
import PageHeader from '../common/PageHeader';

const API_BASE = '/api';
const bodyFont = "'SarasaMonoSC', 'Noto Sans SC', monospace";
const titleFont = "'DouyuFont', sans-serif";

// ====================================================================
// 类型
// ====================================================================
interface PretrainedModel {
  id: string;
  display_name: string;
  family: string;
  architecture: string;
  backbone: string;
  params: string;
  train_dataset: string;
  miou_or_metric: string;
  paper: string;
  hf_repo: string | null;
  tasks: string[];
  tags: string[];
  description: string;
  needs_download: boolean;
  approx_size_mb: number;
  downloaded: boolean;
  actual_size_mb: number;
}

interface UserModel {
  model_id: string;
  display_name: string;
  type: 'builtin' | 'user';
  status: string;
  file_size: number;
  uploaded_at?: string;
}

interface UploadedFile {
  file_id: string;
  filename: string;
}

interface CompareResult {
  model_id: string;
  display_name?: string;
  mask_url?: string;
  stats?: {
    fg_pixels: number;
    fg_ratio: number;
    elapsed_sec: number;
  };
  info?: any;
  status: 'ok' | 'failed';
  error?: string;
}

// ====================================================================
// 顶层组件
// ====================================================================
const ModelsPage: React.FC = () => {
  // 概览统计（用于 PageHeader 右侧 meta）
  const [overviewStats, setOverviewStats] = useState({ pretrained: 0, downloaded: 0, user: 0 });

  const refreshOverview = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        axios.get(`${API_BASE}/models/pretrained`),
        axios.get(`${API_BASE}/models`),
      ]);
      const pretrained = (a.data?.models || []) as PretrainedModel[];
      const allModels = (b.data?.models || []) as UserModel[];
      const userOnly = allModels.filter((m) => m.type === 'user');
      setOverviewStats({
        pretrained: pretrained.length,
        downloaded: pretrained.filter((p) => p.downloaded).length,
        user: userOnly.length,
      });
    } catch {/* silent */}
  }, []);

  useEffect(() => { refreshOverview(); }, [refreshOverview]);

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 0' }}>
      <PageHeader
        theme="models"
        title="模型管理"
        subtitle="Pre-trained Library · User Uploads · Cross-Model Comparison"
        iconClass="fa-solid fa-cubes"
        decoration="chip"
        meta={
          <Space size={8}>
            <StatChip label="预训练" value={overviewStats.pretrained} color="#a78bfa" />
            <StatChip label="已下载" value={overviewStats.downloaded} color="#74fabd" />
            <StatChip label="自定义" value={overviewStats.user} color="#5bc7fa" />
          </Space>
        }
      />

      <Tabs
        defaultActiveKey="pretrained"
        size="large"
        items={[
          {
            key: 'pretrained',
            label: <span style={{ fontFamily: titleFont, letterSpacing: 1 }}><CloudOutlined /> 预训练模型库</span>,
            children: <PretrainedLibraryTab onChange={refreshOverview} />,
          },
          {
            key: 'user',
            label: <span style={{ fontFamily: titleFont, letterSpacing: 1 }}><AppstoreOutlined /> 我的模型</span>,
            children: <UserModelsTab onChange={refreshOverview} />,
          },
          {
            key: 'compare',
            label: <span style={{ fontFamily: titleFont, letterSpacing: 1 }}><ExperimentOutlined /> 模型对比</span>,
            children: <CompareTab />,
          },
        ]}
      />
    </div>
  );
};

const StatChip: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div
    style={{
      padding: '4px 12px',
      borderRadius: 16,
      background: `${color}1f`,
      border: `1px solid ${color}66`,
      fontFamily: bodyFont,
      fontSize: 11,
      color,
      display: 'flex',
      alignItems: 'baseline',
      gap: 6,
    }}
  >
    <span style={{ opacity: 0.7 }}>{label}</span>
    <span style={{ fontFamily: "'DincorosBlack'", fontSize: 14 }}>{value}</span>
  </div>
);

// ====================================================================
// Tab 1: 预训练模型库
// ====================================================================
const PretrainedLibraryTab: React.FC<{ onChange: () => void }> = ({ onChange }) => {
  const [models, setModels] = useState<PretrainedModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_BASE}/models/pretrained`);
      setModels(r.data.models || []);
    } catch {
      message.error('加载预训练模型库失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    const hide = message.loading('正在下载模型权重，请稍候...', 0);
    try {
      const r = await axios.post(`${API_BASE}/models/pretrained/${id}/download`, {}, { timeout: 600000 });
      hide();
      message.success(r.data.message || '下载完成');
      fetchList();
      onChange();
    } catch (e: any) {
      hide();
      message.error(e?.response?.data?.detail || '下载失败');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await axios.delete(`${API_BASE}/models/pretrained/${id}/cache`);
      message.success('缓存已清除');
      fetchList();
      onChange();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '清除失败');
    }
  };

  const familyColor: Record<string, string> = {
    sam: '#74f7fd',
    mask2former: '#a78bfa',
    segformer: '#5bc7fa',
    oneformer: '#f97316',
    upernet: '#74fabd',
    dinov2: '#f0c040',
    remote_clip: '#ff8a8a',
  };

  if (loading) return <Spin />;

  return (
    <Row gutter={[16, 16]}>
      {models.map((m) => {
        const fc = familyColor[m.family] || '#74f7fd';
        const isDl = downloadingId === m.id;
        return (
          <Col xs={24} sm={12} lg={8} key={m.id}>
            <div
              style={{
                padding: 16,
                background: `linear-gradient(135deg, ${fc}11, rgba(5,50,106,0.5))`,
                border: `1px solid ${fc}33`,
                borderRadius: 12,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                transition: 'all 0.2s',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* 主题色 stripe */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: `linear-gradient(90deg, ${fc}, transparent)`,
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: `${fc}22`,
                    border: `1px solid ${fc}55`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <i className="fa-solid fa-microchip" style={{ color: fc, fontSize: 18 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontFamily: titleFont, fontSize: 13, lineHeight: 1.3 }}>
                    {m.display_name}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(185,207,255,0.55)', fontFamily: bodyFont }}>
                    {m.backbone} · {m.params}
                  </div>
                </div>
                {m.downloaded ? (
                  <Tag
                    icon={<CheckCircleOutlined />}
                    style={{
                      fontSize: 10,
                      background: 'rgba(116,250,189,0.15)',
                      color: '#74fabd',
                      border: '1px solid rgba(116,250,189,0.4)',
                    }}
                  >
                    已就绪
                  </Tag>
                ) : (
                  <Tag
                    style={{
                      fontSize: 10,
                      background: 'rgba(240,192,64,0.12)',
                      color: '#f0c040',
                      border: '1px solid rgba(240,192,64,0.4)',
                    }}
                  >
                    未下载
                  </Tag>
                )}
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(185,207,255,0.7)',
                  fontFamily: "'Source Han Serif SC', serif",
                  fontStyle: 'italic',
                  lineHeight: 1.5,
                  flex: 1,
                }}
              >
                {m.description}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {m.tags.slice(0, 4).map((t) => (
                  <Tag
                    key={t}
                    style={{
                      fontSize: 9,
                      padding: '0 5px',
                      lineHeight: '14px',
                      background: 'rgba(116,247,253,0.08)',
                      color: 'rgba(116,247,253,0.7)',
                      border: '1px solid rgba(116,247,253,0.18)',
                    }}
                  >
                    {t}
                  </Tag>
                ))}
              </div>

              <div
                style={{
                  fontSize: 10,
                  color: 'rgba(185,207,255,0.55)',
                  fontFamily: bodyFont,
                  borderTop: '1px solid rgba(116,247,253,0.1)',
                  paddingTop: 6,
                  marginTop: 4,
                }}
              >
                <div>📊 {m.miou_or_metric}</div>
                {m.train_dataset && <div>🗂 {m.train_dataset}</div>}
                {m.hf_repo && (
                  <div style={{ wordBreak: 'break-all', color: 'rgba(91,199,250,0.7)' }}>
                    ⬇ {m.hf_repo}
                  </div>
                )}
                <Tooltip title={m.paper}>
                  <div style={{ marginTop: 2, color: 'rgba(185,207,255,0.4)', cursor: 'help' }}>
                    📖 {m.paper.length > 50 ? m.paper.slice(0, 50) + '…' : m.paper}
                  </div>
                </Tooltip>
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                {!m.needs_download ? (
                  <Tag style={{ flex: 1, textAlign: 'center', padding: 4, fontSize: 10 }}>本地内置</Tag>
                ) : m.downloaded ? (
                  <>
                    <span style={{ flex: 1, fontSize: 10, color: 'rgba(116,250,189,0.7)', alignSelf: 'center', fontFamily: bodyFont }}>
                      已下载 {m.actual_size_mb} MB
                    </span>
                    <Popconfirm title="删除本地缓存？" onConfirm={() => handleRemove(m.id)}>
                      <Button size="small" danger ghost icon={<DeleteOutlined />}>清除</Button>
                    </Popconfirm>
                  </>
                ) : (
                  <Button
                    size="small"
                    type="primary"
                    block
                    icon={<CloudDownloadOutlined />}
                    loading={isDl}
                    onClick={() => handleDownload(m.id)}
                    style={{
                      background: `linear-gradient(135deg, ${fc}, #5bc7fa)`,
                      border: 'none',
                      fontFamily: titleFont,
                      letterSpacing: 1,
                    }}
                  >
                    下载（约 {m.approx_size_mb} MB）
                  </Button>
                )}
              </div>
            </div>
          </Col>
        );
      })}
    </Row>
  );
};

// ====================================================================
// Tab 2: 我的模型（保留原 + 美化）
// ====================================================================
const UserModelsTab: React.FC<{ onChange: () => void }> = ({ onChange }) => {
  const [models, setModels] = useState<UserModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/models`);
      setModels((res.data.models || []).filter((m: UserModel) => m.type === 'user'));
    } catch {
      message.error('获取模型列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('display_name', file.name.replace(/\.(pt|pth)$/i, ''));
      const res = await axios.post(`${API_BASE}/models/upload`, formData, {
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
        timeout: 600000,
      });
      message.success(res.data.message || '上传成功');
      fetchModels();
      onChange();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '上传失败');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
    return false;
  }, [fetchModels, onChange]);

  const handleDelete = useCallback(async (modelId: string) => {
    try {
      await axios.delete(`${API_BASE}/models/${modelId}`);
      message.success('已删除');
      fetchModels();
      onChange();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '删除失败');
    }
  }, [fetchModels, onChange]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <Row gutter={16}>
      <Col span={9}>
        <WidgetPanel title="模型上传">
          <Upload.Dragger
            accept=".pt,.pth"
            showUploadList={false}
            beforeUpload={handleUpload}
            disabled={uploading}
            style={{
              background: 'rgba(167, 139, 250, 0.04)',
              border: '1px dashed rgba(167, 139, 250, 0.4)',
              borderRadius: 10,
            }}
          >
            <div style={{ padding: 24 }}>
              <InboxOutlined style={{ fontSize: 40, color: 'rgba(167, 139, 250, 0.7)' }} />
              <p style={{ color: 'rgba(255,255,255,0.6)', margin: '12px 0 4px', fontSize: 13, fontFamily: bodyFont }}>
                点击或拖拽 .pt / .pth 文件上传
              </p>
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: bodyFont }}>
                需基于 SAM3 架构训练 · 上限 5 GB
              </span>
            </div>
          </Upload.Dragger>
          {uploading && <Progress percent={uploadProgress} style={{ marginTop: 12 }} />}

          <div
            style={{
              marginTop: 16, padding: 14, borderRadius: 10,
              background: 'rgba(5,50,106,0.55)',
              border: '1px solid rgba(167,139,250,0.18)',
            }}
          >
            <div style={{ color: '#a78bfa', fontFamily: titleFont, fontSize: 12, marginBottom: 8 }}>
              <ThunderboltOutlined /> 上传规范
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, fontFamily: bodyFont }}>
              <div>• PyTorch checkpoint (.pt / .pth) Python state_dict</div>
              <div>• 必须与 SAM3 架构兼容（build_sam3_image_model 可加载）</div>
              <div>• 上传后系统自动尝试加载验证</div>
              <div>• 不兼容会立即拒绝并返回具体错误</div>
              <div style={{ marginTop: 6, color: '#f0c040' }}>
                💡 想用 HuggingFace 上的预训练模型？请去「预训练模型库」tab。
              </div>
            </div>
          </div>
        </WidgetPanel>
      </Col>
      <Col span={15}>
        <WidgetPanel title={`已上传模型 (${models.length})`}>
          <Table
            dataSource={models}
            rowKey="model_id"
            loading={loading}
            pagination={false}
            size="small"
            locale={{ emptyText: <Empty description="尚未上传任何自定义模型" /> }}
            columns={[
              {
                title: '名称',
                dataIndex: 'display_name',
                render: (name: string) => (
                  <span style={{ color: '#fff', fontFamily: bodyFont }}>{name}</span>
                ),
              },
              {
                title: '状态',
                dataIndex: 'status',
                render: (s: string) =>
                  s === 'ready' ? (
                    <Tag icon={<CheckCircleOutlined />} color="green" style={{ fontFamily: bodyFont }}>可用</Tag>
                  ) : (
                    <Tag style={{ fontFamily: bodyFont }}>{s}</Tag>
                  ),
              },
              {
                title: '大小',
                dataIndex: 'file_size',
                render: (v: number) => <span style={{ fontFamily: bodyFont }}>{formatSize(v)}</span>,
              },
              {
                title: '上传时间',
                dataIndex: 'uploaded_at',
                render: (t: string) => (
                  <span style={{ fontFamily: bodyFont, fontSize: 11 }}>
                    {t ? new Date(t).toLocaleString() : '-'}
                  </span>
                ),
              },
              {
                title: '操作',
                key: 'action',
                render: (_: any, record: UserModel) => (
                  <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.model_id)}>
                    <Button type="text" danger icon={<DeleteOutlined />} size="small">删除</Button>
                  </Popconfirm>
                ),
              },
            ]}
          />
        </WidgetPanel>
      </Col>
    </Row>
  );
};

// ====================================================================
// Tab 3: 模型对比
// ====================================================================
const CompareTab: React.FC = () => {
  const [pretrained, setPretrained] = useState<PretrainedModel[]>([]);
  const [userModels, setUserModels] = useState<UserModel[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [className, setClassName] = useState('building');
  const [prompt, setPrompt] = useState('building rooftop, residential house');
  const [selectedModels, setSelectedModels] = useState<string[]>(['sam3_default']);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; message: string } | null>(null);
  const [compareResult, setCompareResult] = useState<any>(null);

  const [viewMode, setViewMode] = useState<'side' | 'swipe'>('side');
  const [swipePos, setSwipePos] = useState(50);
  const [swipeIdxA, setSwipeIdxA] = useState(0);
  const [swipeIdxB, setSwipeIdxB] = useState(1);

  useEffect(() => {
    Promise.all([
      axios.get(`${API_BASE}/models/pretrained`),
      axios.get(`${API_BASE}/models`),
    ])
      .then(([a, b]) => {
        setPretrained(a.data?.models || []);
        setUserModels((b.data?.models || []).filter((m: UserModel) => m.type === 'user'));
      });
  }, []);

  // 拉取已上传文件列表（供选择）
  useEffect(() => {
    // tasks_db 没有专门的「已上传文件列表」端点，但可以通过 /api/tasks 拼出
    // 简化：让用户自己输入 file_id 或通过任务挑选
    axios.get(`${API_BASE}/tasks`).then((r) => {
      const tasks = r.data?.tasks || [];
      const seen = new Set<string>();
      const list: UploadedFile[] = [];
      tasks.forEach((t: any) => {
        if (t.file_id && !seen.has(t.file_id)) {
          seen.add(t.file_id);
          list.push({ file_id: t.file_id, filename: t.filename || t.file_id });
        }
      });
      setFiles(list);
      if (list.length > 0 && !selectedFile) setSelectedFile(list[0].file_id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allSelectableModels = useMemo(() => {
    const items: { id: string; label: string; group: string; downloaded: boolean }[] = [];
    pretrained.forEach((p) => {
      items.push({
        id: p.id,
        label: `${p.display_name}  (${p.params})`,
        group: '预训练库',
        downloaded: p.downloaded,
      });
    });
    userModels.forEach((u) => {
      items.push({
        id: u.model_id,
        label: `${u.display_name} (用户)`,
        group: '我的模型',
        downloaded: true,
      });
    });
    return items;
  }, [pretrained, userModels]);

  const startCompare = async () => {
    if (!selectedFile) {
      message.warning('请选择测试图像');
      return;
    }
    if (!className) {
      message.warning('请输入类别名');
      return;
    }
    if (selectedModels.length < 1) {
      message.warning('至少选择 1 个模型');
      return;
    }

    setRunning(true);
    setProgress({ pct: 0, message: '提交对比任务...' });
    setCompareResult(null);

    try {
      const r = await axios.post(`${API_BASE}/models/compare`, {
        file_id: selectedFile,
        class_name: className,
        prompt: prompt || className,
        model_ids: selectedModels,
        max_models: 4,
      });
      const cmpId = r.data.compare_task_id;

      // 轮询
      for (let i = 0; i < 600; i++) {
        await new Promise((res) => setTimeout(res, 1500));
        const tr = await axios.get(`${API_BASE}/tasks/${cmpId}`);
        const td = tr.data;
        setProgress({ pct: td.progress || 0, message: td.message || td.current_step });
        if (td.status === 'completed') {
          setCompareResult(td.result);
          message.success('对比完成');
          break;
        }
        if (td.status === 'failed') {
          message.error(`对比失败: ${td.error || td.message}`);
          break;
        }
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '对比启动失败');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const okResults = (compareResult?.results || []).filter((r: CompareResult) => r.status === 'ok');

  return (
    <Row gutter={16}>
      {/* 左：参数面板 */}
      <Col xs={24} lg={8}>
        <WidgetPanel title="对比配置">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#a78bfa', marginBottom: 4, fontFamily: titleFont, letterSpacing: 1 }}>
                测试图像
              </div>
              <Select
                value={selectedFile}
                onChange={setSelectedFile}
                placeholder="从已上传文件中选择"
                style={{ width: '100%' }}
                options={files.map((f) => ({ value: f.file_id, label: `${f.filename} (${f.file_id})` }))}
                notFoundContent={<Empty description="无已上传文件，请先到「数据集制作」上传" />}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#a78bfa', marginBottom: 4, fontFamily: titleFont, letterSpacing: 1 }}>
                目标类别
              </div>
              <Input
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="building / road / water / vegetation / farmland"
                prefix={<i className="fa-solid fa-tag" style={{ color: '#a78bfa', fontSize: 11 }} />}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#a78bfa', marginBottom: 4, fontFamily: titleFont, letterSpacing: 1 }}>
                文字提示词（仅 SAM3 用）
              </div>
              <Input.TextArea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="building rooftop, residential house, ..."
                rows={2}
                style={{ fontFamily: bodyFont, fontSize: 12 }}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#a78bfa', marginBottom: 4, fontFamily: titleFont, letterSpacing: 1 }}>
                选择对比模型（最多 4 个）
              </div>
              <Select
                mode="multiple"
                value={selectedModels}
                onChange={(v) => setSelectedModels(v.slice(0, 4))}
                placeholder="选择 1-4 个模型"
                style={{ width: '100%' }}
                maxTagCount={3}
                options={allSelectableModels.map((m) => ({
                  value: m.id,
                  label: (
                    <span>
                      <Tag style={{ fontSize: 9, marginRight: 6 }}>{m.group}</Tag>
                      {m.label}
                      {!m.downloaded && (
                        <Tag color="orange" style={{ fontSize: 9, marginLeft: 6 }}>需下载</Tag>
                      )}
                    </span>
                  ),
                }))}
              />
            </div>

            <Button
              type="primary"
              size="large"
              icon={<ExperimentOutlined />}
              loading={running}
              disabled={running}
              onClick={startCompare}
              style={{
                background: 'linear-gradient(135deg, #a78bfa, #74f7fd)',
                border: 'none',
                fontFamily: titleFont,
                letterSpacing: 1,
                marginTop: 8,
              }}
            >
              {running ? '运行中...' : '开始对比'}
            </Button>

            {progress && (
              <div>
                <Progress
                  percent={Math.round(progress.pct)}
                  size="small"
                  strokeColor={{ '0%': '#a78bfa', '100%': '#74f7fd' }}
                />
                <div style={{ fontSize: 10, color: 'rgba(185,207,255,0.6)', marginTop: 2, fontFamily: bodyFont }}>
                  {progress.message}
                </div>
              </div>
            )}

            <div
              style={{
                fontSize: 10,
                color: 'rgba(185,207,255,0.5)',
                fontFamily: "'Source Han Serif SC', serif",
                fontStyle: 'italic',
                lineHeight: 1.6,
                paddingTop: 8,
                borderTop: '1px solid rgba(167,139,250,0.15)',
              }}
            >
              💡 SAM3 走开放词汇分割（用 prompt）；HF 模型走 ADE20K 闭集类映射（自动匹配关键词）。
              对比结果会显示每个模型的预测 mask + 像素比例 + 推理耗时 + 两两 IoU 矩阵。
            </div>
          </div>
        </WidgetPanel>
      </Col>

      {/* 右：结果区 */}
      <Col xs={24} lg={16}>
        <WidgetPanel
          title={
            <Space>
              <span>对比结果</span>
              {okResults.length >= 2 && (
                <Tabs
                  size="small"
                  activeKey={viewMode}
                  onChange={(k) => setViewMode(k as any)}
                  items={[
                    { key: 'side', label: '并排显示' },
                    { key: 'swipe', label: '拖曳对比' },
                  ]}
                />
              )}
            </Space>
          }
        >
          {!compareResult && (
            <Empty
              description={
                <span style={{ color: 'rgba(185,207,255,0.5)', fontSize: 12 }}>
                  配置好参数后点击「开始对比」查看多模型分割结果
                </span>
              }
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}

          {compareResult && viewMode === 'side' && (
            <SideBySideView result={compareResult} />
          )}

          {compareResult && viewMode === 'swipe' && okResults.length >= 2 && (
            <SwipeView
              result={compareResult}
              swipePos={swipePos}
              setSwipePos={setSwipePos}
              idxA={swipeIdxA}
              idxB={swipeIdxB}
              setIdxA={setSwipeIdxA}
              setIdxB={setSwipeIdxB}
            />
          )}

          {compareResult?.iou_matrix?.length > 1 && (
            <IoUMatrix
              ids={compareResult.model_ids_for_iou}
              matrix={compareResult.iou_matrix}
              names={okResults.map((r: CompareResult) => r.display_name || r.model_id)}
            />
          )}
        </WidgetPanel>
      </Col>
    </Row>
  );
};

// ====================================================================
// 子组件: 并排显示
// ====================================================================
const SideBySideView: React.FC<{ result: any }> = ({ result }) => {
  const okResults = (result.results || []).filter((r: CompareResult) => r.status === 'ok');
  return (
    <div>
      <div style={{ marginBottom: 12, color: '#b9cfff', fontFamily: bodyFont, fontSize: 11 }}>
        类别：<span style={{ color: '#fff' }}>{result.class_name}</span>　·　
        提示词：<span style={{ color: '#74f7fd' }}>{result.prompt}</span>
      </div>
      <Row gutter={[12, 12]}>
        {/* 原图 */}
        <Col xs={24} sm={12} md={8}>
          <CompareCard
            title="原图"
            imageUrl={result.input_url}
            color="#74f7fd"
            stats={`${result.input_size?.[0]} × ${result.input_size?.[1]} px`}
          />
        </Col>
        {okResults.map((r: CompareResult) => (
          <Col xs={24} sm={12} md={8} key={r.model_id}>
            <CompareCard
              title={r.display_name || r.model_id}
              imageUrl={result.input_url}
              maskUrl={r.mask_url}
              color="#a78bfa"
              stats={`${r.stats?.fg_ratio.toFixed(2)}% · ${r.stats?.elapsed_sec.toFixed(1)}s`}
              info={r.info}
            />
          </Col>
        ))}
        {/* 失败的模型 */}
        {(result.results || []).filter((r: CompareResult) => r.status === 'failed').map((r: CompareResult) => (
          <Col xs={24} sm={12} md={8} key={r.model_id}>
            <div
              style={{
                padding: 12,
                background: 'rgba(255,77,79,0.1)',
                border: '1px solid rgba(255,77,79,0.4)',
                borderRadius: 8,
                fontSize: 11,
                color: '#ff8a8a',
                fontFamily: bodyFont,
              }}
            >
              <div style={{ fontWeight: 600 }}>{r.model_id}</div>
              <div style={{ fontSize: 10, marginTop: 4, opacity: 0.8 }}>{r.error}</div>
            </div>
          </Col>
        ))}
      </Row>
    </div>
  );
};

const CompareCard: React.FC<{
  title: string;
  imageUrl?: string;
  maskUrl?: string;
  color: string;
  stats: string;
  info?: any;
}> = ({ title, imageUrl, maskUrl, color, stats, info }) => (
  <div
    style={{
      background: `${color}11`,
      border: `1px solid ${color}33`,
      borderRadius: 8,
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        position: 'relative',
        height: 200,
        background: '#020e1f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        />
      )}
      {maskUrl && (
        <img
          src={maskUrl}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            margin: 'auto',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            opacity: 0.55,
            mixBlendMode: 'screen',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
    <div style={{ padding: '8px 12px' }}>
      <div style={{ fontFamily: titleFont, fontSize: 12, color: '#fff', marginBottom: 2 }}>
        {title}
      </div>
      <div style={{ fontFamily: bodyFont, fontSize: 10, color: 'rgba(185,207,255,0.65)' }}>
        {stats}
      </div>
      {info && (
        <div style={{ fontSize: 9, color: 'rgba(116,247,253,0.55)', marginTop: 2, fontFamily: bodyFont }}>
          {info.backbone && `${info.backbone}`}
          {info.params && ` · ${info.params}`}
        </div>
      )}
    </div>
  </div>
);

// ====================================================================
// 子组件: 拖曳对比（A 模型在左、B 模型在右，拖动分隔线）
// ====================================================================
const SwipeView: React.FC<{
  result: any;
  swipePos: number;
  setSwipePos: (n: number) => void;
  idxA: number;
  idxB: number;
  setIdxA: (n: number) => void;
  setIdxB: (n: number) => void;
}> = ({ result, swipePos, setSwipePos, idxA, idxB, setIdxA, setIdxB }) => {
  const okResults = (result.results || []).filter((r: CompareResult) => r.status === 'ok');
  const A = okResults[idxA];
  const B = okResults[idxB];

  if (!A || !B) {
    return <div style={{ color: '#b9cfff' }}>需要至少 2 个成功的对比结果才能使用拖曳模式</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 10, color: '#b9cfff', fontFamily: bodyFont, marginRight: 6 }}>左：</span>
          <Select
            size="small"
            value={idxA}
            onChange={setIdxA}
            style={{ width: 240 }}
            options={okResults.map((r: CompareResult, i: number) => ({ value: i, label: r.display_name || r.model_id }))}
          />
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 10, color: '#b9cfff', fontFamily: bodyFont, marginRight: 6 }}>右：</span>
          <Select
            size="small"
            value={idxB}
            onChange={setIdxB}
            style={{ width: 240 }}
            options={okResults.map((r: CompareResult, i: number) => ({ value: i, label: r.display_name || r.model_id }))}
          />
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 480,
          background: '#020e1f',
          borderRadius: 8,
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        {/* B 在底层（全屏） */}
        <img
          src={result.input_url}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
        />
        <img
          src={B.mask_url}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: 0.6,
            mixBlendMode: 'screen',
          }}
        />
        {/* A 覆盖在上面，用 clipPath 限制只显示左侧 swipePos % */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            clipPath: `polygon(0 0, ${swipePos}% 0, ${swipePos}% 100%, 0 100%)`,
          }}
        >
          <img
            src={result.input_url}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
          />
          <img
            src={A.mask_url}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              opacity: 0.6,
              mixBlendMode: 'screen',
            }}
          />
        </div>
        {/* 分隔线 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${swipePos}%`,
            width: 2,
            background: '#74f7fd',
            boxShadow: '0 0 10px rgba(116,247,253,0.8)',
            pointerEvents: 'none',
          }}
        />
        {/* 标签 */}
        <div style={{ position: 'absolute', top: 8, left: 8, padding: '2px 8px', background: 'rgba(0,0,0,0.6)', borderRadius: 4, fontSize: 11, color: '#74f7fd', fontFamily: bodyFont }}>
          A: {A.display_name || A.model_id}
        </div>
        <div style={{ position: 'absolute', top: 8, right: 8, padding: '2px 8px', background: 'rgba(0,0,0,0.6)', borderRadius: 4, fontSize: 11, color: '#a78bfa', fontFamily: bodyFont }}>
          B: {B.display_name || B.model_id}
        </div>
      </div>

      <div style={{ marginTop: 12, padding: '0 8px' }}>
        <Slider
          min={0}
          max={100}
          value={swipePos}
          onChange={setSwipePos}
          tooltip={{ formatter: (v) => `${v}%` }}
          trackStyle={{ background: '#74f7fd' }}
          handleStyle={{ borderColor: '#74f7fd' }}
        />
      </div>
    </div>
  );
};

// ====================================================================
// 子组件: IoU 矩阵
// ====================================================================
const IoUMatrix: React.FC<{ ids: string[]; matrix: number[][]; names: string[] }> = ({ ids, matrix, names }) => (
  <div style={{ marginTop: 16 }}>
    <div
      style={{
        fontFamily: titleFont,
        fontSize: 12,
        color: '#a78bfa',
        marginBottom: 8,
        letterSpacing: 1,
      }}
    >
      模型间 IoU 矩阵（一致性指标）
    </div>
    <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: bodyFont, width: '100%', maxWidth: 600 }}>
      <thead>
        <tr>
          <th style={{ padding: 6, color: '#74f7fd', textAlign: 'left' }}>模型</th>
          {names.map((n, i) => (
            <th key={i} style={{ padding: 6, color: 'rgba(116,247,253,0.7)', fontSize: 10, fontWeight: 'normal' }}>
              {n.length > 14 ? n.slice(0, 14) + '…' : n}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.map((row, i) => (
          <tr key={i}>
            <td style={{ padding: 6, color: 'rgba(116,247,253,0.7)', fontSize: 10 }}>
              {names[i].length > 18 ? names[i].slice(0, 18) + '…' : names[i]}
            </td>
            {row.map((v, j) => {
              const intensity = Math.round(v * 255);
              const bg = `rgba(${255 - intensity}, ${intensity}, 200, 0.18)`;
              return (
                <td
                  key={j}
                  style={{
                    padding: 6,
                    textAlign: 'center',
                    background: bg,
                    color: '#fff',
                    border: '1px solid rgba(116,247,253,0.08)',
                    fontFamily: "'DincorosBlack'",
                  }}
                  title={`${ids[i]} vs ${ids[j]} = IoU ${v.toFixed(4)}`}
                >
                  {v.toFixed(2)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default ModelsPage;
