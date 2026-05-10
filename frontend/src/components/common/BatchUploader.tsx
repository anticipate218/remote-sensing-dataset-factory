import React, { useCallback, useState } from 'react';
import { Button, Progress, Radio, Space, Tag, Typography, Upload, message, Row, Col } from 'antd';
import {
  AppstoreOutlined, FileOutlined, InboxOutlined, UploadOutlined,
  DeleteOutlined, FileImageOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;
const API_BASE = '/api';

export interface UploadedFileInfo {
  file_id: string;
  filename: string;
  width?: number;
  height?: number;
  preview_url?: string;
}

interface BatchUploaderProps {
  mode?: 'single' | 'batch';
  onModeChange?: (mode: 'single' | 'batch') => void;
  onFileUploaded?: (file: UploadedFileInfo) => void;
  onBatchUploaded?: (files: UploadedFileInfo[]) => void;
  maxFiles?: number;
  accept?: string;
  showModeSwitch?: boolean;
  compact?: boolean;
}

const BatchUploader: React.FC<BatchUploaderProps> = ({
  mode: controlledMode,
  onModeChange,
  onFileUploaded,
  onBatchUploaded,
  maxFiles = 50,
  accept = '.tif,.tiff,.png,.jpg,.jpeg',
  showModeSwitch = true,
}) => {
  const [internalMode, setInternalMode] = useState<'single' | 'batch'>('single');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [singlePreview, setSinglePreview] = useState<UploadedFileInfo | null>(null);
  const [batchPreviews, setBatchPreviews] = useState<UploadedFileInfo[]>([]);

  const mode = controlledMode ?? internalMode;

  const changeMode = (m: 'single' | 'batch') => {
    setInternalMode(m);
    setPendingFiles([]);
    setSinglePreview(null);
    setBatchPreviews([]);
    onModeChange?.(m);
  };

  const handleSingleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await axios.post(`${API_BASE}/upload`, formData, {
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      const fileId = res.data.file_id || res.data.task_id;
      const info: UploadedFileInfo = {
        file_id: fileId,
        filename: res.data.filename,
        width: res.data.width,
        height: res.data.height,
        preview_url: res.data.preview_url
          ? (res.data.preview_url.startsWith('/api') ? res.data.preview_url : `${API_BASE}${res.data.preview_url}`)
          : `${API_BASE}/preview/${fileId}`,
      };
      setSinglePreview(info);
      onFileUploaded?.(info);
      message.success(`已上传: ${res.data.filename}`);
    } catch {
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
    return false;
  }, [onFileUploaded]);

  const handleBatchSelect = useCallback((file: File) => {
    setPendingFiles((prev) => {
      if (prev.length >= maxFiles) {
        message.warning(`最多选择 ${maxFiles} 个文件`);
        return prev;
      }
      if (prev.some((f) => f.name === file.name)) return prev;
      return [...prev, file];
    });
    return false;
  }, [maxFiles]);

  const uploadBatch = useCallback(async () => {
    if (pendingFiles.length === 0) {
      message.warning('请先选择文件');
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const formData = new FormData();
      pendingFiles.forEach((f) => formData.append('files', f));
      const res = await axios.post(`${API_BASE}/upload-batch`, formData, {
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      // 后端把成功放在 files、失败放在 errors（两个分开的列表），过滤掉任何缺 file_id 的
      // 异常项以防万一（例如未来后端格式变化时不会让前端崩）。
      const rawFiles: any[] = Array.isArray(res.data.files) ? res.data.files : [];
      const files: UploadedFileInfo[] = rawFiles
        .filter((f) => f && f.file_id)
        .map((f) => ({
          file_id: f.file_id,
          filename: f.filename,
          width: f.width,
          height: f.height,
          preview_url: f.preview_url
            ? (f.preview_url.startsWith('/api') ? f.preview_url : `${API_BASE}${f.preview_url}`)
            : `${API_BASE}/preview/${f.file_id}`,
        }));
      setBatchPreviews(files);
      onBatchUploaded?.(files);
      setPendingFiles([]);

      const errors: { filename?: string; error?: string }[] = Array.isArray(res.data.errors) ? res.data.errors : [];
      if (files.length > 0 && errors.length === 0) {
        message.success(`已上传 ${files.length} 个文件`);
      } else if (files.length > 0 && errors.length > 0) {
        message.warning({
          content: `成功 ${files.length} 个，失败 ${errors.length} 个：${errors.slice(0, 3).map(e => `${e.filename || '?'}（${e.error || '未知错误'}）`).join('；')}${errors.length > 3 ? '…' : ''}`,
          duration: 6,
        });
      } else if (errors.length > 0) {
        message.error(`全部 ${errors.length} 个文件均上传失败：${errors.slice(0, 3).map(e => e.filename).join('、')}`);
      } else {
        message.error('上传未返回任何文件');
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '批量上传失败');
    } finally {
      setUploading(false);
    }
  }, [pendingFiles, onBatchUploaded]);

  return (
    <div>
      {showModeSwitch && (
        <div style={{ marginBottom: 12 }}>
          <Radio.Group value={mode} onChange={(e) => changeMode(e.target.value)} buttonStyle="solid" size="small">
            <Radio.Button value="single"><FileOutlined /> 单张</Radio.Button>
            <Radio.Button value="batch"><AppstoreOutlined /> 批量</Radio.Button>
          </Radio.Group>
        </div>
      )}

      {mode === 'single' ? (
        <div>
          <Upload.Dragger
            accept={accept}
            showUploadList={false}
            beforeUpload={handleSingleUpload}
            disabled={uploading}
            style={{
              background: 'rgba(0,240,255,0.02)',
              border: '1px dashed rgba(0,240,255,0.25)',
              borderRadius: 10,
            }}
          >
            {singlePreview ? (
              <div style={{ padding: 8 }}>
                <img
                  src={singlePreview.preview_url}
                  alt={singlePreview.filename}
                  style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8, objectFit: 'contain' }}
                />
                <div style={{ marginTop: 6 }}>
                  <Tag color="cyan">{singlePreview.filename}</Tag>
                  {singlePreview.width && (
                    <Tag>{singlePreview.width}x{singlePreview.height}</Tag>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: 16 }}>
                <FileImageOutlined style={{ fontSize: 32, color: 'rgba(0,240,255,0.4)' }} />
                <p style={{ color: 'rgba(255,255,255,0.5)', margin: '8px 0 0', fontSize: 13 }}>点击或拖拽上传图像</p>
              </div>
            )}
            {uploading && <Progress percent={progress} size="small" style={{ maxWidth: 200, margin: '8px auto 0' }} />}
          </Upload.Dragger>
        </div>
      ) : (
        <div>
          <Upload.Dragger
            multiple
            accept={accept}
            showUploadList={false}
            beforeUpload={handleBatchSelect}
            disabled={uploading}
            style={{
              background: 'rgba(139,92,246,0.03)',
              border: '1px dashed rgba(139,92,246,0.25)',
              borderRadius: 10,
              marginBottom: 8,
            }}
          >
            <div style={{ padding: 12 }}>
              <InboxOutlined style={{ fontSize: 28, color: '#8b5cf6' }} />
              <p style={{ color: 'rgba(255,255,255,0.5)', margin: '6px 0 0', fontSize: 13 }}>点击或拖拽添加多个文件</p>
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>最多 {maxFiles} 张</Text>
            </div>
          </Upload.Dragger>

          {pendingFiles.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 8 }}>
                {pendingFiles.map((f) => (
                  <div key={f.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', marginBottom: 2 }}>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }} ellipsis>{f.name}</Text>
                    <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => setPendingFiles(p => p.filter(x => x.name !== f.name))} style={{ color: 'rgba(255,71,87,0.6)' }} />
                  </div>
                ))}
              </div>
              <Button icon={<UploadOutlined />} type="primary" onClick={uploadBatch} loading={uploading} block
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #00f0ff)', border: 'none', borderRadius: 8 }}>
                上传 {pendingFiles.length} 个文件
              </Button>
              {uploading && <Progress percent={progress} size="small" style={{ marginTop: 8 }} />}
            </div>
          )}

          {/* Batch preview thumbnails */}
          {batchPreviews.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 6, display: 'block' }}>
                已上传 {batchPreviews.length} 个文件
              </Text>
              <Row gutter={[6, 6]}>
                {batchPreviews.slice(0, 8).map((f) => (
                  <Col span={6} key={f.file_id}>
                    <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
                      {f.preview_url ? (
                        <img src={f.preview_url} alt={f.filename} style={{ width: '100%', height: 56, objectFit: 'cover' }} />
                      ) : (
                        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FileImageOutlined style={{ color: 'rgba(255,255,255,0.2)' }} />
                        </div>
                      )}
                      <div style={{ padding: '2px 4px', fontSize: 9, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {f.filename}
                      </div>
                    </div>
                  </Col>
                ))}
                {batchPreviews.length > 8 && (
                  <Col span={6}>
                    <div style={{ height: 72, borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                      +{batchPreviews.length - 8}
                    </div>
                  </Col>
                )}
              </Row>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BatchUploader;
