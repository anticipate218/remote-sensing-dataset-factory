import React from 'react'
import DashboardHeader from './DashboardHeader'
import DashboardFooter from './DashboardFooter'

interface DashboardLayoutProps {
  leftPanels?: [React.ReactNode, React.ReactNode, React.ReactNode]
  rightPanels?: [React.ReactNode, React.ReactNode, React.ReactNode]
  centerContent?: React.ReactNode
  gpuInfo?: string
  username?: string
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  leftPanels,
  rightPanels,
  centerContent,
  gpuInfo,
  username,
}) => {
  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <DashboardHeader gpuInfo={gpuInfo} username={username} />

      <div
        style={{
          flex: 1,
          position: 'relative',
          background: '#020e1f',
          overflow: 'hidden',
        }}
      >
        {/* Center map / content (fills the entire area behind panels) */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
          {centerContent}
        </div>

        {/* Subtle grid overlay on top of map */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `
                linear-gradient(rgba(91, 199, 250, 0.04) 1px, transparent 1px),
                linear-gradient(90deg, rgba(91, 199, 250, 0.04) 1px, transparent 1px)
              `,
              backgroundSize: '48px 48px',
            }}
          />
        </div>

        {/* Scan line */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3, overflow: 'hidden' }}>
          <div className="dash-scan-line" />
        </div>

        {/* Corner brackets */}
        {[0, 1, 2, 3].map((idx) => {
          const corners = [
            { top: 6, left: 440 },
            { top: 6, right: 440 },
            { bottom: 90, left: 440 },
            { bottom: 90, right: 440 },
          ]
          const paths = [
            'M0 10 L0 0 L10 0',
            'M18 10 L18 0 L8 0',
            'M0 8 L0 18 L10 18',
            'M18 8 L18 18 L8 18',
          ]
          const pos = corners[idx] as React.CSSProperties
          return (
            <svg key={idx} style={{ position: 'absolute', ...pos, width: 18, height: 18, pointerEvents: 'none', zIndex: 4 }}>
              <path d={paths[idx]} fill="none" stroke="#74f7fd" strokeWidth="1.5" opacity="0.4" />
            </svg>
          )
        })}

        {/* Left panels */}
        <div style={{
          position: 'absolute', top: 10, left: 10, width: 420, bottom: 90, zIndex: 10,
          display: 'grid', gridTemplateRows: 'repeat(3, 1fr)', gap: 12, pointerEvents: 'auto',
        }}>
          {leftPanels?.[0]}
          {leftPanels?.[1]}
          {leftPanels?.[2]}
        </div>

        {/* Right panels */}
        <div style={{
          position: 'absolute', top: 10, right: 10, width: 420, bottom: 90, zIndex: 10,
          display: 'grid', gridTemplateRows: 'repeat(3, 1fr)', gap: 12, pointerEvents: 'auto',
        }}>
          {rightPanels?.[0]}
          {rightPanels?.[1]}
          {rightPanels?.[2]}
        </div>

        <DashboardFooter />
      </div>

      <style>{`
        .dash-scan-line {
          position: absolute;
          left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(116,247,253,0.3) 20%, rgba(116,247,253,0.5) 50%, rgba(116,247,253,0.3) 80%, transparent);
          box-shadow: 0 0 6px rgba(116,247,253,0.15);
          animation: dashScan 10s linear infinite;
        }
        @keyframes dashScan {
          0% { top: -2px; opacity: 0; }
          3% { opacity: 1; }
          97% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  )
}

export default DashboardLayout
