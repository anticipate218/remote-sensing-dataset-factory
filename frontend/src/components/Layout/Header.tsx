import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Dropdown, Avatar, Space, Typography } from 'antd'
import { useAppStore } from '../../stores/appStore'
import titleBg from '@/assets/images/mf/title_bg.png'

const { Text } = Typography

interface HeaderProps {
  gpuInfo: { available: boolean; gpu_name?: string; memory_total_gb?: number; utilization_pct?: number }
  sidebarWidth: number
}

const Header: React.FC<HeaderProps> = ({ gpuInfo, sidebarWidth }) => {
  const navigate = useNavigate()
  const { user, logout } = useAppStore()
  const username = user?.username || '用户'
  const avatarLetter = username.charAt(0).toUpperCase()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const dropdownItems = {
    items: [
      {
        key: 'profile',
        icon: <i className="fa-solid fa-user" style={{ marginRight: 4, color: '#5bc7fa' }} />,
        label: <span style={{ color: 'rgba(185, 207, 255, 0.5)' }}>个人信息</span>,
        disabled: true,
      },
      { type: 'divider' as const },
      {
        key: 'logout',
        icon: <i className="fa-solid fa-right-from-bracket" style={{ marginRight: 4, color: '#ff4444' }} />,
        label: <span style={{ color: '#ff4444' }}>退出登录</span>,
        onClick: handleLogout,
      },
    ],
  }

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: sidebarWidth,
        right: 0,
        height: 56,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        backgroundImage: `url(${titleBg})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        transition: 'left 0.25s ease',
      }}
    >
      <span
        style={{
          fontFamily: "'DouyuFont', sans-serif",
          fontSize: 18,
          background: 'linear-gradient(180deg, #b9cfff 0%, #ffffff 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          letterSpacing: 4,
        }}
      >
        遥感数据集智能制作平台
      </span>

      <Space size={16} align="center">
        {gpuInfo.available && (
          <span
            style={{
              fontSize: 11,
              padding: '4px 12px',
              borderRadius: 4,
              background: 'rgba(116, 247, 253, 0.1)',
              border: '1px solid rgba(116, 247, 253, 0.25)',
              color: '#74f7fd',
            }}
          >
            <i className="fa-solid fa-microchip" style={{ marginRight: 6 }} />
            {gpuInfo.gpu_name} · {gpuInfo.memory_total_gb}GB
          </span>
        )}

        <Dropdown
          menu={dropdownItems}
          trigger={['click']}
          placement="bottomRight"
          dropdownRender={(menu) => (
            <div
              style={{
                background: 'rgba(10, 40, 80, 0.96)',
                borderRadius: 8,
                border: '1px solid rgba(116, 247, 253, 0.15)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                overflow: 'hidden',
              }}
            >
              {menu}
            </div>
          )}
        >
          <Space
            style={{
              cursor: 'pointer',
              padding: '4px 10px',
              borderRadius: 6,
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(116, 247, 253, 0.06)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
          >
            <Avatar
              size={28}
              style={{
                background: 'linear-gradient(135deg, #74f7fd, #74fabd)',
                color: '#000',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {avatarLetter}
            </Avatar>
            <Text style={{ color: '#b9cfff', fontSize: 13 }}>{username}</Text>
            <i className="fa-solid fa-chevron-down" style={{ color: 'rgba(185, 207, 255, 0.4)', fontSize: 10 }} />
          </Space>
        </Dropdown>
      </Space>
    </header>
  )
}

export default Header
