/**
 * RS Dataset Factory - 数据集制作主页面
 * 整合所有数据集制作流程，包含步骤指示器、动画切换和可折叠参数面板
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Button, Tooltip } from 'antd';
import { 
  SettingOutlined, 
  DoubleLeftOutlined, 
  DoubleRightOutlined 
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, Step } from '../../stores/appStore';
import StepIndicator from '../Layout/StepIndicator';
import UploadZone from '../Upload/UploadZone';
import ClassEditor from '../ClassEditor/ClassEditor';
import ProcessingView from '../Progress/ProcessingView';
import ResultsView from '../Results/ResultsView';
import ParamPanel from '../ParamPanel/ParamPanel';

const pageVariants = {
  initial: { 
    opacity: 0, 
    x: 60,
    scale: 0.98,
  },
  animate: { 
    opacity: 1, 
    x: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94]
    }
  },
  exit: { 
    opacity: 0, 
    x: -60,
    scale: 0.98,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.46, 0.45, 0.94]
    }
  }
};

const slideDirections: Record<string, { initial: number; exit: number }> = {
  forward: { initial: 100, exit: -100 },
  backward: { initial: -100, exit: 100 },
};

const panelVariants = {
  expanded: {
    width: 380,
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    }
  },
  collapsed: {
    width: 0,
    opacity: 0,
    x: 50,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    }
  }
};

const toggleButtonVariants = {
  expanded: { rotate: 0 },
  collapsed: { rotate: 180 },
};

const stepOrder: Step[] = ['upload', 'configure', 'processing', 'results'];

const DatasetPage: React.FC = () => {
  const { currentStep } = useAppStore();
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  const [prevStep, setPrevStep] = useState<Step>(currentStep);
  
  const direction = useMemo(() => {
    const prevIndex = stepOrder.indexOf(prevStep);
    const currentIndex = stepOrder.indexOf(currentStep);
    return currentIndex >= prevIndex ? 'forward' : 'backward';
  }, [prevStep, currentStep]);

  React.useEffect(() => {
    if (prevStep !== currentStep) {
      setPrevStep(currentStep);
    }
  }, [currentStep, prevStep]);

  const togglePanel = useCallback(() => {
    setIsPanelExpanded(prev => !prev);
  }, []);

  const showParamPanel = currentStep === 'configure' || currentStep === 'processing';

  const renderContent = () => {
    switch (currentStep) {
      case 'upload':
        return <UploadZone />;
      case 'configure':
        return <ClassEditor />;
      case 'processing':
        return <ProcessingView />;
      case 'results':
        return <ResultsView />;
      default:
        return <UploadZone />;
    }
  };

  const dynamicPageVariants = {
    initial: { 
      opacity: 0, 
      x: slideDirections[direction].initial,
      scale: 0.98,
    },
    animate: { 
      opacity: 1, 
      x: 0,
      scale: 1,
      transition: {
        duration: 0.4,
        ease: [0.25, 0.46, 0.45, 0.94]
      }
    },
    exit: { 
      opacity: 0, 
      x: slideDirections[direction].exit,
      scale: 0.98,
      transition: {
        duration: 0.3,
        ease: [0.25, 0.46, 0.45, 0.94]
      }
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      minHeight: 'calc(100vh - 80px)',
      position: 'relative',
    }}>
      {/* 步骤指示器 */}
      <StepIndicator />
      
      {/* 主内容区域 */}
      <div style={{ 
        display: 'flex', 
        flex: 1, 
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* 主要内容 */}
        <div style={{ 
          flex: 1, 
          overflow: 'auto',
          transition: 'margin-right 0.3s ease',
          marginRight: showParamPanel && isPanelExpanded ? 0 : 0,
        }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentStep}
              variants={dynamicPageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{ minHeight: '100%' }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 可折叠参数面板 */}
        <AnimatePresence>
          {showParamPanel && (
            <>
              {/* 折叠/展开按钮 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: 0.1 }}
                style={{
                  position: 'fixed',
                  right: isPanelExpanded ? 390 : 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 100,
                  transition: 'right 0.3s ease',
                }}
              >
                <Tooltip 
                  title={isPanelExpanded ? '收起参数面板' : '展开参数面板'} 
                  placement="left"
                >
                  <motion.div
                    variants={toggleButtonVariants}
                    animate={isPanelExpanded ? 'expanded' : 'collapsed'}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Button
                      type="primary"
                      shape="circle"
                      size="large"
                      icon={isPanelExpanded ? <DoubleRightOutlined /> : <SettingOutlined />}
                      onClick={togglePanel}
                      style={{
                        width: 48,
                        height: 48,
                        background: 'linear-gradient(135deg, #74f7fd 0%, #5bc7fa 100%)',
                        border: 'none',
                        boxShadow: '0 4px 20px rgba(102, 126, 234, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    />
                  </motion.div>
                </Tooltip>
              </motion.div>

              {/* 参数面板 */}
              <motion.div
                variants={panelVariants}
                initial="collapsed"
                animate={isPanelExpanded ? 'expanded' : 'collapsed'}
                exit="collapsed"
                style={{
                  height: 'calc(100vh - 200px)',
                  position: 'fixed',
                  right: 20,
                  top: 200,
                  zIndex: 50,
                  overflow: 'hidden',
                }}
              >
                <div style={{
                  width: 380,
                  height: '100%',
                  background: 'rgba(15, 15, 30, 0.95)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: 20,
                  border: '1px solid rgba(102, 126, 234, 0.2)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 60px rgba(102, 126, 234, 0.1)',
                  overflow: 'hidden',
                }}>
                  <ParamPanel />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* 背景装饰动画 */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 200,
        background: 'linear-gradient(to top, rgba(102, 126, 234, 0.03) 0%, transparent 100%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
    </div>
  );
};

export default DatasetPage;
