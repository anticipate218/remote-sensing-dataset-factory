/**
 * RS Dataset Factory - API 服务
 * 封装所有后端 API 调用，包含错误处理与下载功能
 */
import axios, { AxiosError } from 'axios';

// API 基础路径（通过 Vite 代理转发到后端）
const API_BASE = '/api';

// ============ 类型定义 ============

/** 图像分析建议 */
export interface AnalysisRecommendation {
  type: 'info' | 'tip' | 'warning' | 'error';
  title: string;
  content: string;
}

/** 智能参数配置 */
export interface SmartParams {
  crop_size: number;
  stride: number;
  max_size: number;
  confidence_threshold: number;
  train_ratio: number;
  val_ratio: number;
  min_valid_ratio: number;
  min_class_diversity: number;
  rgb_bands: number[];
  is_single_label?: boolean;
}

/** 图像智能分析结果 */
export interface ImageAnalysis {
  width: number;
  height: number;
  bands: number;
  file_size: number;
  total_pixels: number;
  megapixels: number;
  aspect_ratio: number;
  scale_type: 'tiny' | 'small' | 'medium' | 'large' | 'huge';
  processing_mode: 'single_label' | 'few_crops' | 'standard_crops' | 'large_scale';
  recommended_crop_size: number;
  recommended_stride: number;
  estimated_crops: number;
  estimated_train_samples: number;
  estimated_val_samples: number;
  estimated_test_samples: number;
  analysis_summary: string;
  recommendations: AnalysisRecommendation[];
  warnings: AnalysisRecommendation[];
  smart_params: SmartParams;
}

/** 上传响应 */
export interface UploadResponse {
  task_id: string;
  filename: string;
  file_size: number;
  width: number;
  height: number;
  bands: number;
  preview_url: string;
  metadata: Record<string, unknown> & { analysis?: ImageAnalysis };
}

/** 类别配置 */
export interface ClassConfig {
  name: string;
  prompt: string;
  color: [number, number, number];
}

/** 处理参数 */
export interface ProcessingParams {
  max_size: number;
  crop_size: number;
  stride: number;
  confidence_threshold: number;
  train_ratio: number;
  val_ratio: number;
  min_valid_ratio: number;
  min_class_diversity: number;
  rgb_bands: [number, number, number];
}

/** 数据集配置 */
export interface DatasetConfig {
  name: string;
  classes: ClassConfig[];
  params: ProcessingParams;
}

/** 任务状态 */
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** 任务结果详情 */
export interface TaskResult {
  task_id?: string;
  dataset_name?: string;
  processing_time?: number;
  image_size?: [number, number];
  total_samples?: number;
  train_samples?: number;
  val_samples?: number;
  test_samples?: number;
  num_classes?: number;
  class_distribution?: Record<string, { pixels: number; ratio: number }>;
  presence_scores?: Record<string, number>;
  output_dir?: string;
  zip_path?: string;
  visualizations?: string[];
}

/** 任务响应 */
export interface TaskResponse {
  task_id: string;
  status: TaskStatus;
  progress: number;
  current_step: string;
  message: string;
  result?: TaskResult;
  error?: string;
}

/** 预设配置 */
export interface PresetConfig {
  name: string;
  description: string;
  classes: string[];
  prompts: Record<string, string>;
  palette: number[][];
  scene_tag?: 'single' | 'urban' | 'rural' | 'general' | 'academic' | string;
  icon?: string;
  tags?: string[];
  source?: string;
  // AI 推荐预设额外返回的字段
  reasoning?: string;
  detected_scene?: string;
  confidence?: number;
}

/** API 错误（统一错误格式） */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public detail?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============ 错误处理辅助 ============

/**
 * 从 Axios 错误中提取可读错误信息
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: string | { msg?: string }[] }>;
    const detail = axiosError.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
    return axiosError.message || '请求失败';
  }
  if (error instanceof Error) return error.message;
  return '未知错误';
}

/**
 * 封装 axios 请求，统一错误处理
 */
async function request<T>(
  fn: () => Promise<{ data: T }>,
  errorMessage = '请求失败'
): Promise<T> {
  try {
    const { data } = await fn();
    return data;
  } catch (error) {
    const msg = getErrorMessage(error);
    const statusCode = axios.isAxiosError(error) ? error.response?.status : undefined;
    throw new ApiError(`${errorMessage}: ${msg}`, statusCode, msg);
  }
}

// ============ API 函数 ============

export const api = {
  /**
   * 健康检查
   */
  health: async (): Promise<{ status: string; timestamp: string }> => {
    return request(
      () => axios.get(`${API_BASE}/health`),
      '健康检查失败'
    );
  },

  /**
   * 上传图像
   */
  uploadImage: async (
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post<UploadResponse>(`${API_BASE}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(progress);
          }
        },
      });
      return response.data;
    } catch (error) {
      throw new ApiError(
        `上传失败: ${getErrorMessage(error)}`,
        axios.isAxiosError(error) ? error.response?.status : undefined,
        getErrorMessage(error)
      );
    }
  },

  /**
   * 获取预览图 URL
   */
  getPreviewUrl: (fileId: string): string => {
    return `${API_BASE}/preview/${fileId}`;
  },

  /**
   * 获取预设列表
   */
  getPresets: async (): Promise<Record<string, PresetConfig>> => {
    return request<{ presets: Record<string, PresetConfig> }>(
      () => axios.get(`${API_BASE}/presets`),
      '获取预设列表失败'
    ).then((res) => res.presets);
  },

  /**
   * 获取单个预设
   */
  getPreset: async (presetName: string): Promise<PresetConfig> => {
    return request(
      () => axios.get(`${API_BASE}/preset/${presetName}`),
      '获取预设失败'
    );
  },

  /**
   * 用 GPT-5.5 Vision 自动识别上传图像 → 推荐 PresetConfig
   * @param fileId 已上传的 file_id（推荐）
   */
  aiRecommendPreset: async (
    fileId: string,
  ): Promise<PresetConfig & {
    per_class_reasons?: Array<{ name: string; prompt: string; color: string; area_share: number; reason_cn: string }>;
    model?: string;
    usage?: { total_tokens?: number };
    file_id?: string;
  }> => {
    return request(
      () => axios.post(`${API_BASE}/presets/ai-recommend`, { file_id: fileId }, {
        timeout: 120000,
      }),
      'AI 识图生成预设失败'
    );
  },

  /**
   * 创建任务
   */
  createTask: async (fileId: string, config: DatasetConfig): Promise<TaskResponse> => {
    return request(
      () => axios.post(`${API_BASE}/tasks`, { file_id: fileId, config }),
      '创建任务失败'
    );
  },

  /**
   * 获取任务状态
   */
  getTask: async (taskId: string): Promise<TaskResponse> => {
    return request(
      () => axios.get(`${API_BASE}/tasks/${taskId}`),
      '获取任务状态失败'
    );
  },

  /**
   * 获取任务列表
   */
  getTasks: async (limit = 20): Promise<{ tasks: TaskResponse[] }> => {
    return request(
      () => axios.get(`${API_BASE}/tasks`, { params: { limit } }),
      '获取任务列表失败'
    );
  },

  /**
   * 获取下载 URL（用于直接链接或 window.open）
   */
  getDownloadUrl: (taskId: string): string => {
    return `${API_BASE}/download/${taskId}`;
  },

  /**
   * 下载数据集（通过 fetch 获取 blob，触发浏览器下载）
   * 使用 GET 请求，支持大文件流式下载
   */
  downloadDataset: async (
    taskId: string,
    filename?: string
  ): Promise<void> => {
    const url = `${API_BASE}/download/${taskId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const text = await response.text();
        let errorMsg = `下载失败 (${response.status})`;
        try {
          const json = JSON.parse(text);
          if (json.detail) errorMsg = json.detail;
        } catch {
          if (text) errorMsg = text;
        }
        throw new ApiError(errorMsg, response.status);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      let finalFilename = filename || `dataset_${taskId}.zip`;

      // 尝试从 Content-Disposition 解析文件名
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i)
          || contentDisposition.match(/filename=["']?([^"';]+)["']?/i);
        if (match?.[1]) {
          finalFilename = decodeURIComponent(match[1].trim());
        }
      }

      // 创建临时链接触发下载
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = finalFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(`下载失败: ${getErrorMessage(error)}`);
    }
  },

  /**
   * 获取可视化列表
   */
  getVisualizations: async (taskId: string): Promise<{ visualizations: string[] }> => {
    return request(
      () => axios.get(`${API_BASE}/visualizations/${taskId}`),
      '获取可视化列表失败'
    );
  },

  /**
   * 删除任务
   */
  deleteTask: async (taskId: string): Promise<void> => {
    return request(
      () => axios.delete(`${API_BASE}/tasks/${taskId}`),
      '删除任务失败'
    );
  },

  /**
   * 删除文件
   */
  deleteFile: async (fileId: string): Promise<void> => {
    return request(
      () => axios.delete(`${API_BASE}/files/${fileId}`),
      '删除文件失败'
    );
  },

  // ============ 单张预测和标注 API ============

  /**
   * 单张图片预测
   */
  predictSingle: async (
    fileId: string,
    classes: Array<{ name: string; prompt: string; color: [number, number, number] }>,
    modelId?: string,
  ): Promise<{ task_id: string; status: string; message: string }> => {
    const body: any = { file_id: fileId, classes };
    if (modelId && modelId !== 'default') body.model_id = modelId;
    return request(
      () => axios.post(`${API_BASE}/predict-single`, body),
      '创建预测任务失败'
    );
  },

  /**
   * 获取预测 mask URL
   */
  getPredictionMaskUrl: (taskId: string, colored: boolean = false): string => {
    return `${API_BASE}/prediction/${taskId}/mask${colored ? '?colored=true' : ''}`;
  },

  /**
   * 获取预测原图 URL
   */
  getPredictionOriginalUrl: (taskId: string): string => {
    return `${API_BASE}/prediction/${taskId}/original`;
  },

  /**
   * 保存编辑后的标注
   */
  saveAnnotation: async (taskId: string, maskBlob: Blob): Promise<{ message: string }> => {
    const formData = new FormData();
    formData.append('file', maskBlob, 'mask_edited.png');
    
    return request(
      () => axios.post(`${API_BASE}/annotation/${taskId}/save`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      }),
      '保存标注失败'
    );
  },

  /**
   * 基于标注生成数据集
   */
  generateFromAnnotation: async (
    taskId: string,
    datasetName: string,
    options?: { includeOriginal?: boolean; includeColorMask?: boolean; exportMode?: string }
  ): Promise<{ message: string; download_url: string }> => {
    return request(
      () => axios.post(`${API_BASE}/generate-from-annotation/${taskId}`, {
        dataset_name: datasetName,
        include_original: options?.includeOriginal ?? true,
        include_color_mask: options?.includeColorMask ?? true,
        export_mode: options?.exportMode ?? 'whole',
      }),
      '生成数据集失败'
    );
  },

  /**
   * 下载标注数据集
   */
  downloadAnnotationDataset: async (taskId: string): Promise<void> => {
    const url = `${API_BASE}/download-annotation/${taskId}`;
    
    try {
      const response = await fetch(url, { method: 'GET', credentials: 'same-origin' });
      
      if (!response.ok) {
        throw new ApiError(`下载失败 (${response.status})`);
      }
      
      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `dataset_${taskId}.zip`;
      
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/i);
        if (match?.[1]) filename = match[1];
      }
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(`下载失败: ${getErrorMessage(error)}`);
    }
  },
};

// ============ WebSocket ============

/**
 * 创建任务进度 WebSocket 连接
 */
export const createWebSocket = (
  taskId: string,
  onMessage: (data: Record<string, unknown>) => void
): WebSocket => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${taskId}`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as Record<string, unknown>;
      onMessage(data);
    } catch {
      console.warn('WebSocket 消息解析失败:', event.data);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket 错误:', error);
  };

  return ws;
};

// ============ 批量操作 API ============

export interface BatchUploadFile {
  file_id: string;
  filename: string;
  width: number;
  height: number;
  preview_url: string;
}

export interface BatchUploadResponse {
  message: string;
  files: BatchUploadFile[];
  errors: Array<{ filename: string; error: string }>;
  total: number;
}

export const batchApi = {
  uploadBatch: async (
    files: File[],
    onProgress?: (loaded: number, total: number) => void
  ): Promise<BatchUploadResponse> => {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    const response = await axios.post<BatchUploadResponse>(
      `${API_BASE}/upload-batch`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(e.loaded, e.total);
        },
      }
    );
    return response.data;
  },

  createBatchTask: async (
    fileIds: string[],
    taskType: string,
    params: Record<string, any> = {}
  ): Promise<{ message: string; task_ids: string[]; task_type: string }> => {
    const response = await axios.post(`${API_BASE}/batch-task`, {
      file_ids: fileIds,
      task_type: taskType,
      params,
    });
    return response.data;
  },
};

export default api;
