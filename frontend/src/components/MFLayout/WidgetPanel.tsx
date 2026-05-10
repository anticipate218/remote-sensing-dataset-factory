import React from 'react'
import panelBodyBg from '@/assets/images/mf/panel_body_bg.png'
import panelTitleBg from '@/assets/images/mf/panel_title_bg.png'

interface WidgetPanelProps {
  title?: string
  className?: string
  children: React.ReactNode
  animationDelay?: number
  style?: React.CSSProperties
  bodyStyle?: React.CSSProperties
}

const WidgetPanel: React.FC<WidgetPanelProps> = ({
  title,
  className = '',
  children,
  animationDelay = 0,
  style,
  bodyStyle,
}) => {
  return (
    <div
      className={`animate__animated animate__bounceIn ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundImage: `url(${panelBodyBg})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        display: 'flex',
        flexDirection: 'column',
        animationDelay: `${animationDelay}ms`,
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            position: 'relative',
            height: 42,
            minHeight: 42,
            backgroundImage: `url(${panelTitleBg})`,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: -12,
              left: 70,
              fontFamily: "'DouyuFont', sans-serif",
              fontSize: 16,
              color: '#fff',
              whiteSpace: 'nowrap',
              textShadow: '0 0 10px rgba(116, 247, 253, 0.5)',
            }}
          >
            {title}
          </span>
        </div>
      )}
      <div
        style={{
          flex: 1,
          padding: '12px 16px',
          overflow: 'hidden',
          ...bodyStyle,
        }}
      >
        {children}
      </div>
    </div>
  )
}

export default WidgetPanel
