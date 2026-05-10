/**
 * ExportView - 数据集导出视图
 */
import React, { useState } from 'react';
import { Card, Button, Input, Form, Space, message, Spin, Result, Checkbox, Tag, Radio, Tooltip } from 'antd';
import {
  DownloadOutlined,
  FolderOpenOutlined,
  CheckCircleOutlined,
  FileZipOutlined,
  ReloadOutlined,
  PictureOutlined,
  ScissorOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { api } from '../../services/api';
import { useAppStore } from '../../stores/appStore';
import WidgetPanel from '../MFLayout/WidgetPanel';

type ExportMode = 'whole' | 'sliced' | 'both';

const ExportView: React.FC = () => {
  const {
    datasetName,
    setDatasetName,
    currentTask,
    classes,
    reset,
    uploadedFile,
  } = useAppStore();

  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [includeColorMask, setIncludeColorMask] = useState(true);
  const [includeOriginal, setIncludeOriginal] = useState(true);
  const [exportMode, setExportMode] = useState<ExportMode>('whole');

  const taskId = currentTask?.task_id;
  const imgW = uploadedFile?.width || 0;
  const imgH = uploadedFile?.height || 0;
  const isLargeImage = imgW > 1024 || imgH > 1024;

  const handleExport = async () => {
    if (!taskId) {
      message.error('未找到任务信息');
      return;
    }

    if (!datasetName.trim()) {
      message.error('请输入数据集名称');
      return;
    }

    setExporting(true);

    try {
      await api.generateFromAnnotation(taskId, datasetName.trim(), {
        includeOriginal,
        includeColorMask,
        exportMode,
      });
      setExported(true);
      message.success('数据集生成成功！');
    } catch (error) {
      message.error(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setExporting(false);
    }
  };

  const handleDownload = async () => {
    if (!taskId) return;

    try {
      await api.downloadAnnotationDataset(taskId);
      message.success('下载已开始');
    } catch (error) {
      message.error(`下载失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleNewTask = () => {
    reset();
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
      <WidgetPanel title="数据集导出" bodyStyle={{ overflow: 'auto' }}>
        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <DownloadOutlined style={{
              fontSize: 48,
              color: '#5bc7fa',
              marginBottom: 16,
              filter: 'drop-shadow(0 0 20px rgba(91, 199, 250, 0.5))',
            }} />
            <h1 style={{
              fontSize: 32,
              fontFamily: 'SarasaMonoSC, sans-serif',
              fontWeight: 700,
              marginBottom: 8,
            }}>
              <span className="gradient-text">导出数据集</span>
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15 }}>
              配置导出选项并下载您的数据集
            </p>
          </div>
        </motion.div>

        {!exported ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="glass-card">
              <Spin spinning={exporting} tip="正在生成数据集...">
                <Form layout="vertical">
                  {/* 数据集名称 */}
                  <Form.Item label="数据集名称" required>
                    <Input
                      size="large"
                      value={datasetName}
                      onChange={(e) => setDatasetName(e.target.value)}
                      placeholder="输入数据集名称"
                      prefix={<FolderOpenOutlined />}
                      style={{ background: 'rgba(255,255,255,0.05)' }}
                    />
                  </Form.Item>

                  {/* 导出模式 */}
                  <Form.Item label="导出模式">
                    <Radio.Group value={exportMode} onChange={(e) => setExportMode(e.target.value)}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Radio value="whole">
                          <Space>
                            <PictureOutlined style={{ color: '#74f7fd' }} />
                            <span style={{ color: 'rgba(255,255,255,0.8)' }}>整张大图标注</span>
                            <Tag color="cyan" style={{ fontSize: 10 }}>原图 + 对应标签</Tag>
                          </Space>
                        </Radio>
                        <Tooltip title={!isLargeImage ? '小图无需切分' : ''}>
                          <Radio value="sliced" disabled={!isLargeImage}>
                            <Space>
                              <ScissorOutlined style={{ color: '#5bc7fa' }} />
                              <span style={{ color: isLargeImage ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)' }}>
                                切分数据集
                              </span>
                              <Tag color="purple" style={{ fontSize: 10 }}>train/val/test 切片</Tag>
                            </Space>
                          </Radio>
                        </Tooltip>
                        <Tooltip title={!isLargeImage ? '小图无需切分' : ''}>
                          <Radio value="both" disabled={!isLargeImage}>
                            <Space>
                              <AppstoreOutlined style={{ color: '#74fabd' }} />
                              <span style={{ color: isLargeImage ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)' }}>
                                两者都下载
                              </span>
                              <Tag color="green" style={{ fontSize: 10 }}>完整标注 + 切分数据集</Tag>
                            </Space>
                          </Radio>
                        </Tooltip>
                      </Space>
                    </Radio.Group>
                  </Form.Item>

                  {/* 导出内容 */}
                  <Form.Item label="包含内容">
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Checkbox checked disabled>
                        <span style={{ color: 'rgba(255,255,255,0.8)' }}>灰度标签 (label.png)</span>
                        <Tag color="blue" style={{ marginLeft: 8 }}>必选</Tag>
                      </Checkbox>
                      <Checkbox checked={includeOriginal} onChange={(e) => setIncludeOriginal(e.target.checked)}>
                        <span style={{ color: 'rgba(255,255,255,0.8)' }}>原始图像 (image.png)</span>
                      </Checkbox>
                      <Checkbox checked={includeColorMask} onChange={(e) => setIncludeColorMask(e.target.checked)}>
                        <span style={{ color: 'rgba(255,255,255,0.8)' }}>彩色标签 (label_color.png)</span>
                      </Checkbox>
                    </Space>
                  </Form.Item>

                  {/* 类别信息 */}
                  <Form.Item label="类别配置">
                    <div style={{
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: 8,
                      padding: 16,
                    }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <Tag color="default">
                          <span style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: '#333',
                            marginRight: 6,
                          }} />
                          背景 (0)
                        </Tag>
                        {classes.map((cls, idx) => (
                          <Tag key={cls.id} color="cyan">
                            <span style={{
                              display: 'inline-block',
                              width: 10,
                              height: 10,
                              borderRadius: 2,
                              background: `rgb(${cls.color[0]}, ${cls.color[1]}, ${cls.color[2]})`,
                              marginRight: 6,
                            }} />
                            {cls.name} ({idx + 1})
                          </Tag>
                        ))}
                      </div>
                    </div>
                  </Form.Item>

                  {/* 导出按钮 */}
                  <Form.Item style={{ marginBottom: 0, textAlign: 'center' }}>
                    <Button
                      type="primary"
                      size="large"
                      icon={<FileZipOutlined />}
                      onClick={handleExport}
                      loading={exporting}
                      style={{
                        height: 48,
                        paddingInline: 48,
                        background: 'linear-gradient(135deg, #74f7fd, #5bc7fa)',
                        border: 'none',
                        boxShadow: '0 0 30px rgba(116, 247, 253, 0.3)',
                      }}
                    >
                      生成数据集
                    </Button>
                  </Form.Item>
                </Form>
              </Spin>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="glass-card">
              <Result
                icon={<CheckCircleOutlined style={{ color: '#74fabd' }} />}
                title="数据集生成成功！"
                subTitle={`数据集 "${datasetName}" 已准备好下载`}
                extra={[
                  <Button
                    key="download"
                    type="primary"
                    size="large"
                    icon={<DownloadOutlined />}
                    onClick={handleDownload}
                    style={{
                      background: 'linear-gradient(135deg, #74f7fd, #5bc7fa)',
                      border: 'none',
                      boxShadow: '0 0 20px rgba(116, 247, 253, 0.3)',
                    }}
                  >
                    下载数据集
                  </Button>,
                  <Button
                    key="new"
                    size="large"
                    icon={<ReloadOutlined />}
                    onClick={handleNewTask}
                  >
                    新建任务
                  </Button>,
                ]}
              />

              <div style={{
                marginTop: 24,
                padding: 16,
                background: 'rgba(0,0,0,0.2)',
                borderRadius: 8,
              }}>
                <h4 style={{ marginBottom: 12, color: 'rgba(255,255,255,0.7)' }}>数据集内容</h4>
                <ul style={{
                  margin: 0,
                  paddingLeft: 20,
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: 13,
                }}>
                  <li>images/ - 原始图像</li>
                  <li>labels/ - 灰度标签 (像素值=类别索引)</li>
                  <li>labels_color/ - 彩色可视化标签</li>
                  <li>dataset_info.json - 数据集元信息</li>
                </ul>
              </div>
            </Card>
          </motion.div>
        )}
      </WidgetPanel>
    </div>
  );
};

export default ExportView;
