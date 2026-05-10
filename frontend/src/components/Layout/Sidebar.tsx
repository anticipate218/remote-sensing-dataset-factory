import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Tooltip } from 'antd'
import { useAppStore } from '../../stores/appStore'
import gridBg from '@/assets/images/mf/grid_bg.png'

interface SidebarProps {
  gpuInfo: { available: boolean; gpu_name?: string; memory_total_gb?: number; utilization_pct?: number }
}

const menuItems = [
  { key: '/', icon: 'fa-solid fa-gauge-high', label: '总览仪表板' },
  { key: '/dataset', icon: 'fa-solid fa-layer-group', label: '数据集制作' },
  { key: '/preprocess', icon: 'fa-solid fa-sliders', label: '数据预处理' },
  { key: '/tasks', icon: 'fa-solid fa-rocket', label: '下游任务' },
  { key: '/models', icon: 'fa-solid fa-cubes', label: '模型管理' },
  { key: '/api-docs', icon: 'fa-solid fa-code', label: 'API 文档' },
]

const Sidebar: React.FC<SidebarProps> = ({ gpuInfo }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const { user } = useAppStore()

  const activeKey = menuItems.find((m) => {
    if (m.key === '/') return location.pathname === '/'
    return location.pathname.startsWith(m.key)
  })?.key || '/'

  const width = collapsed ? 64 : 220

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width,
        zIndex: 100,
        background: `rgba(5, 50, 106, 0.88) url(${gridBg})`,
        backgroundSize: '40px 40px',
        borderRight: '1px solid rgba(116, 247, 253, 0.12)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.25s ease',
        overflow: 'hidden',
        fontFamily: "'SarasaMonoSC', monospace",
      }}
    >
      {/* Logo */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? 0 : '0 16px',
          borderBottom: '1px solid rgba(91, 199, 250, 0.12)',
          cursor: 'pointer',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(116, 247, 253, 0.2), rgba(116, 250, 189, 0.2))',
            border: '1px solid rgba(116, 247, 253, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <i className="fa-solid fa-satellite-dish" style={{ color: '#74f7fd', fontSize: 14 }} />
        </div>
        {!collapsed && (
          <span style={{ color: '#74f7fd', fontSize: 14, fontFamily: "'DouyuFont'", whiteSpace: 'nowrap' }}>
            RS Factory
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        {menuItems.map((item) => {
          const isActive = item.key === activeKey
          return (
            <Tooltip key={item.key} title={collapsed ? item.label : ''} placement="right">
              <div
                onClick={() => navigate(item.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: collapsed ? '12px 0' : '12px 16px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  margin: '2px 6px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  background: isActive ? 'rgba(116, 247, 253, 0.1)' : 'transparent',
                  borderLeft: isActive ? '3px solid #74f7fd' : '3px solid transparent',
                  color: isActive ? '#74f7fd' : 'rgba(185, 207, 255, 0.7)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(116, 247, 253, 0.06)'
                    e.currentTarget.style.color = '#5bc7fa'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'rgba(185, 207, 255, 0.7)'
                  }
                }}
              >
                <i className={item.icon} style={{ fontSize: 16, width: 20, textAlign: 'center' }} />
                {!collapsed && <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{item.label}</span>}
              </div>
            </Tooltip>
          )
        })}
      </nav>

      {/* Bottom: GPU + User */}
      <div
        style={{
          padding: collapsed ? '12px 8px' : '12px 16px',
          borderTop: '1px solid rgba(91, 199, 250, 0.12)',
        }}
      >
        {!collapsed ? (
          <>
            <div
              style={{
                width: '100%',
                textAlign: 'center',
                marginBottom: 8,
                fontSize: 11,
                padding: '4px 0',
                borderRadius: 4,
                background: gpuInfo.available
                  ? 'rgba(116, 247, 253, 0.1)'
                  : 'rgba(255, 255, 255, 0.05)',
                color: gpuInfo.available ? '#74f7fd' : '#666',
                border: `1px solid ${gpuInfo.available ? 'rgba(116, 247, 253, 0.25)' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              <i className="fa-solid fa-microchip" style={{ marginRight: 6 }} />
              {gpuInfo.available ? `GPU ${gpuInfo.memory_total_gb || ''}GB` : 'GPU N/A'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa-solid fa-user" style={{ color: '#5bc7fa', fontSize: 13 }} />
              <span style={{ color: 'rgba(185, 207, 255, 0.6)', fontSize: 12 }}>
                {user?.username || '用户'}
              </span>
            </div>
          </>
        ) : (
          <Tooltip title={gpuInfo.available ? `GPU: ${gpuInfo.gpu_name}` : 'GPU N/A'} placement="right">
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: gpuInfo.available ? '#74fabd' : '#666',
                  margin: '0 auto',
                  boxShadow: gpuInfo.available ? '0 0 8px rgba(116, 250, 189, 0.5)' : 'none',
                }}
              />
            </div>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

export default Sidebar
