/**
 * ConfirmView - 确认标注结果
 * 支持三种显示模式 + 缩放 + 彩色 mask 叠加
 */
import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Statistic, Space, Radio, Slider, Tooltip, Alert } from 'antd';
import {
  CheckCircleOutlined,
  EditOutlined,
  DownloadOutlined,
  PieChartOutlined,
  AreaChartOutlined,
  PictureOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, Legend } from 'recharts';
import { api } from '../../services/api';
import { useAppStore } from '../../stores/appStore';
import WidgetPanel from '../MFLayout/WidgetPanel';

type DisplayMode = 'overlay' | 'original' | 'mask';

const ConfirmView: React.FC = () => {
  const {
    classes, currentTask, predictionMask, editedMask,
    setCurrentStep, markStepCompleted,
  } = useAppStore();

  const [stats, setStats] = useState<{ name: string; value: number; color: string }[]>([]);
  const [totalPixels, setTotalPixels] = useState(0);
  const [loading, setLoading] = useState(true);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('overlay');
  const [overlayOpacity, setOverlayOpacity] = useState(0.6);
  const [zoom, setZoom] = useState(1);
  const [colorMaskUrl, setColorMaskUrl] = useState<string>('');
  const [presenceScores, setPresenceScores] = useState<Record<string, number>>({});

  const taskId = currentTask?.task_id;
  const maskUrl = editedMask || predictionMask;

  useEffect(() => {
    if (!taskId) return;
    api.getTask(taskId).then((task: any) => {
      if (task?.result?.presence_scores) {
        setPresenceScores(task.result.presence_scores);
      }
    }).catch(() => {});
  }, [taskId]);

  const lowPresenceClasses = classes.filter(c => {
    const ps = presenceScores[c.name];
    return ps !== undefined && ps < 0.15;
  });

  // 将灰度 mask 转为彩色（使用 canvas）
  useEffect(() => {
    if (!maskUrl) { setLoading(false); return; }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const palette: [number, number, number][] = [[0, 0, 0], ...classes.map(c => c.color)];

      // 统计
      const classCounts: Record<number, number> = {};
      const coloredData = new ImageData(img.width, img.height);

      for (let i = 0; i < imageData.data.length; i += 4) {
        const classIndex = imageData.data[i];
        classCounts[classIndex] = (classCounts[classIndex] || 0) + 1;
        const color = palette[classIndex] || [0, 0, 0];
        coloredData.data[i] = color[0];
        coloredData.data[i + 1] = color[1];
        coloredData.data[i + 2] = color[2];
        coloredData.data[i + 3] = classIndex > 0 ? 220 : 0;
      }

      // 生成彩色 mask dataURL
      const colorCanvas = document.createElement('canvas');
      colorCanvas.width = img.width;
      colorCanvas.height = img.height;
      const colorCtx = colorCanvas.getContext('2d');
      if (colorCtx) {
        colorCtx.putImageData(coloredData, 0, 0);
        setColorMaskUrl(colorCanvas.toDataURL('image/png'));
      }

      const total = img.width * img.height;
      setTotalPixels(total);
      const statsData = [
        { name: '背景', value: classCounts[0] || 0, color: '#333333' },
        ...classes.map((cls, idx) => ({
          name: cls.name,
          value: classCounts[idx + 1] || 0,
          color: `rgb(${cls.color[0]}, ${cls.color[1]}, ${cls.color[2]})`,
        })),
      ].filter(s => s.value > 0);
      setStats(statsData);
      setLoading(false);
    };
    img.onerror = () => setLoading(false);
    img.src = maskUrl.startsWith('data:') ? maskUrl : maskUrl;
  }, [maskUrl, classes]);

  // 如果有 taskId 的彩色 mask URL 直接用
  const displayMaskUrl = colorMaskUrl || (taskId ? api.getPredictionMaskUrl(taskId, true) : '');
  const originalUrl = taskId ? api.getPredictionOriginalUrl(taskId) : '';

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px' }}>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <CheckCircleOutlined style={{ fontSize: 36, color: '#74fabd', marginBottom: 10, filter: 'drop-shadow(0 0 16px rgba(116,250,189,0.5))' }} />
          <h1 style={{ fontSize: 26, fontFamily: 'SarasaMonoSC, Noto Sans SC', fontWeight: 700, marginBottom: 6 }}>
            <span className="gradient-text">确认标注结果</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>预览最终效果，确认无误后导出数据集</p>
        </div>
      </motion.div>

      <Row gutter={20}>
        {/* 预览区 */}
        <Col span={15}>
          <WidgetPanel title="数据集预览" bodyStyle={{ overflow: 'auto' }}>
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
              {/* 工具栏 */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 10, padding: '8px 14px',
                background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
              }}>
                <Radio.Group value={displayMode} onChange={(e) => setDisplayMode(e.target.value)} size="small" buttonStyle="solid">
                  <Tooltip title="叠加显示"><Radio.Button value="overlay"><PictureOutlined /> 叠加</Radio.Button></Tooltip>
                  <Tooltip title="仅原图"><Radio.Button value="original"><EyeOutlined /> 原图</Radio.Button></Tooltip>
                  <Tooltip title="仅标注"><Radio.Button value="mask"><EyeInvisibleOutlined /> 标注</Radio.Button></Tooltip>
                </Radio.Group>

                {displayMode === 'overlay' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>透明度</span>
                    <Slider min={0} max={1} step={0.05} value={overlayOpacity} onChange={setOverlayOpacity} style={{ width: 80 }} />
                    <span style={{ fontSize: 11, color: '#74f7fd', fontFamily: 'JetBrains Mono', width: 28 }}>{Math.round(overlayOpacity * 100)}%</span>
                  </div>
                )}

                <Space size={4}>
                  <Button size="small" icon={<ZoomOutOutlined />} onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} />
                  <span style={{ fontSize: 11, color: '#74f7fd', fontFamily: 'JetBrains Mono', width: 36, textAlign: 'center', display: 'inline-block' }}>{Math.round(zoom * 100)}%</span>
                  <Button size="small" icon={<ZoomInOutlined />} onClick={() => setZoom(z => Math.min(3, z + 0.25))} />
                </Space>
              </div>

              {/* 预览图 */}
              <Card className="glass-card" bodyStyle={{ padding: 0 }}>
                <div style={{
                  background: '#0d1117', borderRadius: 12, overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  minHeight: 400, position: 'relative',
                }}>
                  {taskId && (
                    <div style={{ position: 'relative', transform: `scale(${zoom})`, transition: 'transform 0.2s' }}>
                      {(displayMode === 'overlay' || displayMode === 'original') && (
                        <img src={originalUrl} alt="Original" style={{ maxWidth: '100%', display: 'block' }} />
                      )}
                      {displayMode === 'overlay' && displayMaskUrl && (
                        <img src={displayMaskUrl} alt="Mask" style={{
                          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                          opacity: overlayOpacity,
                        }} />
                      )}
                      {displayMode === 'mask' && displayMaskUrl && (
                        <img src={displayMaskUrl} alt="Mask" style={{ maxWidth: '100%', display: 'block' }} />
                      )}
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          </WidgetPanel>
        </Col>

        {/* 统计 + 操作 */}
        <Col span={9}>
          <WidgetPanel title="类别统计" bodyStyle={{ overflow: 'auto' }}>
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
              {/* 饼图 */}
              <Card className="glass-card" size="small" title={<><PieChartOutlined style={{ color: '#5bc7fa' }} /> 类别分布</>}>
                {!loading && stats.length > 0 && (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={stats} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                          {stats.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <ReTooltip
                          contentStyle={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(116,247,253,0.3)', borderRadius: 8 }}
                          formatter={(value: number) => [`${((value / totalPixels) * 100).toFixed(1)}%`, '占比']}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ marginTop: 8 }}>
                      {stats.map((stat, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: idx < stats.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: stat.color }} />
                            <span style={{ fontSize: 12 }}>{stat.name}</span>
                          </div>
                          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: '#74f7fd' }}>
                            {((stat.value / totalPixels) * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Card>

              {/* 基本信息 */}
              <Card className="glass-card" size="small" style={{ marginTop: 12 }} title={<><AreaChartOutlined style={{ color: '#74f7fd' }} /> 基本信息</>}>
                <Row gutter={12}>
                  <Col span={12}>
                    <Statistic title="类别数量" value={classes.length} valueStyle={{ color: '#74f7fd', fontFamily: 'DouyuFont', fontSize: 20 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title="总像素数" value={totalPixels.toLocaleString()} valueStyle={{ color: '#5bc7fa', fontFamily: 'DouyuFont', fontSize: 16 }} />
                  </Col>
                </Row>
              </Card>

              {/* 低置信类别警告 */}
              {lowPresenceClasses.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  icon={<WarningOutlined />}
                  style={{ marginTop: 12, background: 'rgba(255,183,0,0.08)', border: '1px solid rgba(255,183,0,0.3)', borderRadius: 10 }}
                  message="部分类别置信度较低"
                  description={
                    <div style={{ fontSize: 12 }}>
                      {lowPresenceClasses.map(c => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                          <div style={{ width: 10, height: 10, borderRadius: 2, background: `rgb(${c.color.join(',')})` }} />
                          <span>{c.name}</span>
                          <span style={{ color: '#ff9800' }}>
                            (置信度: {((presenceScores[c.name] || 0) * 100).toFixed(0)}%)
                          </span>
                        </div>
                      ))}
                      <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.5)' }}>
                        模型认为图像中可能不存在这些类别，已自动过滤。如需保留请返回编辑。
                      </div>
                    </div>
                  }
                />
              )}

              {/* 操作按钮 */}
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Button type="primary" size="large" icon={<DownloadOutlined />}
                  onClick={() => { markStepCompleted('confirm'); setCurrentStep('export'); }}
                  block
                  style={{ height: 46, borderRadius: 10, background: 'linear-gradient(135deg, #74f7fd, #5bc7fa)', border: 'none', boxShadow: '0 0 20px rgba(116,247,253,0.25)', fontWeight: 600 }}>
                  确认并导出
                </Button>
                <Button size="large" icon={<EditOutlined />} onClick={() => setCurrentStep('annotate')} block
                  style={{ height: 42, borderRadius: 10 }}>
                  返回编辑
                </Button>
              </div>
            </motion.div>
          </WidgetPanel>
        </Col>
      </Row>
    </div>
  );
};

export default ConfirmView;
