/**
 * RS Dataset Factory - 步骤指示器
 * 支持6步工作流，更美观的步骤设计
 */
import React from 'react';
import { Popconfirm } from 'antd';
import { 
  CloudUploadOutlined, 
  SettingOutlined, 
  ThunderboltOutlined,
  EditOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useAppStore, Step, STEP_ORDER, canAccessStep } from '../../stores/appStore';

interface StepConfig {
  key: Step;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

const steps: StepConfig[] = [
  { 
    key: 'upload', 
    title: '上传图像', 
    subtitle: '选择遥感影像',
    icon: <CloudUploadOutlined /> 
  },
  { 
    key: 'configure', 
    title: '配置类别', 
    subtitle: '设置分割目标',
    icon: <SettingOutlined /> 
  },
  { 
    key: 'predict', 
    title: '模型预测', 
    subtitle: 'AI 智能推理',
    icon: <ThunderboltOutlined /> 
  },
  { 
    key: 'annotate', 
    title: '编辑标注', 
    subtitle: '交互式修正',
    icon: <EditOutlined /> 
  },
  { 
    key: 'confirm', 
    title: '确认结果', 
    subtitle: '预览检查',
    icon: <CheckCircleOutlined /> 
  },
  { 
    key: 'export', 
    title: '导出数据', 
    subtitle: '下载数据集',
    icon: <DownloadOutlined /> 
  },
];

/** MF-TurbineMonitor 風格：主標 DouyuFont、輔文 SarasaMonoSC */
const fontTitle = `'DouyuFont', 'Orbitron', system-ui, sans-serif`;
const fontMono = `'SarasaMonoSC', 'Space Grotesk', 'Consolas', monospace`;

const StepIndicator: React.FC = () => {
  const { currentStep, setCurrentStep, completedSteps, reset } = useAppStore();
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  const handleStepClick = (step: Step, index: number) => {
    if (canAccessStep(step, completedSteps) || index < currentIndex) {
      setCurrentStep(step);
    }
  };

  const overallProgressPct =
    ((currentIndex + 0.5) / Math.max(steps.length - 1, 1)) * 100;

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      padding: '20px 40px 32px 40px',
      background: 'linear-gradient(180deg, rgba(5, 50, 106, 0.95) 0%, rgba(5, 50, 106, 0.82) 100%)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(116, 247, 253, 0.2)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 背景光效 */}
      <motion.div
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '50%',
          height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(116, 247, 253, 0.06), transparent)',
          pointerEvents: 'none',
        }}
      />

      {/* MF 儀表板式整體進度底欄（僅視覺，不影響點擊邏輯） */}
      <div
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          bottom: 6,
          height: 4,
          borderRadius: 2,
          background: 'rgba(116, 247, 253, 0.12)',
          overflow: 'hidden',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        <motion.div
          initial={false}
          animate={{ width: `${overallProgressPct}%` }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          style={{
            height: '100%',
            borderRadius: 2,
            background: 'linear-gradient(90deg, #74f7fd 0%, #5bc7fa 45%, #74fabd 100%)',
            boxShadow: '0 0 12px rgba(116, 247, 253, 0.45)',
          }}
        />
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        maxWidth: 1100,
        width: '100%',
        position: 'relative',
      }}>
        {steps.map((step, index) => {
          const isActive = currentStep === step.key;
          const isCompleted = completedSteps.includes(step.key) || index < currentIndex;
          const isClickable = canAccessStep(step.key, completedSteps) || index < currentIndex;
          const isLast = index === steps.length - 1;

          return (
            <React.Fragment key={step.key}>
              {/* 步骤项 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                onClick={() => handleStepClick(step.key, index)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flex: isLast ? 'none' : 1,
                  cursor: isClickable ? 'pointer' : 'default',
                  position: 'relative',
                  zIndex: 2,
                  minWidth: 80,
                }}
              >
                {/* 图标容器 */}
                <motion.div
                  whileHover={isClickable ? { scale: 1.1 } : {}}
                  whileTap={isClickable ? { scale: 0.95 } : {}}
                  style={{ position: 'relative' }}
                >
                  {/* 外圈发光效果 */}
                  {isActive && (
                    <motion.div
                      animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      style={{
                        position: 'absolute',
                        top: -6,
                        left: -6,
                        right: -6,
                        bottom: -6,
                        borderRadius: '50%',
                        border: '2px solid #74f7fd',
                      }}
                    />
                  )}

                  {/* 主图标圆圈 */}
                  <motion.div
                    animate={isActive ? {
                      boxShadow: [
                        '0 0 15px rgba(116, 247, 253, 0.45)',
                        '0 0 30px rgba(116, 247, 253, 0.65)',
                        '0 0 15px rgba(116, 247, 253, 0.45)',
                      ],
                    } : {}}
                    transition={isActive ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      background: isCompleted 
                        ? 'linear-gradient(135deg, #74fabd 0%, #3db89a 100%)'
                        : isActive 
                          ? 'linear-gradient(135deg, #74f7fd 0%, #5bc7fa 100%)'
                          : 'rgba(116, 247, 253, 0.12)',
                      border: isCompleted
                        ? '2px solid rgba(116, 250, 189, 0.55)'
                        : isActive 
                          ? '2px solid rgba(116, 247, 253, 0.55)' 
                          : '2px solid rgba(116, 247, 253, 0.22)',
                      color: isActive || isCompleted ? '#fff' : 'rgba(255, 255, 255, 0.4)',
                      boxShadow: isCompleted
                        ? '0 4px 15px rgba(116, 250, 189, 0.45)'
                        : isActive 
                          ? '0 4px 20px rgba(116, 247, 253, 0.55)' 
                          : 'none',
                      transition: 'all 0.4s ease',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <span style={{ position: 'relative', zIndex: 1 }}>
                      {isCompleted && !isActive ? <CheckCircleOutlined /> : step.icon}
                    </span>
                  </motion.div>

                  {/* 步骤序号徽章 */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: index * 0.08 + 0.2 }}
                    style={{
                      position: 'absolute',
                      top: -3,
                      right: -3,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: isCompleted 
                        ? '#74fabd' 
                        : isActive 
                          ? 'linear-gradient(135deg, #74f7fd 0%, #5bc7fa 100%)'
                          : 'rgba(116, 247, 253, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      fontFamily: fontMono,
                      color: '#fff',
                      border: '2px solid rgba(5, 50, 106, 0.85)',
                    }}
                  >
                    {index + 1}
                  </motion.div>
                </motion.div>

                {/* 文字标签 */}
                <div style={{ marginTop: 10, textAlign: 'center' }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: isActive ? 700 : 500,
                    fontFamily: fontTitle,
                    letterSpacing: '0.02em',
                    color: isActive 
                      ? '#fff' 
                      : isCompleted 
                        ? '#74fabd'
                        : 'rgba(255, 255, 255, 0.5)',
                    marginBottom: 2,
                    transition: 'all 0.3s ease',
                    whiteSpace: 'nowrap',
                  }}>
                    {step.title}
                  </div>
                  <div style={{
                    fontSize: 10,
                    fontFamily: fontMono,
                    color: isActive 
                      ? 'rgba(116, 247, 253, 0.92)' 
                      : 'rgba(255, 255, 255, 0.3)',
                    transition: 'all 0.3s ease',
                  }}>
                    {step.subtitle}
                  </div>
                </div>
              </motion.div>
              
              {/* 连接线 */}
              {!isLast && (
                <div style={{
                  flex: 1,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  marginLeft: -6,
                  marginRight: -6,
                  minWidth: 30,
                }}>
                  {/* 连接线背景 */}
                  <div style={{
                    width: '100%',
                    height: 3,
                    background: 'rgba(116, 247, 253, 0.14)',
                    borderRadius: 2,
                    position: 'relative',
                    overflow: 'hidden',
                  }}>
                    {/* 已完成的进度 */}
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ 
                        width: index < currentIndex ? '100%' : index === currentIndex ? '50%' : '0%' 
                      }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      style={{
                        height: '100%',
                        background: index < currentIndex 
                          ? 'linear-gradient(90deg, #74fabd 0%, #3db89a 100%)'
                          : 'linear-gradient(90deg, #74f7fd 0%, #5bc7fa 55%, #74fabd 100%)',
                        borderRadius: 2,
                        boxShadow: index <= currentIndex 
                          ? '0 0 10px rgba(116, 247, 253, 0.55)' 
                          : 'none',
                      }}
                    />

                    {/* 流动动画效果 */}
                    {index === currentIndex && (
                      <motion.div
                        animate={{ x: ['-100%', '200%'] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '30%',
                          height: '100%',
                          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
                          borderRadius: 2,
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* 重新开始按钮 */}
      {currentStep !== 'upload' && (
        <Popconfirm
          title="确定要重新开始吗？"
          description="当前进度将被清除"
          onConfirm={reset}
          okText="确定"
          cancelText="取消"
        >
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)',
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(255, 71, 87, 0.12)', border: '1px solid rgba(255, 71, 87, 0.3)',
              color: '#ff4757', fontSize: 12, fontWeight: 500, fontFamily: fontMono, zIndex: 5,
            }}
          >
            <ReloadOutlined /> 重新开始
          </motion.div>
        </Popconfirm>
      )}

      {/* 底部渐变装饰线 */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 1,
        background: `linear-gradient(90deg, 
          transparent 0%, 
          rgba(116, 247, 253, 0.35) 20%, 
          rgba(91, 199, 250, 0.45) 50%, 
          rgba(116, 247, 253, 0.35) 80%, 
          transparent 100%
        )`,
      }} />
    </div>
  );
};

export default StepIndicator;
