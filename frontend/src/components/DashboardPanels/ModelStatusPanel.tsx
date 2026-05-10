import React from 'react'
import { WidgetPanel } from '../MFLayout'

interface ModelInfo {
  name: string
  arch: string
  version: string
  size: string
  task: string
  metric: string
  metricVal: string
  status: 'loaded' | 'available' | 'offline'
}

const MODELS: ModelInfo[] = [
  { name: 'SAM3', arch: 'ViT-H', version: 'v1.0', size: '3.21 GB', task: 'Segmentation', metric: 'mIoU', metricVal: '82.3', status: 'loaded' },
  { name: 'YOLOv8s-OBB', arch: 'CSPDarknet', version: 'DOTAv1', size: '22 MB', task: 'Detection', metric: 'mAP₅₀', metricVal: '78.9', status: 'available' },
  { name: 'TTST-SR', arch: 'Transformer', version: '×4', size: '180 MB', task: 'Super-Res', metric: 'PSNR', metricVal: '32.4', status: 'available' },
  { name: 'RRDBNet', arch: 'RRDB', version: 'Satlas', size: '65 MB', task: 'Super-Res', metric: 'SSIM', metricVal: '0.91', status: 'available' },
]

const statusColors: Record<string, { bg: string; color: string; label: string }> = {
  loaded: { bg: 'rgba(116, 250, 189, 0.15)', color: '#74fabd', label: 'Loaded' },
  available: { bg: 'rgba(91, 199, 250, 0.15)', color: '#5bc7fa', label: 'Ready' },
  offline: { bg: 'rgba(255, 68, 68, 0.15)', color: '#ff4444', label: 'Offline' },
}

const ModelStatusPanel: React.FC = () => {
  return (
    <WidgetPanel title="模型运行状态" animationDelay={200}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gridTemplateRows: 'repeat(2, 1fr)',
        gap: 8,
        height: '100%',
      }}>
        {MODELS.map((model) => {
          const st = statusColors[model.status]
          return (
            <div
              key={model.name}
              style={{
                background: 'rgba(5, 50, 106, 0.4)',
                borderRadius: 6,
                padding: '8px 10px',
                border: '1px solid rgba(91, 199, 250, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: "'DouyuFont'", fontSize: 12, color: '#fff' }}>{model.name}</span>
                <span style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 10,
                  background: st.bg, color: st.color,
                }}>{st.label}</span>
              </div>
              <div style={{
                fontSize: 9, color: '#b9cfff', opacity: 0.5,
                fontFamily: "'Source Serif 4', serif", fontStyle: 'italic',
              }}>
                {model.arch} · {model.task}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, color: '#b9cfff', opacity: 0.6 }}>
                  {model.version} · {model.size}
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'baseline', gap: 3,
                  padding: '1px 6px', background: 'rgba(5,50,106,0.6)',
                  border: '1px solid rgba(116,247,253,0.1)', borderRadius: 3,
                }}>
                  <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 9, color: '#b9cfff', opacity: 0.5 }}>{model.metric}</span>
                  <span style={{ fontFamily: "'DincorosBlack'", fontSize: 12, color: '#74fabd' }}>{model.metricVal}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </WidgetPanel>
  )
}

export default ModelStatusPanel
