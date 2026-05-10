import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from 'antd'
import { WidgetPanel } from '../MFLayout'
import { useAppStore } from '../../stores/appStore'

interface ActionCard {
  icon: string
  label: string
  desc: string
  path: string
  color: string
  /** 是否在點擊時重置數據集制作流程（語義為「新建」） */
  resetDataset?: boolean
}

const ACTIONS: ActionCard[] = [
  { icon: 'fa-solid fa-satellite-dish', label: '数据集制作', desc: 'Semantic Segmentation · SAM3', path: '/dataset', color: '#74f7fd', resetDataset: true },
  { icon: 'fa-solid fa-wand-magic-sparkles', label: '数据预处理', desc: 'Augmentation · Format Conv.', path: '/preprocess', color: '#74fabd' },
  { icon: 'fa-solid fa-crosshairs', label: '目标检测', desc: 'Object Detection · YOLOv8', path: '/tasks', color: '#5bc7fa' },
  { icon: 'fa-solid fa-expand', label: '超分辨率', desc: 'Super-Resolution · TTST', path: '/tasks', color: '#f0c040' },
  { icon: 'fa-solid fa-book-open', label: 'API 文档', desc: 'RESTful API · OpenAPI 3.0', path: '/api-docs', color: '#b9cfff' },
  { icon: 'fa-solid fa-cubes', label: '模型管理', desc: 'Model Zoo · Custom Weights', path: '/models', color: '#74f7fd' },
]

const QuickActionsPanel: React.FC = () => {
  const navigate = useNavigate()
  const reset = useAppStore((s) => s.reset)
  const currentStep = useAppStore((s) => s.currentStep)
  const uploadedFile = useAppStore((s) => s.uploadedFile)
  const batchFiles = useAppStore((s) => s.batchFiles)

  const handleClick = (action: ActionCard) => {
    if (!action.resetDataset) {
      navigate(action.path)
      return
    }
    const hasInProgress = currentStep !== 'upload' || !!uploadedFile || (batchFiles?.length ?? 0) > 0
    if (hasInProgress) {
      Modal.confirm({
        title: '开始新的数据集？',
        content: '当前还有未完成的数据集会话，是否丢弃并新建？（已生成的结果可在「下游任务」页面查看）',
        okText: '丢弃并新建',
        cancelText: '继续上一会话',
        onOk: () => { reset(); navigate(action.path) },
        onCancel: () => { navigate(action.path) },
      })
    } else {
      reset()
      navigate(action.path)
    }
  }

  return (
    <WidgetPanel title="快速操作" animationDelay={600}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        gap: 6,
        height: '100%',
      }}>
        {ACTIONS.map((action) => (
          <div
            key={action.label}
            onClick={() => handleClick(action)}
            style={{
              background: 'rgba(5, 50, 106, 0.4)',
              borderRadius: 6,
              padding: '8px 10px',
              cursor: 'pointer',
              border: '1px solid rgba(91, 199, 250, 0.08)',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(116, 247, 253, 0.3)'
              e.currentTarget.style.background = 'rgba(116, 247, 253, 0.08)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(91, 199, 250, 0.08)'
              e.currentTarget.style.background = 'rgba(5, 50, 106, 0.4)'
            }}
          >
            <i className={action.icon} style={{ fontSize: 18, color: action.color, minWidth: 24, textAlign: 'center' }} />
            <div>
              <div style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>{action.label}</div>
              <div style={{ fontSize: 9, color: '#b9cfff', opacity: 0.5, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>{action.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </WidgetPanel>
  )
}

export default QuickActionsPanel
