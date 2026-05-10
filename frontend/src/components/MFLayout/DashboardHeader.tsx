import React, { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import titleBg from '@/assets/images/mf/title_bg.png'
import lightBg from '@/assets/images/mf/light_bg.png'

interface DashboardHeaderProps {
  gpuInfo?: string
  username?: string
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ gpuInfo, username }) => {
  const [now, setNow] = useState(dayjs())

  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header
      style={{
        position: 'relative',
        width: '100%',
        height: 80,
        backgroundImage: `url(${titleBg})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        overflow: 'hidden',
      }}
    >
      {/* 光帶動畫 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '-100%',
          width: '100%',
          height: '100%',
          backgroundImage: `url(${lightBg})`,
          backgroundSize: 'auto 100%',
          backgroundRepeat: 'no-repeat',
          animation: 'lightGo 4s linear infinite',
          pointerEvents: 'none',
        }}
      />

      {/* 左側跑馬燈通知 */}
      <div
        style={{
          position: 'absolute',
          left: 20,
          top: '50%',
          transform: 'translateY(-50%)',
          maxWidth: 350,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          fontSize: 13,
          color: 'rgba(185, 207, 255, 0.7)',
        }}
      >
        <i className="fa-solid fa-envelope" style={{ marginRight: 8, color: '#74f7fd' }} />
        <span
          style={{
            display: 'inline-block',
            animation: 'textRoll 20s linear infinite',
          }}
        >
          欢迎使用遥感数据集智能制作平台 · RS Dataset Factory · 基于 SAM3/PRISM 的语义分割数据集生成系统
        </span>
      </div>

      {/* 中央標題 */}
      <div style={{ textAlign: 'center', userSelect: 'none' }}>
        <h1
          style={{
            fontFamily: "'DouyuFont', sans-serif",
            fontSize: 26,
            letterSpacing: 8,
            background: 'linear-gradient(180deg, #b9cfff 0%, #ffffff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          遥感数据集智能制作平台
        </h1>
        <div style={{
          fontFamily: "'Source Serif 4', 'Noto Serif SC', serif",
          fontSize: 11,
          letterSpacing: 3,
          color: 'rgba(185, 207, 255, 0.5)',
          marginTop: 2,
          fontStyle: 'italic',
        }}>
          Remote Sensing Dataset Factory — SAM3 / PRISM
        </div>
      </div>

      {/* 右側資訊 */}
      <div
        style={{
          position: 'absolute',
          right: 20,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          fontSize: 13,
          color: '#b9cfff',
          fontFamily: "'SarasaMonoSC', monospace",
        }}
      >
        {gpuInfo && (
          <span style={{ color: '#74fabd', fontSize: 12 }}>
            <i className="fa-solid fa-microchip" style={{ marginRight: 6 }} />
            {gpuInfo}
          </span>
        )}
        {username && (
          <span style={{ color: '#5bc7fa' }}>
            <i className="fa-solid fa-user" style={{ marginRight: 6 }} />
            {username}
          </span>
        )}
        <span>
          {now.format('HH:mm:ss')}
        </span>
        <span>
          {now.format('MM/DD/YYYY')} {WEEKDAYS[now.day()]}
        </span>
      </div>
    </header>
  )
}

export default DashboardHeader
