/**
 * RS Dataset Factory - Zustand 状态管理
 * 管理应用全局状态、6步工作流及页面路由
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ClassConfig, ProcessingParams, UploadResponse, TaskResponse } from '../services/api';

// 工作流步骤定义（6步）
export type Step = 
  | 'upload'     // 上传图像
  | 'configure'  // 配置类别
  | 'predict'    // 模型预测
  | 'annotate'   // 交互式编辑
  | 'confirm'    // 确认标注
  | 'export';    // 导出数据集

// 处理模式
export type ProcessingMode = 'single_label' | 'dataset_crops';

// 页面路由路径（与 react-router 对应）
export type RoutePath = '/' | '/dataset' | '/preprocess' | '/tasks' | '/api-docs';

// 扩展类别配置，添加前端使用的 id
export interface ClassItem extends ClassConfig {
  id: string;
}

// 批量上传中的单张文件信息（轻量，不含完整 metadata）
export interface BatchFileItem {
  file_id: string;
  filename: string;
  width?: number;
  height?: number;
  preview_url?: string;
}

// 标注工具类型
export type AnnotationTool =
  | 'brush'        // 画笔
  | 'eraser'       // 橡皮擦
  | 'polygon'      // 多边形
  | 'rectangle'    // 矩形填充（拖曳）
  | 'fill'         // 油漆桶（flood fill）
  | 'eyedropper'   // 吸管（拾取该像素的类别）
  | 'pan';         // 平移

// 标注编辑器状态
export interface AnnotationState {
  tool: AnnotationTool;
  brushSize: number;
  selectedClassId: string | null;
  opacity: number;
  showOriginal: boolean;
  showAnnotation: boolean;
  zoom: number;
  panOffset: { x: number; y: number };
  fillTolerance: number;       // 油漆桶颜色容差（0-100）
  cursorPos: { x: number; y: number } | null;       // 鼠标在 canvas 上的像素坐标
  cursorClassName: string | null;                    // 鼠标当前位置的类别名（hover 实时检测）
}

interface UserInfo {
  id: number;
  username: string;
  email?: string;
}

interface AppState {
  // 用户认证
  user: UserInfo | null;
  setUser: (user: UserInfo | null) => void;
  logout: () => void;

  // 当前工作流步骤
  currentStep: Step;
  setCurrentStep: (step: Step) => void;
  
  // 已完成的步骤（用于步骤导航）
  completedSteps: Step[];
  markStepCompleted: (step: Step) => void;
  resetCompletedSteps: () => void;

  // 页面路由状态（用于导航高亮、程序化跳转等）
  currentRoute: RoutePath;
  setCurrentRoute: (route: RoutePath) => void;

  // 上传的文件信息（当前活跃／单张模式或批量模式中正在审查的那张）
  uploadedFile: UploadResponse | null;
  setUploadedFile: (file: UploadResponse | null) => void;

  // 批量上传的所有文件（multi-select 时使用，与 uploadedFile 共存）
  batchFiles: BatchFileItem[];
  setBatchFiles: (files: BatchFileItem[]) => void;
  // 用户实际勾选要进入下一步的 file_id 集合（默认 = batchFiles 全选）
  selectedBatchFileIds: string[];
  setSelectedBatchFileIds: (ids: string[]) => void;
  toggleBatchFileSelection: (fileId: string) => void;
  // 每个 file 对应的处理任务（key=file_id, value=任务状态）— 在批量分割阶段填充
  batchTasks: Record<string, TaskResponse>;
  setBatchTask: (fileId: string, task: TaskResponse) => void;
  resetBatchTasks: () => void;
  // 当前正在审查/精修哪一张（结果阶段，为 null 表示批量列表视图）
  activeBatchFileId: string | null;
  setActiveBatchFileId: (id: string | null) => void;

  // 数据集名称
  datasetName: string;
  setDatasetName: (name: string) => void;

  // 类别配置
  classes: ClassItem[];
  setClasses: (classes: ClassItem[]) => void;
  addClass: (classItem: ClassItem) => void;
  removeClass: (id: string) => void;
  updateClass: (id: string, updates: Partial<ClassItem>) => void;

  // 处理参数
  params: ProcessingParams;
  setParams: (params: Partial<ProcessingParams>) => void;

  // 处理模式（单张标注 / 数据集切片）
  processingMode: ProcessingMode;
  setProcessingMode: (mode: ProcessingMode) => void;

  // 当前任务
  currentTask: TaskResponse | null;
  setCurrentTask: (task: TaskResponse | null) => void;

  // 预测结果 mask（base64 PNG 或 URL）
  predictionMask: string | null;
  setPredictionMask: (mask: string | null) => void;

  // 编辑后的标注 mask（base64 PNG）
  editedMask: string | null;
  setEditedMask: (mask: string | null) => void;

  // 标注编辑器状态
  annotationState: AnnotationState;
  setAnnotationState: (state: Partial<AnnotationState>) => void;
  resetAnnotationState: () => void;

  // 处理日志
  logs: string[];
  addLog: (log: string) => void;
  clearLogs: () => void;

  // 重置所有状态
  reset: () => void;
}

// 默认处理参数
const defaultParams: ProcessingParams = {
  max_size: 15000,
  crop_size: 512,
  stride: 384,
  confidence_threshold: 0.1,
  train_ratio: 0.7,
  val_ratio: 0.15,
  min_valid_ratio: 0.3,
  min_class_diversity: 1,
  rgb_bands: [4, 3, 2],
};

// 默认标注编辑器状态
const defaultAnnotationState: AnnotationState = {
  tool: 'pan',
  brushSize: 20,
  selectedClassId: null,
  opacity: 0.6,
  showOriginal: true,
  showAnnotation: true,
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  fillTolerance: 32,
  cursorPos: null,
  cursorClassName: null,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // 用户认证
      user: null,
      setUser: (user) => set({ user }),
      logout: () => {
        localStorage.removeItem('token');
        set({ user: null });
      },

      // 当前步骤
      currentStep: 'upload',
      setCurrentStep: (step) => set({ currentStep: step }),

      // 已完成的步骤
      completedSteps: [],
      markStepCompleted: (step) => set((state) => ({
        completedSteps: state.completedSteps.includes(step) 
          ? state.completedSteps 
          : [...state.completedSteps, step]
      })),
      resetCompletedSteps: () => set({ completedSteps: [] }),

      // 当前路由
      currentRoute: '/',
      setCurrentRoute: (route) => set({ currentRoute: route }),

      // 上传的文件
      uploadedFile: null,
      setUploadedFile: (file) => set({ uploadedFile: file }),

      // ---- 批量模式 ----
      batchFiles: [],
      setBatchFiles: (files) => set({
        batchFiles: files,
        selectedBatchFileIds: files.map((f) => f.file_id),
      }),
      selectedBatchFileIds: [],
      setSelectedBatchFileIds: (ids) => set({ selectedBatchFileIds: ids }),
      toggleBatchFileSelection: (fileId) => set((state) => ({
        selectedBatchFileIds: state.selectedBatchFileIds.includes(fileId)
          ? state.selectedBatchFileIds.filter((x) => x !== fileId)
          : [...state.selectedBatchFileIds, fileId],
      })),
      batchTasks: {},
      setBatchTask: (fileId, task) => set((state) => ({
        batchTasks: { ...state.batchTasks, [fileId]: task },
      })),
      resetBatchTasks: () => set({ batchTasks: {} }),
      activeBatchFileId: null,
      setActiveBatchFileId: (id) => set({ activeBatchFileId: id }),

      // 数据集名称
      datasetName: 'RS_Dataset',
      setDatasetName: (name) => set({ datasetName: name }),

      // 类别配置
      classes: [],
      setClasses: (classes) => set({ classes }),
      addClass: (classItem) => set((state) => ({
        classes: [...state.classes, classItem]
      })),
      removeClass: (id) => set((state) => ({
        classes: state.classes.filter((c) => c.id !== id)
      })),
      updateClass: (id, updates) => set((state) => ({
        classes: state.classes.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      })),

      // 处理参数
      params: defaultParams,
      setParams: (newParams) => set((state) => ({
        params: { ...state.params, ...newParams }
      })),

      // 处理模式
      processingMode: 'single_label',
      setProcessingMode: (mode) => set({ processingMode: mode }),

      // 当前任务
      currentTask: null,
      setCurrentTask: (task) => set({ currentTask: task }),

      // 预测结果 mask
      predictionMask: null,
      setPredictionMask: (mask) => set({ predictionMask: mask }),

      // 编辑后的标注
      editedMask: null,
      setEditedMask: (mask) => set({ editedMask: mask }),

      // 标注编辑器状态
      annotationState: defaultAnnotationState,
      setAnnotationState: (newState) => set((state) => ({
        annotationState: { ...state.annotationState, ...newState }
      })),
      resetAnnotationState: () => set({ annotationState: defaultAnnotationState }),

      // 处理日志
      logs: [],
      addLog: (log) => set((state) => ({
        logs: [...state.logs.slice(-99), log]
      })),
      clearLogs: () => set({ logs: [] }),

      // 重置
      reset: () => set({
        currentStep: 'upload',
        completedSteps: [],
        currentRoute: '/',
        uploadedFile: null,
        batchFiles: [],
        selectedBatchFileIds: [],
        batchTasks: {},
        activeBatchFileId: null,
        datasetName: 'RS_Dataset',
        classes: [],
        params: defaultParams,
        processingMode: 'single_label',
        currentTask: null,
        predictionMask: null,
        editedMask: null,
        annotationState: defaultAnnotationState,
        logs: [],
      }),
    }),
    {
      name: 'rs-dataset-factory-store',
      partialize: (state) => ({
        user: state.user,
        datasetName: state.datasetName,
        classes: state.classes,
        params: state.params,
        currentStep: state.currentStep,
        completedSteps: state.completedSteps,
        uploadedFile: state.uploadedFile,
        currentTask: state.currentTask,
        processingMode: state.processingMode,
        predictionMask: state.predictionMask,
        editedMask: state.editedMask,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // 没有上传文件但不在 upload 步骤 -> 重置工作流
        if (state.currentStep !== 'upload' && !state.uploadedFile) {
          state.currentStep = 'upload';
          state.completedSteps = [];
          state.currentTask = null;
          state.predictionMask = null;
          state.editedMask = null;
        }
        // 没有 token 但有 user -> 清除 user
        if (state.user && !localStorage.getItem('token')) {
          state.user = null;
        }
      },
    }
  )
);

// 步骤顺序定义
export const STEP_ORDER: Step[] = ['upload', 'configure', 'predict', 'annotate', 'confirm', 'export'];

// 步骤信息
export const STEP_INFO: Record<Step, { title: string; description: string; icon: string }> = {
  upload: { title: '上传图像', description: '上传遥感影像文件', icon: 'upload' },
  configure: { title: '配置类别', description: '设置标注类别和参数', icon: 'setting' },
  predict: { title: '模型预测', description: '运行语义分割模型', icon: 'thunder' },
  annotate: { title: '编辑标注', description: '交互式修正预测结果', icon: 'edit' },
  confirm: { title: '确认结果', description: '预览并确认标注', icon: 'check' },
  export: { title: '导出数据', description: '下载数据集', icon: 'download' },
};

// 判断步骤是否可访问
export const canAccessStep = (targetStep: Step, completedSteps: Step[]): boolean => {
  const targetIndex = STEP_ORDER.indexOf(targetStep);
  if (targetIndex === 0) return true; // 上传步骤总是可访问
  
  // 前一个步骤必须已完成
  const prevStep = STEP_ORDER[targetIndex - 1];
  return completedSteps.includes(prevStep);
};

// 辅助函数：生成随机颜色（用于类别显示）
export const generateRandomColor = (): [number, number, number] => {
  const hue = Math.random() * 360;
  const saturation = 70 + Math.random() * 30;
  const lightness = 45 + Math.random() * 20;

  // HSL 转 RGB
  const c = (1 - Math.abs(2 * lightness / 100 - 1)) * saturation / 100;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = lightness / 100 - c / 2;

  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; b = 0; }
  else if (hue < 120) { r = x; g = c; b = 0; }
  else if (hue < 180) { r = 0; g = c; b = x; }
  else if (hue < 240) { r = 0; g = x; b = c; }
  else if (hue < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
};

// 生成唯一 ID
export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 10);
};
