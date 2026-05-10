import React, { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Scissors,
  Wand2,
  FileStack,
  BarChart3,
  Layers,
  Zap,
  Globe,
  Shield,
  Cpu,
} from 'lucide-react';

interface FeatureCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  gradient: string;
  size?: 'normal' | 'large' | 'wide';
  delay?: number;
}

const FeatureCard: React.FC<FeatureCardProps> = ({
  icon: Icon,
  title,
  description,
  gradient,
  size = 'normal',
  delay = 0,
}) => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const sizeClasses = {
    normal: 'col-span-1 row-span-1',
    large: 'col-span-1 md:col-span-1 row-span-2',
    wide: 'col-span-1 md:col-span-2 row-span-1',
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative group ${sizeClasses[size]}`}
    >
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: isHovered
            ? `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(59, 130, 246, 0.15), transparent 40%)`
            : 'none',
        }}
      />

      <div className="relative h-full p-6 rounded-2xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm overflow-hidden group-hover:border-gray-700 transition-all duration-300">
        <div
          className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-500"
          style={{ background: gradient }}
        />

        <motion.div
          className="absolute inset-0 opacity-0 group-hover:opacity-100"
          initial={false}
          animate={isHovered ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div
            className="absolute w-32 h-32 rounded-full blur-2xl"
            style={{
              background: gradient,
              left: mousePosition.x - 64,
              top: mousePosition.y - 64,
              opacity: 0.15,
            }}
          />
        </motion.div>

        <div className="relative z-10">
          <div
            className="inline-flex p-3 rounded-xl mb-4"
            style={{
              background: `linear-gradient(135deg, ${gradient.split(',')[0].replace('linear-gradient(135deg, ', '')}, transparent)`,
            }}
          >
            <Icon className="w-6 h-6 text-white" />
          </div>

          <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-blue-100 transition-colors">
            {title}
          </h3>

          <p className="text-gray-400 text-sm leading-relaxed group-hover:text-gray-300 transition-colors">
            {description}
          </p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      </div>
    </motion.div>
  );
};

const features = [
  {
    icon: Scissors,
    title: '智能分割',
    description: '基于深度学习的智能影像分割算法，自动识别地物边界，支持语义分割和实例分割两种模式。',
    gradient: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    size: 'large' as const,
  },
  {
    icon: Wand2,
    title: '数据增强',
    description: '提供20+种专业数据增强方法，包括几何变换、光学变换、遥感专用增强等。',
    gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
    size: 'normal' as const,
  },
  {
    icon: FileStack,
    title: '多格式支持',
    description: '兼容 GeoTIFF、HDF、NetCDF、ENVI 等主流遥感数据格式，无缝导入导出。',
    gradient: 'linear-gradient(135deg, #10b981, #06b6d4)',
    size: 'normal' as const,
  },
  {
    icon: BarChart3,
    title: '可视化分析',
    description: '内置强大的数据可视化工具，支持波段组合、直方图分析、光谱曲线展示等功能。',
    gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)',
    size: 'wide' as const,
  },
  {
    icon: Layers,
    title: '分层切片',
    description: '支持自定义尺寸和重叠率的智能切片，保证边缘区域的完整性。',
    gradient: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
    size: 'normal' as const,
  },
  {
    icon: Zap,
    title: '高性能处理',
    description: '采用多线程并行处理和GPU加速，大幅提升数据处理效率。',
    gradient: 'linear-gradient(135deg, #eab308, #22c55e)',
    size: 'normal' as const,
  },
  {
    icon: Globe,
    title: '坐标系统',
    description: '自动识别和转换各类投影坐标系，确保地理信息的准确性。',
    gradient: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
    size: 'normal' as const,
  },
  {
    icon: Shield,
    title: '质量控制',
    description: '内置数据质量检测模块，自动识别云覆盖、条带噪声等问题区域。',
    gradient: 'linear-gradient(135deg, #14b8a6, #0ea5e9)',
    size: 'normal' as const,
  },
  {
    icon: Cpu,
    title: 'AI 标注助手',
    description: '集成先进的AI辅助标注功能，支持点击提示、框选提示等交互方式，显著提升标注效率。',
    gradient: 'linear-gradient(135deg, #f43f5e, #a855f7)',
    size: 'wide' as const,
  },
];

const FeaturesSection: React.FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });

  return (
    <section
      ref={sectionRef}
      className="relative py-24 bg-[#030712] overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.5 }}
            className="inline-block px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-sm font-medium mb-4"
          >
            核心功能
          </motion.span>

          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            强大的专业工具
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            为遥感数据集构建量身定制的全流程解决方案
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-fr">
          {features.map((feature, index) => (
            <FeatureCard
              key={feature.title}
              {...feature}
              delay={index * 0.05}
            />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-16 p-8 rounded-2xl border border-gray-800 bg-gradient-to-r from-blue-900/20 to-purple-900/20 backdrop-blur-sm"
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-2xl font-semibold text-white mb-2">
                准备好开始了吗？
              </h3>
              <p className="text-gray-400">
                立即体验下一代遥感数据集构建平台的强大功能
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 transition-all duration-300"
            >
              免费开始使用
            </motion.button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default FeaturesSection;
