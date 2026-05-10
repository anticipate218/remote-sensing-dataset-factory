import React, { useState, useEffect } from 'react'
import { WidgetPanel } from '../MFLayout'

interface GpuData {
  // 后端 /api/gpu-status 返回的扁平字段（与 backend/api/routes.py 对齐）
  available?: boolean
  gpu_name?: string
  memory_total_gb?: number
  memory_used_gb?: number
  memory_cached_gb?: number
  utilization_pct?: number
  // 可选：温度与功耗，后端目前未返回，保留接口以便未来扩展
  temperature?: number
  power_draw?: number
}

const SystemStatusPanel: React.FC = () => {
  const [gpu, setGpu] = useState<GpuData>({})

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/gpu-status')
        const data = await res.json()
        // 后端直接返回扁平结构，没有 .gpu_info 包装
        setGpu(data || {})
      } catch {
        setGpu({})
      }
    }
    fetchStatus()
    const timer = setInterval(fetchStatus, 10000)
    return () => clearInterval(timer)
  }, [])

  const gpuName = gpu.gpu_name?.replace('NVIDIA ', '') || 'N/A'
  const memTotal = gpu.memory_total_gb != null ? gpu.memory_total_gb.toFixed(1) : '--'
  const memUsed = gpu.memory_used_gb != null ? gpu.memory_used_gb.toFixed(1) : '--'
  const util = gpu.utilization_pct != null ? `${Math.round(gpu.utilization_pct)}` : '--'
  const temp = gpu.temperature != null ? `${gpu.temperature}` : '--'
  const power = gpu.power_draw != null ? `${Math.round(gpu.power_draw)}` : '--'
  const memPct = gpu.memory_total_gb && gpu.memory_used_gb ? (gpu.memory_used_gb / gpu.memory_total_gb * 100) : 0
  const isOnline = !!gpu.available

  return (
    <WidgetPanel title="系统状态监测" animationDelay={100}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* GPU header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', background: 'rgba(5, 50, 106, 0.5)', borderRadius: 6,
          border: '1px solid rgba(91, 199, 250, 0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fa-solid fa-microchip" style={{ color: '#74f7fd', fontSize: 14 }} />
            <span style={{ fontFamily: "'DouyuFont'", fontSize: 12, color: '#fff' }}>{gpuName}</span>
          </div>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 10,
            background: isOnline ? 'rgba(116, 250, 189, 0.15)' : 'rgba(255,77,79,0.15)',
            color: isOnline ? '#74fabd' : '#ff7875',
          }}>{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Metrics grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, flex: 1 }}>
          {[
            { label: 'VRAM', val: memTotal, unit: 'GB', icon: 'fa-memory' },
            { label: 'Util', val: util, unit: '%', icon: 'fa-gauge-high' },
            { label: 'Temp', val: temp, unit: '°C', icon: 'fa-temperature-half' },
            { label: 'Used', val: memUsed, unit: 'GB', icon: 'fa-server' },
            { label: 'Power', val: power, unit: 'W', icon: 'fa-bolt' },
            { label: 'Status', val: 'Active', unit: '', icon: 'fa-circle-check' },
          ].map((m) => (
            <div key={m.label} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(5, 50, 106, 0.35)', borderRadius: 5, padding: '4px 2px',
              border: '1px solid rgba(91, 199, 250, 0.08)', gap: 2,
            }}>
              <span style={{
                fontFamily: "'Source Serif 4', serif", fontSize: 9, letterSpacing: 1,
                textTransform: 'uppercase', color: '#b9cfff', opacity: 0.5,
              }}>{m.label}</span>
              <span style={{ fontFamily: "'DincorosBlack'", fontSize: 15, color: '#74f7fd', lineHeight: 1.1 }}>
                {m.val}
                {m.unit && <span style={{ fontSize: 9, color: '#b9cfff', opacity: 0.6, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', marginLeft: 1 }}>{m.unit}</span>}
              </span>
            </div>
          ))}
        </div>

        {/* VRAM usage bar */}
        <div style={{ padding: '0 4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#b9cfff', opacity: 0.5, marginBottom: 3 }}>
            <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>VRAM Usage</span>
            <span style={{ fontFamily: "'DincorosBlack'" }}>{memPct.toFixed(1)}%</span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${memPct}%`, borderRadius: 2,
              background: 'linear-gradient(90deg, #74fabd, #74f7fd)',
              boxShadow: '0 0 6px rgba(116,247,253,0.3)',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      </div>
    </WidgetPanel>
  )
}

export default SystemStatusPanel
