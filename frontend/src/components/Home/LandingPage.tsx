import React, { useEffect, useState, lazy, Suspense } from 'react'
import { DashboardLayout } from '../MFLayout'
import {
  SystemStatusPanel,
  DatasetStatsPanel,
  FormatOverviewPanel,
  ModelStatusPanel,
  RecentTasksPanel,
  QuickActionsPanel,
} from '../DashboardPanels'
import { useAppStore } from '@/stores/appStore'

const CenterMapView = lazy(() => import('../DashboardPanels/CenterMapView'))

const LandingPage: React.FC = () => {
  const user = useAppStore((s) => s.user)
  const [gpuInfo, setGpuInfo] = useState('')

  useEffect(() => {
    fetch('/api/gpu-status')
      .then((r) => r.json())
      .then((data) => {
        const gpu = data.gpu_info || {}
        if (gpu.name) {
          const mem = gpu.memory_total ? `${(gpu.memory_total / 1024).toFixed(1)}GB` : ''
          setGpuInfo(`${gpu.name} · ${mem}`)
        }
      })
      .catch(() => setGpuInfo('GPU Ready'))
  }, [])

  return (
    <DashboardLayout
      gpuInfo={gpuInfo}
      username={user?.username || 'User'}
      leftPanels={[
        <SystemStatusPanel key="status" />,
        <DatasetStatsPanel key="stats" />,
        <FormatOverviewPanel key="format" />,
      ]}
      rightPanels={[
        <ModelStatusPanel key="models" />,
        <RecentTasksPanel key="tasks" />,
        <QuickActionsPanel key="actions" />,
      ]}
      centerContent={
        <Suspense fallback={
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="loading-spinner" />
          </div>
        }>
          <CenterMapView />
        </Suspense>
      }
    />
  )
}

export default LandingPage
