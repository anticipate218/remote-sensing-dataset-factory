import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Download,
  Crop,
  Tags,
  Sparkles,
  PackageCheck,
  CheckCircle2,
} from 'lucide-react';
import HeroSection from './HeroSection';
import FeaturesSection from './FeaturesSection';

interface TimelineStep {
  icon: React.ElementType;
  title: string;
  description: string;
  features: string[];
}

const timelineSteps: TimelineStep[] = [
  {
    icon: Download,
    title: '数据获取',
    description: '从多个卫星数据源自动下载遥感影像',
    features: ['支持 Sentinel/Landsat/高分等数据源', '自动云量筛选', '批量下载管理'],
  },
  {
    icon: Crop,
    title: '智能切片',
    description: '将大幅影像切割为训练所需的小块',
    features: ['自定义切片尺寸', '设置重叠率', '自动过滤无效区域'],
  },
  {
    icon: Tags,
    title: 'AI 辅助标注',
    description: '使用 AI 模型加速标注流程',
    features: ['SAM 智能分割', '点击/框选提示', '批量标注导出'],
  },
  {
    icon: Sparkles,
    title: '数据增强',
    description: '应用多种增强策略扩充数据集',
    features: ['20+ 增强方法', '自定义增强流水线', '实时预览效果'],
  },
  {
    icon: PackageCheck,
    title: '导出部署',
    description: '将数据集导出为主流深度学习格式',
    features: ['COCO/VOC/YOLO 格式', '自动数据集划分', '生成配置文件'],
  },
];

const TimelineSection: React.FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });

  return (
    <section
      ref={sectionRef}
      className="relative py-24 bg-[#030712] overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-0 w-72 h-72 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-0 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.5 }}
            className="inline-block px-4 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-sm font-medium mb-4"
          >
            工作流程
          </motion.span>

          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            五步构建专业数据集
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            从原始卫星数据到可用于训练的高质量数据集，一站式完成
          </p>
        </motion.div>

        <div className="relative">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-blue-500/50 via-cyan-500/50 to-blue-500/50 hidden md:block" />

          {timelineSteps.map((step, index) => {
            const isLeft = index % 2 === 0;

            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, x: isLeft ? -50 : 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className={`relative flex items-center mb-12 last:mb-0 ${
                  isLeft ? 'md:flex-row' : 'md:flex-row-reverse'
                } flex-col md:gap-8`}
              >
                <div
                  className={`w-full md:w-1/2 ${
                    isLeft ? 'md:text-right md:pr-12' : 'md:text-left md:pl-12'
                  }`}
                >
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    className="relative group p-6 rounded-2xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm hover:border-gray-700 transition-all duration-300"
                  >
                    <div
                      className={`absolute inset-0 rounded-2xl bg-gradient-to-${
                        isLeft ? 'l' : 'r'
                      } from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                    />

                    <div className="relative z-10">
                      <div
                        className={`flex items-center gap-3 mb-4 ${
                          isLeft ? 'md:justify-end' : 'md:justify-start'
                        }`}
                      >
                        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600">
                          <step.icon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <span className="text-blue-400 text-sm font-medium">
                            步骤 {index + 1}
                          </span>
                          <h3 className="text-xl font-semibold text-white">
                            {step.title}
                          </h3>
                        </div>
                      </div>

                      <p className="text-gray-400 mb-4">{step.description}</p>

                      <ul
                        className={`space-y-2 ${
                          isLeft ? 'md:text-right' : 'md:text-left'
                        }`}
                      >
                        {step.features.map((feature) => (
                          <li
                            key={feature}
                            className={`flex items-center gap-2 text-sm text-gray-300 ${
                              isLeft ? 'md:flex-row-reverse' : ''
                            }`}
                          >
                            <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                </div>

                <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex">
                  <motion.div
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true }}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      delay: index * 0.1,
                    }}
                    className="relative"
                  >
                    <div className="absolute inset-0 bg-blue-500 rounded-full blur-md opacity-50" />
                    <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center border-4 border-[#030712]">
                      <span className="text-white font-bold">{index + 1}</span>
                    </div>
                  </motion.div>
                </div>

                <div className="hidden md:block w-1/2" />
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center mt-16"
        >
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-green-500/20 to-cyan-500/20 border border-green-500/30">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <span className="text-green-400 font-medium">
              完成！您的数据集已准备就绪
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

const FooterCTA: React.FC = () => {
  return (
    <section className="relative py-24 bg-[#030712] overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-t from-blue-900/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            开始构建您的
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400">
              专业遥感数据集
            </span>
          </h2>

          <p className="text-gray-400 text-lg mb-8 max-w-2xl mx-auto">
            加入数千名科研人员和工程师，使用我们的平台加速您的遥感 AI 项目
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 transition-all duration-300"
            >
              免费开始使用
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white font-semibold rounded-xl backdrop-blur-sm transition-all duration-300 hover:bg-white/5"
            >
              联系我们
            </motion.button>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-gray-500 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span>免费试用</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span>无需信用卡</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span>技术支持</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

const HomePage: React.FC = () => {
  return (
    <main className="min-h-screen bg-[#030712]">
      <HeroSection />
      <FeaturesSection />
      <TimelineSection />
      <FooterCTA />
    </main>
  );
};

export default HomePage;
