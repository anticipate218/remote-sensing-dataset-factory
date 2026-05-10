import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from 'antd'
import { useAppStore } from '../../stores/appStore'

interface FooterAction {
  label: string
  icon: string
  path: string
  /** 是否在點擊時重置數據集制作流程（語義為「新建」） */
  resetDataset?: boolean
}

const ACTIONS: FooterAction[] = [
  { label: '新建数据集', icon: 'fa-solid fa-plus-circle', path: '/dataset', resetDataset: true },
  { label: '数据预处理', icon: 'fa-solid fa-wand-magic-sparkles', path: '/preprocess' },
  { label: '下游任务', icon: 'fa-solid fa-rocket', path: '/tasks' },
  { label: '模型管理', icon: 'fa-solid fa-cubes', path: '/models' },
]

const DashboardFooter: React.FC = () => {
  const navigate = useNavigate()
  const reset = useAppStore((s) => s.reset)
  const currentStep = useAppStore((s) => s.currentStep)
  const uploadedFile = useAppStore((s) => s.uploadedFile)
  const batchFiles = useAppStore((s) => s.batchFiles)

  const handleAction = (action: FooterAction) => {
    if (!action.resetDataset) {
      navigate(action.path)
      return
    }
    // 「新建数据集」語義 = 開始全新會話。若有未完成的工作，先確認再丟棄。
    const hasInProgress = currentStep !== 'upload' || !!uploadedFile || (batchFiles?.length ?? 0) > 0
    if (hasInProgress) {
      Modal.confirm({
        title: '开始新的数据集？',
        content: '当前还有未完成的数据集会话，是否丢弃并新建？（标注与已生成的结果仍可在「下游任务」页面查看）',
        okText: '丢弃并新建',
        cancelText: '继续上一会话',
        onOk: () => {
          reset()
          navigate(action.path)
        },
        onCancel: () => {
          navigate(action.path)
        },
      })
    } else {
      reset()
      navigate(action.path)
    }
  }

  return (
    <footer
      style={{
        position: 'absolute',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 860,
        height: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        zIndex: 100,
        pointerEvents: 'auto',
      }}
    >
      {/* 底部裝飾線 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 40,
        right: 40,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(116, 247, 253, 0.3) 20%, rgba(116, 247, 253, 0.5) 50%, rgba(116, 247, 253, 0.3) 80%, transparent)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 8,
        height: 8,
        background: '#74f7fd',
        borderRadius: '50%',
        boxShadow: '0 0 10px #74f7fd, 0 0 20px rgba(116, 247, 253, 0.3)',
        pointerEvents: 'none',
      }} />

      {ACTIONS.map((action) => (
        <button
          key={action.path}
          onClick={() => handleAction(action)}
          style={{
            position: 'relative',
            background: 'linear-gradient(180deg, rgba(5, 50, 106, 0.7) 0%, rgba(2, 14, 31, 0.8) 100%)',
            border: '1px solid rgba(116, 247, 253, 0.2)',
            borderRadius: 6,
            padding: '12px 32px',
            fontFamily: "'DouyuFont', sans-serif",
            fontSize: 13,
            color: '#b9cfff',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(8px)',
            overflow: 'hidden',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#74f7fd'
            e.currentTarget.style.borderColor = 'rgba(116, 247, 253, 0.5)'
            e.currentTarget.style.boxShadow = '0 0 15px rgba(116, 247, 253, 0.2), inset 0 0 15px rgba(116, 247, 253, 0.05)'
            e.currentTarget.style.transform = 'translateY(-2px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#b9cfff'
            e.currentTarget.style.borderColor = 'rgba(116, 247, 253, 0.2)'
            e.currentTarget.style.boxShadow = 'none'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <i className={action.icon} style={{ fontSize: 14 }} />
          {action.label}
        </button>
      ))}
    </footer>
  )
}

export default DashboardFooter
