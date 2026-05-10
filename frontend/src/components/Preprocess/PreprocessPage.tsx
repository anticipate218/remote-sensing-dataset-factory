import React, { useCallback, useState } from 'react';
import { Button, Card, Col, Progress, Radio, Row, Select, Slider, Space, Tag, Tooltip, Typography, message } from 'antd';
import { DownloadOutlined, ThunderboltOutlined, ClockCircleOutlined, CheckCircleFilled, CloseCircleFilled, LoadingOutlined } from '@ant-design/icons';
import axios from 'axios';
import BatchUploader, { UploadedFileInfo } from '../common/BatchUploader';
import WidgetPanel from '../MFLayout/WidgetPanel';
import PageHeader from '../common/PageHeader';
import { asyncPool, isAsyncPoolError } from '../../utils/asyncPool';

const { Text } = Typography;
const API_BASE = '/api';

interface ProcessResult {
  message: string;
  preview_url?: string;
  download_url?: string;
}

interface BatchResultItem {
  file_id: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultPreview?: string;
  result?: ProcessResult;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

const PreprocessPage: React.FC = () => {
  const [uploadMode, setUploadMode] = useState<'single' | 'batch'>('single');
  const [fileId, setFileId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [processing, setProcessing] = useState(false);

  const [batchFiles, setBatchFiles] = useState<UploadedFileInfo[]>([]);
  const [batchResults, setBatchResults] = useState<BatchResultItem[]>([]);
  const [batchConcurrency, setBatchConcurrency] = useState<number>(4);
  const [batchStartTime, setBatchStartTime] = useState<number | null>(null);
  const [batchElapsedMs, setBatchElapsedMs] = useState<number>(0);

  const [activeTab, setActiveTab] = useState<'enhance' | 'convert'>('enhance');
  const [enhanceMethod, setEnhanceMethod] = useState<string>('histogram');
  const [targetFormat, setTargetFormat] = useState<string>('png');
  const [contrastFactor, setContrastFactor] = useState(1.5);

  const [result, setResult] = useState<ProcessResult | null>(null);
  const [resultPreview, setResultPreview] = useState('');

  const onSingleUploaded = (f: UploadedFileInfo) => {
    setFileId(f.file_id);
    setPreviewUrl(f.preview_url || `${API_BASE}/preview/${f.file_id}`);
    setResult(null);
    setResultPreview('');
  };

  const onBatchUploaded = (files: UploadedFileInfo[]) => {
    setBatchFiles(files);
    setBatchResults([]);
    setResult(null);
    setResultPreview('');
  };

  const getEnhanceParams = useCallback(() => {
    if (enhanceMethod === 'contrast') return { factor: contrastFactor };
    return {};
  }, [enhanceMethod, contrastFactor]);

  const runSingle = async () => {
    if (!fileId) {
      message.warning('请先上传图像');
      return;
    }

    if (activeTab === 'enhance') {
      const r = await axios.post(`${API_BASE}/preprocess/enhance`, {
        file_id: fileId,
        method: enhanceMethod,
        params: getEnhanceParams(),
      });
      setResult(r.data);
      if (r.data.preview_url) setResultPreview(`${API_BASE}${r.data.preview_url}`);
      message.success(r.data.message || '增强完成');
    } else {
      const r = await axios.post(`${API_BASE}/preprocess/convert`, {
        file_id: fileId,
        format: targetFormat,
      });
      setResult(r.data);
      message.success(r.data.message || '转换完成');
    }
  };

  const runBatch = async () => {
    if (!batchFiles.length) {
      message.warning('请先上传图像');
      return;
    }

    // 初始化结果列表（所有项标 pending）
    const localResults: BatchResultItem[] = batchFiles.map((f) => ({
      file_id: f.file_id,
      filename: f.filename,
      status: 'pending',
    }));
    setBatchResults(localResults);
    const startedAt = Date.now();
    setBatchStartTime(startedAt);
    setBatchElapsedMs(0);

    // 并发计时器（每 200ms 刷新已用时间）
    const elapsedTimer = setInterval(() => {
      setBatchElapsedMs(Date.now() - startedAt);
    }, 200);

    // 每张图的处理函数（被 asyncPool 多路并发调用）
    const worker = async (file: UploadedFileInfo, idx: number) => {
      // 标记为 processing 并立即刷新 UI
      localResults[idx] = {
        ...localResults[idx],
        status: 'processing',
        startedAt: Date.now(),
      };
      setBatchResults([...localResults]);

      let r;
      if (activeTab === 'enhance') {
        r = await axios.post(`${API_BASE}/preprocess/enhance`, {
          file_id: file.file_id,
          method: enhanceMethod,
          params: getEnhanceParams(),
        });
      } else {
        r = await axios.post(`${API_BASE}/preprocess/convert`, {
          file_id: file.file_id,
          format: targetFormat,
        });
      }
      return r.data;
    };

    const results = await asyncPool(
      batchConcurrency,
      batchFiles,
      worker,
      (done, total, lastIdx) => {
        // 进度回调里把已完成的写回 UI
        const item = localResults[lastIdx];
        if (item) {
          item.finishedAt = Date.now();
        }
        setBatchResults([...localResults]);
      },
    );

    // 把 asyncPool 返回的最终结果写入 localResults
    results.forEach((r, idx) => {
      if (isAsyncPoolError(r)) {
        localResults[idx].status = 'failed';
        localResults[idx].error = (r as { __error: Error }).__error.message;
      } else {
        localResults[idx].status = 'completed';
        localResults[idx].result = r as ProcessResult;
        const data = r as ProcessResult;
        if (data?.preview_url) {
          localResults[idx].resultPreview = `${API_BASE}${data.preview_url}`;
        }
      }
    });

    clearInterval(elapsedTimer);
    setBatchResults([...localResults]);
    setBatchElapsedMs(Date.now() - startedAt);

    const ok = localResults.filter((x) => x.status === 'completed').length;
    const failed = localResults.length - ok;
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (failed > 0) {
      message.warning(
        `批量处理完成: ${ok}/${localResults.length} 成功，${failed} 失败 · 用时 ${elapsedSec}s · 并发 ${batchConcurrency}`,
      );
    } else {
      message.success(
        `批量处理完成: ${ok}/${localResults.length} · 用时 ${elapsedSec}s · 并发 ${batchConcurrency}`,
      );
    }
  };

  const execute = async () => {
    try {
      setProcessing(true);
      if (uploadMode === 'batch') {
        await runBatch();
      } else {
        await runSingle();
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '处理失败');
    } finally {
      setProcessing(false);
    }
  };

  const batchCardStyles = {
    header: {
      background: 'rgba(5, 50, 106, 0.55)',
      borderBottom: '1px solid rgba(116, 247, 253, 0.2)',
      color: '#fff',
      fontFamily: "'SarasaMonoSC', monospace",
    },
    body: {
      background: 'rgba(5, 50, 106, 0.35)',
    },
  } as const;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 0' }}>
      <PageHeader
        theme="preprocess"
        title="数据预处理"
        subtitle="Image Enhancement · Format Conversion · Batch Processing"
        iconClass="fa-solid fa-wand-magic-sparkles"
        decoration="spectrum"
      />

      <Row gutter={16}>
        <Col span={9}>
          <WidgetPanel title="影像上传" bodyStyle={{ overflow: 'auto' }}>
            <BatchUploader
              mode={uploadMode}
              onModeChange={setUploadMode}
              onFileUploaded={onSingleUploaded}
              onBatchUploaded={onBatchUploaded}
              compact
            />
          </WidgetPanel>

          <WidgetPanel title="预处理参数" style={{ marginTop: 12 }} bodyStyle={{ overflow: 'auto' }}>
            <Radio.Group value={activeTab} onChange={(e) => setActiveTab(e.target.value)}>
              <Radio.Button value="enhance">图像增强</Radio.Button>
              <Radio.Button value="convert">格式转换</Radio.Button>
            </Radio.Group>

            {activeTab === 'enhance' ? (
              <div style={{ marginTop: 12 }}>
                <Text style={{ fontFamily: "'SarasaMonoSC', monospace" }}>增强方法</Text>
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  value={enhanceMethod}
                  onChange={setEnhanceMethod}
                  options={[
                    { value: 'histogram', label: '直方图均衡化' },
                    { value: 'contrast', label: '对比度调整' },
                    { value: 'brightness', label: '亮度调整' },
                    { value: 'sharpen', label: '锐化增强' },
                    { value: 'denoise', label: '中值去噪' },
                  ]}
                />
                {enhanceMethod === 'contrast' && (
                  <div style={{ marginTop: 10 }}>
                    <Text style={{ fontFamily: "'SarasaMonoSC', monospace" }}>对比度: {contrastFactor.toFixed(1)}</Text>
                    <Slider min={0.5} max={3} step={0.1} value={contrastFactor} onChange={(v) => setContrastFactor(Number(v))} />
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <Text style={{ fontFamily: "'SarasaMonoSC', monospace" }}>目标格式</Text>
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  value={targetFormat}
                  onChange={setTargetFormat}
                  options={[
                    { value: 'png', label: 'PNG' },
                    { value: 'jpg', label: 'JPG' },
                    { value: 'tif', label: 'TIF' },
                  ]}
                />
              </div>
            )}

            {uploadMode === 'batch' && (
              <div style={{ marginTop: 12, padding: 10, background: 'rgba(116,247,253,0.05)', borderRadius: 8, border: '1px dashed rgba(116,247,253,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <ThunderboltOutlined style={{ color: '#74fabd' }} />
                  <Text style={{ fontSize: 12, color: '#74fabd', fontFamily: "'SarasaMonoSC', monospace" }}>
                    并发处理路数
                  </Text>
                  <Tooltip title="同时处理多少张图。提高并发可大幅加速，但 GPU/CPU 占用更高（建议 4–8）">
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#74fabd', fontWeight: 700 }}>
                      ×{batchConcurrency}
                    </span>
                  </Tooltip>
                </div>
                <Radio.Group
                  size="small"
                  value={batchConcurrency}
                  onChange={(e) => setBatchConcurrency(e.target.value)}
                  buttonStyle="solid"
                  disabled={processing}
                  style={{ width: '100%', display: 'flex' }}
                >
                  {[1, 2, 4, 8, 16].map((n) => (
                    <Radio.Button key={n} value={n} style={{ flex: 1, textAlign: 'center' }}>
                      {n === 1 ? '顺序' : n}
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </div>
            )}

            <Button type="primary" block loading={processing} style={{ marginTop: 14 }} onClick={execute}>
              {processing ? '处理中...' : uploadMode === 'batch' ? `批量执行 (${batchFiles.length || 0} 张 · ×${batchConcurrency} 并发)` : '开始执行'}
            </Button>
          </WidgetPanel>
        </Col>

        <Col span={15}>
          <WidgetPanel title="处理结果" bodyStyle={{ overflow: 'auto' }}>
            {uploadMode === 'single' && (
              <Space direction="vertical" style={{ width: '100%' }}>
                {previewUrl && <img src={previewUrl} alt="input" style={{ maxWidth: '100%', borderRadius: 8 }} />}
                {resultPreview && <img src={resultPreview} alt="result" style={{ maxWidth: '100%', borderRadius: 8 }} />}
                {!!result?.download_url && (
                  <Button icon={<DownloadOutlined />} onClick={() => window.open(`${API_BASE}${result.download_url}`, '_blank')}>
                    下载结果
                  </Button>
                )}
                {result?.message && (
                  <Tag
                    style={{
                      color: '#74fabd',
                      background: 'rgba(116, 250, 189, 0.12)',
                      borderColor: 'rgba(116, 250, 189, 0.35)',
                      fontFamily: "'SarasaMonoSC', monospace",
                    }}
                  >
                    {result.message}
                  </Tag>
                )}
              </Space>
            )}

            {uploadMode === 'batch' && (
              <div>
                {/* 总体进度横幅（处理中或已完成时显示） */}
                {batchResults.length > 0 && (
                  (() => {
                    const total = batchResults.length;
                    const done = batchResults.filter((r) => r.status === 'completed' || r.status === 'failed').length;
                    const ok = batchResults.filter((r) => r.status === 'completed').length;
                    const failed = batchResults.filter((r) => r.status === 'failed').length;
                    const running = batchResults.filter((r) => r.status === 'processing').length;
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                    const elapsedSec = (batchElapsedMs / 1000).toFixed(1);
                    const allDone = done === total;
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
                          <ThunderboltOutlined style={{ color: allDone ? '#74fabd' : '#74f7fd', fontSize: 16 }} />
                          <Text strong style={{ color: '#fff', fontFamily: "'SarasaMonoSC', monospace" }}>
                            {allDone ? '✓ 批量完成' : `批量处理中 · 并发 ×${batchConcurrency}`}
                          </Text>
                          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
                            <Tag color="green" icon={<CheckCircleFilled />}>{ok}</Tag>
                            {failed > 0 && <Tag color="red" icon={<CloseCircleFilled />}>{failed}</Tag>}
                            {running > 0 && <Tag color="cyan" icon={<LoadingOutlined spin />}>运行 {running}</Tag>}
                            <Tag icon={<ClockCircleOutlined />} color="default">{elapsedSec}s</Tag>
                          </span>
                        </div>
                        <Progress
                          percent={pct}
                          status={failed > 0 ? 'exception' : (allDone ? 'success' : 'active')}
                          strokeColor={{
                            '0%': '#74f7fd',
                            '100%': '#74fabd',
                          }}
                          format={(p) => `${done}/${total} (${p}%)`}
                        />
                      </div>
                    );
                  })()
                )}

                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  {batchResults.map((x) => {
                    const itemMs = (x.startedAt && x.finishedAt) ? (x.finishedAt - x.startedAt) : 0;
                    const statusIcon = x.status === 'completed' ? <CheckCircleFilled style={{ color: '#74fabd' }} />
                      : x.status === 'failed' ? <CloseCircleFilled style={{ color: '#ff4d4f' }} />
                      : x.status === 'processing' ? <LoadingOutlined spin style={{ color: '#74f7fd' }} />
                      : <ClockCircleOutlined style={{ color: 'rgba(255,255,255,0.4)' }} />;
                    const statusColor = x.status === 'completed' ? 'green'
                      : x.status === 'failed' ? 'red'
                      : x.status === 'processing' ? 'cyan'
                      : 'default';
                    return (
                      <Card
                        key={x.file_id}
                        size="small"
                        title={
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {statusIcon}
                            <span style={{ fontFamily: "'SarasaMonoSC', monospace", fontSize: 12 }}>{x.filename}</span>
                          </span>
                        }
                        extra={
                          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {itemMs > 0 && <Tag color="default" style={{ margin: 0, fontSize: 10 }}>{(itemMs / 1000).toFixed(1)}s</Tag>}
                            <Tag color={statusColor} style={{ margin: 0, fontSize: 10 }}>{x.status}</Tag>
                          </span>
                        }
                        styles={batchCardStyles}
                      >
                        {x.resultPreview && (
                          <img src={x.resultPreview} alt={x.filename} style={{ maxWidth: 260, borderRadius: 6 }} />
                        )}
                        {x.error && (
                          <Text type="danger" style={{ fontSize: 11, fontFamily: "'SarasaMonoSC', monospace" }}>
                            {x.error}
                          </Text>
                        )}
                      </Card>
                    );
                  })}
                </Space>
              </div>
            )}
          </WidgetPanel>
        </Col>
      </Row>
    </div>
  );
};

export default PreprocessPage;
