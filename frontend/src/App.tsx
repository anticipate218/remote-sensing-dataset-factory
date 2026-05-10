import React, { Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Layout, Spin, message } from 'antd'
import { AnimatePresence, motion } from 'framer-motion'
import Header from './components/Layout/Header'
import Sidebar from './components/Layout/Sidebar'
import StepIndicator from './components/Layout/StepIndicator'
import LoginPage from './components/Auth/LoginPage'
import UploadZone from './components/Upload/UploadZone'
import ClassEditor from './components/ClassEditor/ClassEditor'
import PredictionView from './components/Prediction/PredictionView'
import { AnnotationEditor } from './components/Annotation'
import ConfirmView from './components/Confirm/ConfirmView'
import ExportView from './components/Export/ExportView'
import PreprocessPageComponent from './components/Preprocess/PreprocessPage'
import ApiDocsPage from './components/ApiDocs/ApiDocsPage'
import TasksPageComponent from './components/Tasks/TasksPage'
import ModelsPageComponent from './components/Models/ModelsPage'
import LandingPageComponent from './components/Home/LandingPage'
import AIAssistant from './components/AIAssistant/AIAssistant'
import { useAppStore } from './stores/appStore'
import axios from 'axios'

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAppStore()
  const token = localStorage.getItem('token')
  if (!user && !token) return <Navigate to="/login" replace />
  return <>{children}</>
}

const { Content } = Layout

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2 } },
}

const PageLoader: React.FC = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
  }}>
    <Spin size="large" />
  </div>
)

const AnnotationView: React.FC = () => {
  const {
    currentTask, setCurrentStep, markStepCompleted, setCurrentTask,
    selectedBatchFileIds, activeBatchFileId, setActiveBatchFileId,
  } = useAppStore()
  const taskId = currentTask?.task_id
  // 是否处于"批量精修"上下文（用户从批量列表点进来的）
  const isInBatchContext = selectedBatchFileIds.length > 1 && activeBatchFileId !== null

  // 监听 AI 触发的任务切换（用于 ai-rerun 完成后切到新任务）
  useEffect(() => {
    const handler = async (e: any) => {
      const newTaskId = e?.detail?.taskId
      if (!newTaskId || !currentTask) return
      try {
        const r = await axios.get(`/api/tasks/${newTaskId}`)
        setCurrentTask(r.data)
        message.info(`已切换到新任务 ${newTaskId}`)
      } catch (err) {
        console.error('Switch task failed:', err)
      }
    }
    window.addEventListener('rs:switch-task', handler as EventListener)
    return () => window.removeEventListener('rs:switch-task', handler as EventListener)
  }, [currentTask, setCurrentTask])

  if (!taskId) return <div style={{ color: '#b9cfff', padding: 40, textAlign: 'center' }}>请先完成预测步骤</div>

  const originalUrl = `/api/prediction/${taskId}/original`
  const maskUrl = `/api/prediction/${taskId}/mask`

  const handleSave = async (maskDataUrl: string) => {
    const hide = message.loading('正在保存标注...', 0)
    try {
      const blob = await (await fetch(maskDataUrl)).blob()
      const formData = new FormData()
      formData.append('mask', blob, 'mask.png')
      await axios.post(`/api/annotation/${taskId}/save`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      hide()
      markStepCompleted('annotate')
      if (isInBatchContext) {
        // 批量上下文：保存后返回批量列表，让用户继续审查下一张
        message.success('已保存，已返回批量列表')
        setActiveBatchFileId(null)
        setCurrentStep('predict')
      } else {
        message.success('标注已保存，进入确认结果步骤')
        setCurrentStep('confirm')
      }
    } catch (err: any) {
      hide()
      const detail = err?.response?.data?.detail || err?.message || String(err)
      console.error('Save annotation failed:', err)
      message.error(`保存标注失败: ${detail}`)
    }
  }

  return (
    <>
      {isInBatchContext && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 50,
          padding: '8px 16px',
          background: 'linear-gradient(90deg, rgba(0,240,255,0.12), rgba(82,196,26,0.08))',
          borderBottom: '1px solid rgba(0,240,255,0.3)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ color: '#74f7fd', fontSize: 13, fontWeight: 600 }}>
            ⓘ 批量精修模式 · 当前正在编辑批次中的一张
          </span>
          <button
            onClick={() => { setActiveBatchFileId(null); setCurrentStep('predict'); }}
            style={{
              marginLeft: 'auto',
              padding: '4px 14px',
              borderRadius: 6,
              border: '1px solid rgba(116,247,253,0.4)',
              background: 'rgba(0,0,0,0.3)',
              color: '#74f7fd',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(116,247,253,0.15)' }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'rgba(0,0,0,0.3)' }}
          >
            ← 返回批量列表
          </button>
        </div>
      )}
      <AnnotationEditor originalImageUrl={originalUrl} maskImageUrl={maskUrl} taskId={taskId} onSave={handleSave} />
    </>
  )
}

const DatasetWorkflow: React.FC = () => {
  const location = useLocation()
  const { currentStep, setCurrentStep, setUploadedFile, setCurrentTask, setClasses, setPredictionMask } = useAppStore()

  // 支援透過 URL 參數恢復進度（分享連結 / 跨設備繼續工作）：
  //   /dataset?step=annotate&task=<task_id>
  //   /dataset?step=configure&file=<file_id>
  // 已存在的本地會話有更高優先級，避免覆蓋用戶當前未保存的進度。
  React.useEffect(() => {
    const sp = new URLSearchParams(location.search)
    const step = sp.get('step') as any
    const taskId = sp.get('task')
    const fileId = sp.get('file')
    if (!step) return
    const validSteps = ['upload', 'configure', 'predict', 'annotate', 'confirm', 'export']
    if (!validSteps.includes(step)) return
    ;(async () => {
      try {
        if (taskId) {
          const r = await axios.get(`/api/tasks/${taskId}`)
          const t = r.data
          setCurrentTask({ task_id: taskId, status: t.status, progress: t.progress || 100, result: t.result })
          // 类别可能直接在 t.classes，也可能是 result.classes（仅是字符串数组，需要补 prompt + color）
          const rawClasses = t.classes || t.result?.classes
          if (Array.isArray(rawClasses) && rawClasses.length > 0) {
            const palette: number[][] = t.result?.palette || []
            // 后端 class[0] 通常是 "background"，前端类别列表不需要它
            // ConfirmView 等组件期望 color 为 [r,g,b] 数字数组，AnnotationEditor 接受字符串
            const classObjs = rawClasses
              .map((c: any, i: number) => {
                if (typeof c === 'object' && c?.name) return c
                const color = palette[i] && palette[i].length === 3 ? palette[i] : [116, 247, 253]
                return { name: c, prompt: c, color, id: `cls-${i}` }
              })
              .filter((c: any) => c.name && c.name.toLowerCase() !== 'background')
            setClasses(classObjs)
          }
          // file_id 优先用 task.file_id；否则尝试从 original_path 反推（后端历史 task 没记 file_id）
          let fid: string | null = t.file_id || null
          if (!fid && t.result?.original_path) {
            const m = String(t.result.original_path).match(/prediction_([0-9a-f]+)/i)
            if (m) fid = m[1]
          }
          if (fid) {
            try {
              const fr = await axios.get(`/api/uploads`, { params: { limit: 500 } })
              const f = (fr.data.items || []).find((x: any) => x.file_id === fid)
              if (f) setUploadedFile({ file_id: f.file_id, filename: f.filename, width: f.width, height: f.height, preview_url: f.preview_url })
            } catch { /* 静默：上传查询失败不影响主流程 */ }
          }
          // 预填 predictionMask 让 ConfirmView 能直接显示叠加图
          if (t.result?.color_mask_path || t.result?.mask_path) {
            setPredictionMask(`/api/prediction/${taskId}/mask?ts=${Date.now()}`)
          }
        } else if (fileId) {
          const fr = await axios.get(`/api/uploads`, { params: { limit: 500 } })
          const f = (fr.data.items || []).find((x: any) => x.file_id === fileId)
          if (f) setUploadedFile({ file_id: f.file_id, filename: f.filename, width: f.width, height: f.height, preview_url: f.preview_url })
        }
        setCurrentStep(step)
      } catch (e) {
        // 静默失败（404 等都用默认 upload 步骤）
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search])

  const renderContent = () => {
    switch (currentStep) {
      case 'upload': return <UploadZone />
      case 'configure': return <ClassEditor />
      case 'predict': return <PredictionView />
      case 'annotate': return <AnnotationView />
      case 'confirm': return <ConfirmView />
      case 'export': return <ExportView />
      default: return <UploadZone />
    }
  }

  return (
    <>
      <StepIndicator />
      <AnimatePresence mode="wait">
        <motion.div key={currentStep} variants={pageVariants} initial="initial" animate="animate" exit="exit">
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </>
  )
}

const App: React.FC = () => {
  const location = useLocation()
  const { setCurrentRoute } = useAppStore()
  const [gpuInfo, setGpuInfo] = useState<any>({ available: false })
  const isLoginPage = location.pathname === '/login'
  const isHomePage = location.pathname === '/'
  const showChrome = !isLoginPage && !isHomePage
  const sidebarWidth = showChrome ? 220 : 0

  useEffect(() => {
    const path = location.pathname as any
    if (['/', '/dataset', '/preprocess', '/tasks', '/api-docs', '/models'].includes(path)) {
      setCurrentRoute(path)
    }
  }, [location.pathname, setCurrentRoute])

  useEffect(() => {
    axios.get('/api/gpu-status').then((r) => setGpuInfo(r.data)).catch(() => {})
  }, [])

  return (
    <Layout
      style={{
        minHeight: '100vh',
        background: '#000',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Sidebar (non-login, non-home pages) */}
      {showChrome && <Sidebar gpuInfo={gpuInfo} />}

      {/* MF-style background for functional pages */}
      {showChrome && (
        <>
          {/* Satellite map background */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 0,
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
          >
            <img
              src="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/6/13"
              alt=""
              style={{
                position: 'absolute',
                top: '-20%',
                left: '-10%',
                width: '120%',
                height: '140%',
                objectFit: 'cover',
                opacity: 0.12,
                filter: 'blur(2px) saturate(0.6)',
              }}
            />
            <div style={{ position: 'absolute', inset: 0, background: '#020e1f', opacity: 0.75 }} />
          </div>

          {/* Grid overlay */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 0,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `
                  linear-gradient(rgba(91, 199, 250, 0.04) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(91, 199, 250, 0.04) 1px, transparent 1px)
                `,
                backgroundSize: '40px 40px',
              }}
            />
            {/* Subtle coordinate ticks on edges */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `
                  linear-gradient(rgba(116, 247, 253, 0.03) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(116, 247, 253, 0.03) 1px, transparent 1px)
                `,
                backgroundSize: '200px 200px',
              }}
            />
          </div>

          {/* Vignette */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: `
                radial-gradient(ellipse at center, transparent 25%, rgba(2,14,31,0.5) 70%, rgba(2,14,31,0.85) 100%),
                linear-gradient(180deg, rgba(2,14,31,0.4) 0%, transparent 5%, transparent 95%, rgba(2,14,31,0.4) 100%)
              `,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />

          {/* Academic corner info */}
          <div style={{
            position: 'fixed', bottom: 12, right: 12, zIndex: 2, pointerEvents: 'none',
            display: 'flex', gap: 12, alignItems: 'center',
            padding: '4px 12px',
            background: 'rgba(2, 14, 31, 0.7)',
            border: '1px solid rgba(116, 247, 253, 0.1)',
            borderRadius: 6,
            backdropFilter: 'blur(8px)',
          }}>
            <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 9, color: '#b9cfff', opacity: 0.4, letterSpacing: 1 }}>
              CRS: EPSG:4326
            </span>
            <span style={{ width: 1, height: 10, background: 'rgba(116,247,253,0.1)' }} />
            <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 9, color: '#b9cfff', opacity: 0.4 }}>
              RS Dataset Factory v1.0
            </span>
          </div>
        </>
      )}

      {/* Header (non-login, non-home) */}
      {showChrome && <Header gpuInfo={gpuInfo} sidebarWidth={sidebarWidth} />}

      {/* AI Assistant (non-login) */}
      {!isLoginPage && <AIAssistant />}

      <Content
        style={{
          marginLeft: sidebarWidth,
          padding: showChrome ? '0 24px' : 0,
          position: 'relative',
          zIndex: 10,
          marginTop: showChrome ? 64 : 0,
          transition: 'margin-left 0.25s ease',
        }}
      >
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <LandingPageComponent />
                </PrivateRoute>
              }
            />
            <Route
              path="/dataset"
              element={
                <PrivateRoute>
                  <DatasetWorkflow />
                </PrivateRoute>
              }
            />
            <Route
              path="/preprocess"
              element={
                <PrivateRoute>
                  <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                    <PreprocessPageComponent />
                  </motion.div>
                </PrivateRoute>
              }
            />
            <Route
              path="/tasks"
              element={
                <PrivateRoute>
                  <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                    <TasksPageComponent />
                  </motion.div>
                </PrivateRoute>
              }
            />
            <Route
              path="/models"
              element={
                <PrivateRoute>
                  <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                    <ModelsPageComponent />
                  </motion.div>
                </PrivateRoute>
              }
            />
            <Route path="/api-docs" element={<PrivateRoute><ApiDocsPage /></PrivateRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Content>
    </Layout>
  )
}

export default App
