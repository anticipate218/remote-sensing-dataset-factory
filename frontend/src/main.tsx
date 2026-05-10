import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, theme } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import zhCN from 'antd/locale/zh_CN'
import App from './App'

import 'animate.css'
import '@/assets/fonts/DouyuFont/result.css'
import '@/assets/fonts/SarasaMonoSC/result.css'
import '@/assets/fonts/DincorosBlack/result.css'
import '@/assets/fontawesome/css/all.css'
import './styles/global.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

const mfDarkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#74f7fd',
    colorPrimaryHover: '#5bc7fa',
    colorPrimaryActive: '#5fb9c7',

    colorBgBase: '#000000',
    colorBgContainer: 'rgba(5, 50, 106, 0.6)',
    colorBgElevated: 'rgba(10, 40, 80, 0.95)',
    colorBgSpotlight: 'rgba(116, 247, 253, 0.08)',
    colorBgLayout: '#000000',

    colorBorder: 'rgba(91, 199, 250, 0.15)',
    colorBorderSecondary: 'rgba(91, 199, 250, 0.08)',

    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 4,
    borderRadiusXS: 2,

    fontFamily: "'SarasaMonoSC', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
    fontFamilyCode: "'SarasaMonoSC', 'JetBrains Mono', Consolas, monospace",
    fontSize: 14,

    colorText: '#ffffff',
    colorTextSecondary: '#b9cfff',
    colorTextTertiary: 'rgba(185, 207, 255, 0.6)',
    colorTextQuaternary: 'rgba(185, 207, 255, 0.4)',

    colorSuccess: '#74fabd',
    colorWarning: '#f0c040',
    colorError: '#ff4444',
    colorInfo: '#74f7fd',

    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
    boxShadowSecondary: '0 8px 32px rgba(116, 247, 253, 0.08)',

    colorLink: '#74f7fd',
    colorLinkHover: '#5bc7fa',

    controlHeight: 40,
    controlHeightLG: 48,
    controlHeightSM: 32,

    motionDurationFast: '0.15s',
    motionDurationMid: '0.3s',
    motionDurationSlow: '0.5s',
  },
  components: {
    Layout: {
      headerBg: 'transparent',
      bodyBg: 'transparent',
      siderBg: 'rgba(5, 50, 106, 0.85)',
      footerBg: 'transparent',
    },
    Card: {
      colorBgContainer: 'rgba(5, 50, 106, 0.5)',
      colorBorderSecondary: 'rgba(116, 247, 253, 0.1)',
      paddingLG: 24,
    },
    Button: {
      primaryShadow: '0 4px 16px rgba(116, 247, 253, 0.25)',
      defaultBorderColor: 'rgba(116, 247, 253, 0.25)',
      defaultColor: '#74f7fd',
      defaultBg: 'rgba(5, 50, 106, 0.5)',
      defaultHoverBg: 'rgba(116, 247, 253, 0.12)',
      defaultHoverBorderColor: '#74f7fd',
      defaultHoverColor: '#74f7fd',
      ghostBg: 'transparent',
      textHoverBg: 'rgba(116, 247, 253, 0.08)',
      borderRadiusLG: 8,
      borderRadiusSM: 4,
    },
    Input: {
      colorBgContainer: 'rgba(5, 50, 106, 0.5)',
      colorBorder: 'rgba(91, 199, 250, 0.15)',
      hoverBorderColor: 'rgba(116, 247, 253, 0.4)',
      activeBorderColor: '#74f7fd',
      activeShadow: '0 0 0 2px rgba(116, 247, 253, 0.12)',
      addonBg: 'rgba(5, 50, 106, 0.7)',
    },
    InputNumber: {
      colorBgContainer: 'rgba(5, 50, 106, 0.5)',
      colorBorder: 'rgba(91, 199, 250, 0.15)',
      hoverBorderColor: 'rgba(116, 247, 253, 0.4)',
      activeBorderColor: '#74f7fd',
    },
    Select: {
      colorBgContainer: 'rgba(5, 50, 106, 0.5)',
      colorBorder: 'rgba(91, 199, 250, 0.15)',
      optionSelectedBg: 'rgba(116, 247, 253, 0.12)',
      optionActiveBg: 'rgba(116, 247, 253, 0.08)',
      selectorBg: 'rgba(5, 50, 106, 0.5)',
    },
    Menu: {
      darkItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(116, 247, 253, 0.1)',
      darkItemHoverBg: 'rgba(116, 247, 253, 0.06)',
      darkItemColor: 'rgba(185, 207, 255, 0.75)',
      darkItemSelectedColor: '#74f7fd',
      darkSubMenuItemBg: 'rgba(0, 0, 0, 0.2)',
      itemBorderRadius: 6,
    },
    Table: {
      colorBgContainer: 'rgba(5, 50, 106, 0.4)',
      headerBg: 'rgba(5, 50, 106, 0.6)',
      headerColor: '#b9cfff',
      rowHoverBg: 'rgba(116, 247, 253, 0.05)',
      borderColor: 'rgba(91, 199, 250, 0.08)',
    },
    Modal: {
      contentBg: 'rgba(10, 40, 80, 0.98)',
      headerBg: 'transparent',
      titleColor: '#ffffff',
    },
    Drawer: {
      colorBgElevated: 'rgba(10, 40, 80, 0.98)',
    },
    Tooltip: {
      colorBgSpotlight: 'rgba(10, 40, 80, 0.95)',
      colorTextLightSolid: '#ffffff',
    },
    Progress: {
      defaultColor: '#74f7fd',
      remainingColor: 'rgba(116, 247, 253, 0.12)',
    },
    Slider: {
      railBg: 'rgba(5, 50, 106, 0.8)',
      railHoverBg: 'rgba(5, 50, 106, 1)',
      trackBg: '#74f7fd',
      trackHoverBg: '#5bc7fa',
      handleColor: '#74f7fd',
      handleActiveColor: '#5bc7fa',
    },
    Switch: {
      colorPrimary: '#74f7fd',
      colorPrimaryHover: '#5bc7fa',
    },
    Tabs: {
      inkBarColor: '#74f7fd',
      itemSelectedColor: '#74f7fd',
      itemHoverColor: '#5bc7fa',
      itemColor: 'rgba(185, 207, 255, 0.65)',
      cardBg: 'rgba(5, 50, 106, 0.5)',
    },
    Tag: {
      defaultBg: 'rgba(116, 247, 253, 0.1)',
      defaultColor: '#74f7fd',
    },
    Alert: {
      colorInfoBg: 'rgba(116, 247, 253, 0.08)',
      colorInfoBorder: 'rgba(116, 247, 253, 0.25)',
      colorSuccessBg: 'rgba(116, 250, 189, 0.08)',
      colorSuccessBorder: 'rgba(116, 250, 189, 0.25)',
      colorWarningBg: 'rgba(240, 192, 64, 0.08)',
      colorWarningBorder: 'rgba(240, 192, 64, 0.25)',
      colorErrorBg: 'rgba(255, 68, 68, 0.08)',
      colorErrorBorder: 'rgba(255, 68, 68, 0.25)',
    },
    Upload: {
      colorBorder: 'rgba(116, 247, 253, 0.25)',
      colorBorderHover: '#74f7fd',
    },
    Spin: {
      colorPrimary: '#74f7fd',
    },
    Form: {
      labelColor: '#b9cfff',
    },
    Radio: {
      colorPrimary: '#74f7fd',
      buttonSolidCheckedBg: '#74f7fd',
      buttonSolidCheckedColor: '#000000',
    },
    Checkbox: {
      colorPrimary: '#74f7fd',
    },
    Divider: {
      colorSplit: 'rgba(91, 199, 250, 0.12)',
    },
    Popover: {
      colorBgElevated: 'rgba(10, 40, 80, 0.98)',
    },
    Steps: {
      colorPrimary: '#74f7fd',
    },
  },
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider theme={mfDarkTheme} locale={zhCN}>
          <App />
        </ConfigProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
