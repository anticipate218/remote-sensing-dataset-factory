/**
 * LoginPage - 登录注册页面
 * MF-TurbineMonitor 深色儀表板風格 + Three.js 3D 地球背景
 */
import React, { useState } from 'react';
import { Input, Button, Form, message } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  MailOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import axios from 'axios';
import GlobeBackground from '../Layout/GlobeBackground';
import WidgetPanel from '../MFLayout/WidgetPanel';
import { useAppStore } from '../../stores/appStore';

const API_BASE = 'http://localhost:8000/api';

const inputAffixBase: React.CSSProperties = {
  height: 46,
  borderRadius: 10,
  background: 'rgba(5, 50, 106, 0.5)',
  borderColor: 'rgba(91, 199, 250, 0.15)',
};

const LoginPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAppStore();

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const res = await axios.post(`${API_BASE}${endpoint}`, values);
      localStorage.setItem('token', res.data.token);
      setUser(res.data.user);
      message.success(res.data.message);
      window.location.href = '/';
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: <ThunderboltOutlined />, title: 'AI 智能分割', desc: '基于 SAM3/PRISM 模型' },
    { icon: <GlobalOutlined />, title: '多格式支持', desc: 'GeoTIFF / PNG / HDF / NetCDF' },
    { icon: <DatabaseOutlined />, title: '一键制作数据集', desc: '自动切片 + 标注导出' },
    { icon: <SafetyCertificateOutlined />, title: '交互式标注', desc: '画笔 / 多边形 / 填充' },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(ellipse 80% 55% at 50% -10%, rgba(5, 50, 106, 0.85) 0%, transparent 58%), #000',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        .login-mf-input.ant-input-affix-wrapper:not(.ant-input-affix-wrapper-disabled):hover {
          border-color: rgba(116, 247, 253, 0.45) !important;
        }
        .login-mf-input.ant-input-affix-wrapper-focused,
        .login-mf-input.ant-input-affix-wrapper:focus-within {
          border-color: #74f7fd !important;
          box-shadow: 0 0 0 2px rgba(116, 247, 253, 0.12) !important;
        }
      `}</style>

      <GlobeBackground />

      {/* 網格背景 — MF 青色調 */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage:
            'linear-gradient(rgba(116, 247, 253, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(116, 247, 253, 0.04) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* 左侧品牌区 */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8 }}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px 80px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <RocketOutlined style={{ fontSize: 28, color: '#74f7fd' }} />
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: "'DouyuFont', sans-serif",
              background: 'linear-gradient(180deg, #b9cfff 0%, #ffffff 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            RS FACTORY
          </span>
        </div>

        <h1
          style={{
            fontSize: 42,
            fontWeight: 800,
            lineHeight: 1.2,
            fontFamily: 'Noto Sans SC, sans-serif',
            marginBottom: 16,
          }}
        >
          <span style={{ color: '#fff' }}>遥感数据集</span>
          <br />
          <span
            style={{
              background: 'linear-gradient(135deg, #74f7fd, #74fabd)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            智能制作平台
          </span>
        </h1>

        <p
          style={{
            fontSize: 16,
            color: '#b9cfff',
            opacity: 0.85,
            lineHeight: 1.7,
            maxWidth: 420,
            marginBottom: 40,
          }}
        >
          基于 SOTA 深度学习模型，提供语义分割、目标检测、超分辨率等遥感智能分析能力
        </p>

        {/* 特性列表 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 460 }}>
          {features.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(5, 50, 106, 0.35)',
                border: '1px solid rgba(91, 199, 250, 0.15)',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, rgba(116, 247, 253, 0.2), rgba(91, 199, 250, 0.18))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  color: '#74f7fd',
                }}
              >
                {f.icon}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{f.title}</div>
                <div style={{ fontSize: 10, color: '#b9cfff', opacity: 0.75 }}>{f.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* 右侧表单区 — WidgetPanel 居中 */}
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        style={{
          width: 460,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 50px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <div style={{ width: '100%', maxWidth: 420, minHeight: 480 }}>
          <WidgetPanel
            title="用户登录"
            style={{ height: 'auto', minHeight: 480, width: '100%' }}
            bodyStyle={{ padding: '20px 24px 24px', overflow: 'visible' }}
          >
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  marginBottom: 6,
                  fontFamily: 'Noto Sans SC, sans-serif',
                  color: '#fff',
                }}
              >
                {mode === 'login' ? '欢迎回来' : '创建账户'}
              </h2>
              <p style={{ color: '#b9cfff', fontSize: 13, opacity: 0.85, margin: 0 }}>
                {mode === 'login' ? '登录以继续使用' : '注册开始体验'}
              </p>
            </div>

            <Form onFinish={handleSubmit} layout="vertical" size="large">
              <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input
                  className="login-mf-input"
                  prefix={<UserOutlined style={{ color: 'rgba(185, 207, 255, 0.55)' }} />}
                  placeholder="用户名"
                  style={inputAffixBase}
                />
              </Form.Item>

              {mode === 'register' && (
                <Form.Item name="email">
                  <Input
                    className="login-mf-input"
                    prefix={<MailOutlined style={{ color: 'rgba(185, 207, 255, 0.55)' }} />}
                    placeholder="邮箱（可选）"
                    style={inputAffixBase}
                  />
                </Form.Item>
              )}

              <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password
                  className="login-mf-input"
                  prefix={<LockOutlined style={{ color: 'rgba(185, 207, 255, 0.55)' }} />}
                  placeholder="密码"
                  style={inputAffixBase}
                />
              </Form.Item>

              <Form.Item style={{ marginBottom: 16 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  style={{
                    height: 46,
                    borderRadius: 10,
                    fontWeight: 500,
                    fontSize: 15,
                    background: 'linear-gradient(180deg, #74f7fd 0%, #5bc7fa 100%)',
                    border: 'none',
                    color: '#05326a',
                    boxShadow: 'none',
                  }}
                >
                  {mode === 'login' ? '登录' : '注册'}
                </Button>
              </Form.Item>
            </Form>

            <div style={{ textAlign: 'center' }}>
              <span style={{ color: '#b9cfff', fontSize: 13, opacity: 0.8 }}>
                {mode === 'login' ? '没有账户？' : '已有账户？'}
              </span>
              <Button
                type="link"
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                style={{ fontSize: 13, color: '#74f7fd', padding: '0 4px' }}
              >
                {mode === 'login' ? '立即注册' : '返回登录'}
              </Button>
            </div>
          </WidgetPanel>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;
