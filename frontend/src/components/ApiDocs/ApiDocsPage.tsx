import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import WidgetPanel from '../MFLayout/WidgetPanel';
import {
  Book,
  Code2,
  Server,
  Upload,
  Settings,
  Play,
  Activity,
  Download,
  Wifi,
  Copy,
  Check,
  ChevronRight,
  Terminal,
  FileJson,
  Lock,
  Zap,
  Loader2,
  Send,
} from 'lucide-react';

/* ─── Interfaces ─── */

interface NavItem {
  id: string;
  title: string;
  icon: React.ElementType;
  children?: { id: string; title: string }[];
}

interface TryItConfig {
  method: string;
  url: string;
  editable?: boolean;
  note?: string;
  defaultBody?: string;
  pathParams?: { name: string; defaultValue: string }[];
}

/* ─── Navigation config ─── */

const navItems: NavItem[] = [
  {
    id: 'overview',
    title: 'API 概览',
    icon: Book,
    children: [
      { id: 'base-url', title: '基础 URL' },
      { id: 'authentication', title: '认证方式' },
      { id: 'response-format', title: '响应格式' },
    ],
  },
  {
    id: 'endpoints',
    title: '端点文档',
    icon: Server,
    children: [
      { id: 'upload', title: 'POST /upload' },
      { id: 'presets', title: 'GET /presets' },
      { id: 'create-task', title: 'POST /tasks' },
      { id: 'task-status', title: 'GET /tasks/{id}' },
      { id: 'download', title: 'GET /download/{id}' },
      { id: 'websocket', title: 'WebSocket /ws/{id}' },
    ],
  },
  {
    id: 'examples',
    title: '代码示例',
    icon: Code2,
    children: [
      { id: 'python-example', title: 'Python 示例' },
      { id: 'curl-example', title: 'cURL 示例' },
    ],
  },
];

/* ─── Try-It configs per endpoint ─── */

const tryItConfigs: Record<string, TryItConfig> = {
  upload: {
    method: 'POST',
    url: '/api/upload',
    editable: false,
    note: '文件上传需要通过界面或 cURL 完成，无法在此直接测试。',
  },
  presets: {
    method: 'GET',
    url: '/api/presets',
    editable: true,
  },
  'create-task': {
    method: 'POST',
    url: '/api/tasks',
    editable: true,
    defaultBody: JSON.stringify(
      {
        image_id: 'img_abc123',
        preset_id: 'semantic_segmentation',
        classes: ['building', 'road', 'vegetation', 'water'],
        tile_size: 512,
        overlap: 0.1,
        output_format: 'COCO',
      },
      null,
      2,
    ),
  },
  'task-status': {
    method: 'GET',
    url: '/api/tasks/{id}',
    editable: true,
    pathParams: [{ name: 'id', defaultValue: 'task_xyz789' }],
  },
  download: {
    method: 'GET',
    url: '/api/download/{id}',
    editable: false,
    note: '文件下载需要有效的已完成任务 ID，请通过浏览器或 cURL 下载。',
  },
  websocket: {
    method: 'WS',
    url: '/ws/{id}',
    editable: false,
    note: 'WebSocket 连接需要通过代码建立，无法在此直接测试。',
  },
};

/* ─── Shared Components ─── */

const GradientDivider: React.FC = () => (
  <div
    className="h-px bg-gradient-to-r from-transparent to-transparent"
    style={{ backgroundImage: 'linear-gradient(to right, transparent, rgba(116, 247, 253, 0.4), transparent)' }}
  />
);

const CodeBlock: React.FC<{ code: string; language: string; title?: string }> = ({
  code,
  language,
  title,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="relative group rounded-xl overflow-hidden"
      style={{
        background: 'rgba(0, 0, 0, 0.5)',
        border: '1px solid rgba(91, 199, 250, 0.15)',
      }}
    >
      {title && (
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{
            background: 'rgba(5, 50, 106, 0.35)',
            borderColor: 'rgba(91, 199, 250, 0.12)',
          }}
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4" style={{ color: '#74f7fd' }} />
            <span className="text-sm text-gray-400 font-medium">{title}</span>
          </div>
          <span className="text-xs text-gray-500 uppercase">{language}</span>
        </div>
      )}
      <div className="relative">
        <pre
          className="p-4 overflow-x-auto text-sm leading-relaxed"
          style={{ fontFamily: "'SarasaMonoSC', monospace" }}
        >
          <code className="text-gray-300">{code}</code>
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 p-2 rounded-lg bg-black/40 hover:bg-black/60 border opacity-0 group-hover:opacity-100 transition-all duration-200"
          style={{ borderColor: 'rgba(91, 199, 250, 0.2)' }}
        >
          {copied ? (
            <Check className="w-4 h-4 text-[#74fabd]" />
          ) : (
            <Copy className="w-4 h-4 text-gray-400" />
          )}
        </button>
      </div>
    </div>
  );
};

const MethodBadge: React.FC<{ method: string }> = ({ method }) => {
  const colors: Record<string, string> = {
    GET: 'border-[rgba(116,247,253,0.3)] bg-[rgba(116,247,253,0.12)] text-[#74fabd]',
    POST: 'border-[rgba(91,199,250,0.35)] bg-[rgba(91,199,250,0.15)] text-[#5bc7fa]',
    PUT: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
    WS: 'border-[rgba(91,199,250,0.35)] bg-[rgba(91,199,250,0.12)] text-[#5bc7fa]',
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-bold rounded border ${colors[method] || colors.GET}`}
      style={{ fontFamily: "'SarasaMonoSC', monospace" }}
    >
      {method}
    </span>
  );
};

/* ─── EndpointCard (enhanced) ─── */

const EndpointCard: React.FC<{
  method: string;
  path: string;
  description: string;
  request?: {
    body?: string;
    params?: { name: string; type: string; required: boolean; description: string }[];
  };
  response?: string;
  id: string;
  tryIt?: TryItConfig;
}> = ({ method, path, description, request, response, id, tryIt }) => {
  const [pathCopied, setPathCopied] = useState(false);
  const [tryItOpen, setTryItOpen] = useState(false);
  const [tryItResponse, setTryItResponse] = useState<string | null>(null);
  const [tryItLoading, setTryItLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'request' | 'response'>('request');
  const [bodyValue, setBodyValue] = useState(tryIt?.defaultBody || '');
  const [pathParamValues, setPathParamValues] = useState<Record<string, string>>(
    () =>
      tryIt?.pathParams?.reduce(
        (acc, p) => ({ ...acc, [p.name]: p.defaultValue }),
        {} as Record<string, string>,
      ) ?? {},
  );

  const hasBothTabs = !!(request?.body && response);

  const copyEndpoint = async () => {
    await navigator.clipboard.writeText(path);
    setPathCopied(true);
    setTimeout(() => setPathCopied(false), 2000);
  };

  const handleSendRequest = async () => {
    if (!tryIt || !tryIt.editable) return;
    setTryItLoading(true);
    setTryItResponse(null);
    try {
      let url = tryIt.url;
      if (tryIt.pathParams) {
        tryIt.pathParams.forEach((p) => {
          url = url.replace(`{${p.name}}`, pathParamValues[p.name] || p.defaultValue);
        });
      }
      const options: RequestInit = { method: tryIt.method };
      if (tryIt.method === 'POST' && bodyValue) {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = bodyValue;
      }
      const res = await fetch(url, options);
      const text = await res.text();
      try {
        setTryItResponse(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setTryItResponse(text);
      }
    } catch (err) {
      setTryItResponse(`Error: ${err instanceof Error ? err.message : '请求失败'}`);
    } finally {
      setTryItLoading(false);
    }
  };

  return (
    <motion.div
      id={id}
      data-section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="p-6 rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:border-[rgba(116,247,253,0.25)]"
      style={{
        borderColor: 'rgba(91, 199, 250, 0.15)',
        background: 'rgba(5, 50, 106, 0.35)',
      }}
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <MethodBadge method={method} />
          <code
            className="text-lg text-white font-medium"
            style={{ fontFamily: "'SarasaMonoSC', monospace" }}
          >
            {path}
          </code>
          <button
            onClick={copyEndpoint}
            className="p-1.5 rounded-md hover:bg-gray-800 transition-colors"
            title="复制端点"
          >
            {pathCopied ? (
              <Check className="w-3.5 h-3.5 text-[#74fabd]" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-gray-500" />
            )}
          </button>
        </div>
        {tryIt && (
          <button
            onClick={() => setTryItOpen(!tryItOpen)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
              tryItOpen
                ? 'text-[#74f7fd] border-[rgba(116,247,253,0.35)] bg-[rgba(116,247,253,0.12)]'
                : 'bg-[rgba(5,50,106,0.4)] text-gray-400 hover:text-white hover:bg-[rgba(5,50,106,0.55)] border-[rgba(91,199,250,0.12)]'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            试一试
          </button>
        )}
      </div>

      <p className="text-gray-400 mb-6">{description}</p>

      {request?.params && request.params.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <FileJson className="w-4 h-4 text-[#74f7fd]" />
            请求参数
          </h4>
          <div className="overflow-hidden rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead style={{ background: 'rgba(5, 50, 106, 0.5)' }}>
                <tr>
                  <th className="px-4 py-2 text-left text-gray-400 font-medium">参数名</th>
                  <th className="px-4 py-2 text-left text-gray-400 font-medium">类型</th>
                  <th className="px-4 py-2 text-left text-gray-400 font-medium">必填</th>
                  <th className="px-4 py-2 text-left text-gray-400 font-medium">说明</th>
                </tr>
              </thead>
              <tbody>
                {request.params.map((param, idx) => (
                  <tr key={idx} className="border-t border-gray-800">
                    <td className="px-4 py-2">
                      <code
                        className="text-[#74f7fd]"
                        style={{ fontFamily: "'SarasaMonoSC', monospace" }}
                      >
                        {param.name}
                      </code>
                    </td>
                    <td className="px-4 py-2 text-gray-400">{param.type}</td>
                    <td className="px-4 py-2">
                      {param.required ? (
                        <span className="text-red-400">是</span>
                      ) : (
                        <span className="text-gray-500">否</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-400">{param.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasBothTabs ? (
        <div>
          <div
            className="flex gap-1 mb-3 p-1 rounded-lg w-fit"
            style={{ background: 'rgba(5, 50, 106, 0.4)' }}
          >
            <button
              onClick={() => setActiveTab('request')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'request'
                  ? 'bg-[rgba(116,247,253,0.15)] text-[#74f7fd]'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              请求示例
            </button>
            <button
              onClick={() => setActiveTab('response')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'response'
                  ? 'bg-[rgba(116,247,253,0.15)] text-[#74f7fd]'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              响应示例
            </button>
          </div>
          <AnimatePresence mode="wait">
            {activeTab === 'request' && request?.body && (
              <motion.div
                key="req"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <CodeBlock code={request.body} language="json" />
              </motion.div>
            )}
            {activeTab === 'response' && response && (
              <motion.div
                key="res"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <CodeBlock code={response} language="json" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <>
          {request?.body && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-300 mb-3">请求示例</h4>
              <CodeBlock code={request.body} language="json" />
            </div>
          )}
          {response && (
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-3">响应示例</h4>
              <CodeBlock code={response} language="json" />
            </div>
          )}
        </>
      )}

      {/* Try-It panel */}
      <AnimatePresence>
        {tryItOpen && tryIt && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-6 pt-6 border-t border-gray-800">
              <h4 className="text-sm font-semibold text-[#74f7fd] mb-4 flex items-center gap-2">
                <Send className="w-4 h-4" />
                在线测试
              </h4>

              {!tryIt.editable ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <p className="text-amber-400 text-sm">{tryIt.note}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tryIt.pathParams?.map((p) => (
                    <div key={p.name}>
                      <label className="text-sm text-gray-400 mb-1.5 block">
                        路径参数: <code className="text-[#74f7fd]">{`{${p.name}}`}</code>
                      </label>
                      <input
                        type="text"
                        value={pathParamValues[p.name] || ''}
                        onChange={(e) =>
                          setPathParamValues((prev) => ({ ...prev, [p.name]: e.target.value }))
                        }
                        className="w-full px-4 py-2 rounded-lg border text-white text-sm focus:outline-none transition-colors focus:border-[rgba(116,247,253,0.45)]"
                        style={{
                          fontFamily: "'SarasaMonoSC', monospace",
                          background: 'rgba(0, 0, 0, 0.5)',
                          borderColor: 'rgba(91, 199, 250, 0.15)',
                        }}
                      />
                    </div>
                  ))}

                  {tryIt.defaultBody && (
                    <div>
                      <label className="text-sm text-gray-400 mb-1.5 block">请求体 (JSON)</label>
                      <textarea
                        value={bodyValue}
                        onChange={(e) => setBodyValue(e.target.value)}
                        rows={8}
                        className="w-full px-4 py-3 rounded-lg border text-white text-sm focus:outline-none transition-colors resize-y focus:border-[rgba(116,247,253,0.45)]"
                        style={{
                          fontFamily: "'SarasaMonoSC', monospace",
                          background: 'rgba(0, 0, 0, 0.5)',
                          borderColor: 'rgba(91, 199, 250, 0.15)',
                        }}
                      />
                    </div>
                  )}

                  <button
                    onClick={handleSendRequest}
                    disabled={tryItLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-[#74f7fd] border transition-colors disabled:opacity-50 bg-[rgba(116,247,253,0.12)] border-[rgba(116,247,253,0.3)] hover:bg-[rgba(116,247,253,0.2)]"
                  >
                    {tryItLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {tryItLoading ? '请求中...' : '发送请求'}
                  </button>

                  {tryItResponse && (
                    <div>
                      <h5 className="text-sm text-gray-400 mb-2">响应结果</h5>
                      <CodeBlock code={tryItResponse} language="json" title="API Response" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

/* ─── SideNav ─── */

const SideNav: React.FC<{
  activeSection: string;
  onNavigate: (id: string) => void;
}> = ({ activeSection, onNavigate }) => {
  const [expandedItems, setExpandedItems] = useState<string[]>(['overview', 'endpoints', 'examples']);

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const isChildActive = (item: NavItem) =>
    item.children?.some((c) => c.id === activeSection) || activeSection === item.id;

  return (
    <nav className="sticky top-24 space-y-2 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
      {navItems.map((item) => (
        <div key={item.id}>
          <button
            onClick={() => {
              toggleExpand(item.id);
              onNavigate(item.id);
            }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all duration-200 border ${
              isChildActive(item)
                ? 'text-[#74f7fd] border-[rgba(116,247,253,0.3)] bg-[rgba(116,247,253,0.08)]'
                : 'text-gray-400 hover:text-white border-transparent hover:bg-[rgba(5,50,106,0.45)]'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium flex-1">{item.title}</span>
            {item.children && (
              <ChevronRight
                className={`w-4 h-4 transition-transform duration-200 ${
                  expandedItems.includes(item.id) ? 'rotate-90' : ''
                }`}
              />
            )}
          </button>
          <AnimatePresence>
            {item.children && expandedItems.includes(item.id) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="ml-8 mt-1 space-y-1 border-l border-gray-800 pl-4">
                  {item.children.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => onNavigate(child.id)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
                        activeSection === child.id
                          ? 'text-[#74f7fd] bg-[rgba(116,247,253,0.1)]'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {child.title}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </nav>
  );
};

/* ─── Main Page ─── */

const ApiDocsPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const [apiHealth, setApiHealth] = useState<'checking' | 'online' | 'offline'>('checking');
  const [baseUrlCopied, setBaseUrlCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleNavigate = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/gpu-status');
        setApiHealth(res.ok ? 'online' : 'offline');
      } catch {
        setApiHealth('offline');
      }
    };
    checkHealth();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-100px 0px -60% 0px' },
    );

    const sections = document.querySelectorAll('[data-section]');
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const copyBaseUrl = async () => {
    await navigator.clipboard.writeText('http://localhost:8000/api');
    setBaseUrlCopied(true);
    setTimeout(() => setBaseUrlCopied(false), 2000);
  };

  const pythonExample = `import requests
import json

BASE_URL = "http://localhost:8000/api"

# 1. 上传图像
def upload_image(file_path: str) -> dict:
    with open(file_path, 'rb') as f:
        files = {'file': f}
        response = requests.post(f"{BASE_URL}/upload", files=files)
        return response.json()

# 2. 获取预设配置
def get_presets() -> list:
    response = requests.get(f"{BASE_URL}/presets")
    return response.json()

# 3. 创建处理任务
def create_task(image_id: str, preset_id: str, classes: list) -> dict:
    payload = {
        "image_id": image_id,
        "preset_id": preset_id,
        "classes": classes,
        "tile_size": 512,
        "overlap": 0.1
    }
    response = requests.post(f"{BASE_URL}/tasks", json=payload)
    return response.json()

# 4. 查询任务状态
def get_task_status(task_id: str) -> dict:
    response = requests.get(f"{BASE_URL}/tasks/{task_id}")
    return response.json()

# 5. 下载数据集
def download_dataset(task_id: str, output_path: str):
    response = requests.get(f"{BASE_URL}/download/{task_id}", stream=True)
    with open(output_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)

# 使用示例
if __name__ == "__main__":
    # 上传图像
    result = upload_image("satellite_image.tif")
    image_id = result["image_id"]
    
    # 创建任务
    task = create_task(
        image_id=image_id,
        preset_id="semantic_segmentation",
        classes=["building", "road", "vegetation", "water"]
    )
    
    # 下载结果
    download_dataset(task["task_id"], "dataset.zip")`;

  const curlExample = `# 1. 上传图像
curl -X POST http://localhost:8000/api/upload \\
  -H "Content-Type: multipart/form-data" \\
  -F "file=@satellite_image.tif"

# 2. 获取预设配置
curl -X GET http://localhost:8000/api/presets

# 3. 创建处理任务
curl -X POST http://localhost:8000/api/tasks \\
  -H "Content-Type: application/json" \\
  -d '{
    "image_id": "img_abc123",
    "preset_id": "semantic_segmentation",
    "classes": ["building", "road", "vegetation"],
    "tile_size": 512,
    "overlap": 0.1
  }'

# 4. 查询任务状态
curl -X GET http://localhost:8000/api/tasks/task_xyz789

# 5. 下载数据集
curl -X GET http://localhost:8000/api/download/task_xyz789 \\
  -o dataset.zip

# 6. WebSocket 连接 (使用 websocat)
websocat ws://localhost:8000/api/ws/task_xyz789`;

  const responseFormatExample = `{
  "success": true,
  "data": {
    "task_id": "task_xyz789",
    "status": "completed",
    "progress": 100,
    "result": {
      "total_tiles": 256,
      "processed_tiles": 256,
      "output_format": "COCO"
    }
  },
  "message": "任务处理完成",
  "timestamp": "2024-01-15T10:30:00Z"
}`;

  const errorResponseExample = `{
  "success": false,
  "error": {
    "code": "INVALID_IMAGE_FORMAT",
    "message": "不支持的图像格式，请上传 TIFF、PNG 或 JPEG 格式的图像"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}`;

  const healthColors = {
    checking: { border: 'border-yellow-500/30', bg: 'bg-yellow-500/10', dot: 'bg-yellow-400 animate-pulse', text: 'text-yellow-400' },
    online: {
      border: 'border-[rgba(116,250,189,0.35)]',
      bg: 'bg-[rgba(116,250,189,0.12)]',
      dot: 'bg-[#74fabd] shadow-[0_0_8px_rgba(116,250,189,0.55)]',
      text: 'text-[#74fabd]',
    },
    offline: { border: 'border-red-500/30', bg: 'bg-red-500/10', dot: 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]', text: 'text-red-400' },
  };
  const healthLabel = { checking: '检查中...', online: '服务运行中', offline: '服务不可用' };
  const hc = healthColors[apiHealth];

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: 'rgba(5, 50, 106, 0.92)' }}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl"
          style={{ background: 'rgba(116, 247, 253, 0.06)' }}
        />
        <div
          className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl"
          style={{ background: 'rgba(91, 199, 250, 0.07)' }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        {/* API Health Indicator */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center mb-6"
        >
          <div className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-full border ${hc.border} ${hc.bg}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${hc.dot}`} />
            <span className={`text-sm font-medium ${hc.text}`}>{healthLabel[apiHealth]}</span>
          </div>
        </motion.div>

        {/* Page title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border mb-6"
            style={{
              borderColor: 'rgba(116, 247, 253, 0.3)',
              background: 'rgba(116, 247, 253, 0.08)',
            }}
          >
            <Terminal className="w-4 h-4 text-[#74f7fd]" />
            <span className="text-[#74f7fd] text-sm font-medium" style={{ fontFamily: "'DouyuFont', sans-serif" }}>
              RESTful API v1.0
            </span>
          </motion.div>
          <h1
            className="text-4xl md:text-5xl font-bold mb-4"
            style={{ fontFamily: "'DouyuFont', sans-serif" }}
          >
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(180deg, #b9cfff, #fff)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
              }}
            >
              API 接口文档
            </span>
          </h1>
          <p
            className="text-gray-400 text-lg max-w-2xl mx-auto"
            style={{ fontFamily: "'SarasaMonoSC', monospace" }}
          >
            遥感数据集工厂 API 完整指南，助您快速集成与开发
          </p>
          <p className="text-gray-600 text-sm mt-2">v1.0 · 最后更新 2026-03</p>
        </motion.div>

        {/* Quick Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap items-center justify-center gap-6 mb-16 p-4 rounded-2xl border backdrop-blur-sm"
          style={{
            borderColor: 'rgba(91, 199, 250, 0.15)',
            background: 'rgba(5, 50, 106, 0.4)',
          }}
        >
          <div className="flex items-center gap-2 text-sm">
            <Server className="w-4 h-4 text-[#74f7fd]" />
            <span className="text-gray-400">核心端点</span>
            <span className="text-white font-semibold">6</span>
            <span className="text-gray-500 text-xs ml-1">/ 完整 API 见 <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" className="text-[#74f7fd] hover:underline">Swagger</a></span>
          </div>
          <div className="w-px h-4 bg-gray-700" />
          <div className="flex items-center gap-2 text-sm">
            <Activity className="w-4 h-4 text-[#74f7fd]" />
            <span className="text-gray-400">支持方法</span>
            <div className="flex gap-1.5">
              <MethodBadge method="GET" />
              <MethodBadge method="POST" />
              <MethodBadge method="WS" />
            </div>
          </div>
          <div className="w-px h-4 bg-gray-700" />
          <div className="flex items-center gap-2 text-sm">
            <Zap className="w-4 h-4 text-[#74f7fd]" />
            <span className="text-gray-400">Base URL</span>
            <code
              className="text-[#74fabd] text-xs"
              style={{ fontFamily: "'SarasaMonoSC', monospace" }}
            >
              http://localhost:8000/api
            </code>
            <button onClick={copyBaseUrl} className="p-1 rounded hover:bg-gray-800 transition-colors">
              {baseUrlCopied ? (
                <Check className="w-3.5 h-3.5 text-[#74fabd]" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-gray-500" />
              )}
            </button>
          </div>
        </motion.div>

        {/* Main content */}
        <div className="flex gap-12 items-start">
          <div className="hidden lg:block w-64 flex-shrink-0 min-h-0">
            <WidgetPanel title="接口导航" bodyStyle={{ overflowY: 'auto', maxHeight: 'calc(100vh - 10rem)' }}>
              <SideNav activeSection={activeSection} onNavigate={handleNavigate} />
            </WidgetPanel>
          </div>

          <div className="flex-1 min-w-0">
            <WidgetPanel title="API 文档" bodyStyle={{ overflow: 'visible' }}>
              <div ref={contentRef} className="space-y-16">
            {/* ─── API 概览 ─── */}
            <section id="overview" data-section className="space-y-8">
              <div className="flex items-center gap-3 mb-8">
                <div
                  className="p-3 rounded-xl"
                  style={{ background: 'linear-gradient(135deg, #5bc7fa 0%, #74f7fd 100%)' }}
                >
                  <Book className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-3xl font-bold" style={{ fontFamily: "'DouyuFont', sans-serif" }}>
                  API 概览
                </h2>
              </div>

              <div
                id="base-url"
                data-section
                className="p-6 rounded-2xl border"
                style={{
                  borderColor: 'rgba(91, 199, 250, 0.15)',
                  background: 'rgba(5, 50, 106, 0.35)',
                }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Server className="w-5 h-5 text-[#74f7fd]" />
                  <h3 className="text-xl font-semibold" style={{ fontFamily: "'DouyuFont', sans-serif" }}>
                    基础 URL
                  </h3>
                </div>
                <div
                  className="p-4 rounded-xl border"
                  style={{
                    fontFamily: "'SarasaMonoSC', monospace",
                    background: 'rgba(0, 0, 0, 0.5)',
                    borderColor: 'rgba(91, 199, 250, 0.15)',
                  }}
                >
                  <span className="text-[#74fabd]">http://localhost:8000/api</span>
                </div>
                <p className="mt-4 text-gray-400 text-sm">
                  所有 API 请求都应以此为基础 URL。在生产环境中，请将{' '}
                  <code className="text-[#74f7fd]">localhost:8000</code> 替换为实际的服务器地址。
                </p>
              </div>

              <div
                id="authentication"
                data-section
                className="p-6 rounded-2xl border"
                style={{
                  borderColor: 'rgba(91, 199, 250, 0.15)',
                  background: 'rgba(5, 50, 106, 0.35)',
                }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Lock className="w-5 h-5 text-[#74f7fd]" />
                  <h3 className="text-xl font-semibold" style={{ fontFamily: "'DouyuFont', sans-serif" }}>
                    认证方式
                  </h3>
                </div>
                <div className="space-y-4">
                  <p className="text-gray-400">当前版本 API 支持以下认证方式：</p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div
                      className="p-4 rounded-xl border"
                      style={{
                        background: 'rgba(0, 0, 0, 0.5)',
                        borderColor: 'rgba(91, 199, 250, 0.15)',
                      }}
                    >
                      <h4 className="text-white font-medium mb-2 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-400" />
                        API Key 认证
                      </h4>
                      <p className="text-gray-400 text-sm mb-3">在请求头中添加 API Key</p>
                      <code
                        className="text-sm text-[#74f7fd] block"
                        style={{ fontFamily: "'SarasaMonoSC', monospace" }}
                      >
                        X-API-Key: your_api_key_here
                      </code>
                    </div>
                    <div
                      className="p-4 rounded-xl border"
                      style={{
                        background: 'rgba(0, 0, 0, 0.5)',
                        borderColor: 'rgba(91, 199, 250, 0.15)',
                      }}
                    >
                      <h4 className="text-white font-medium mb-2 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-[#74fabd]" />
                        Bearer Token
                      </h4>
                      <p className="text-gray-400 text-sm mb-3">使用 JWT Token 进行认证</p>
                      <code
                        className="text-sm text-[#74f7fd] block"
                        style={{ fontFamily: "'SarasaMonoSC', monospace" }}
                      >
                        Authorization: Bearer &lt;token&gt;
                      </code>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                    <p className="text-amber-400 text-sm">
                      <strong>提示：</strong>本地开发环境可暂时跳过认证。生产环境请务必启用认证机制。
                    </p>
                  </div>
                </div>
              </div>

              <div
                id="response-format"
                data-section
                className="p-6 rounded-2xl border"
                style={{
                  borderColor: 'rgba(91, 199, 250, 0.15)',
                  background: 'rgba(5, 50, 106, 0.35)',
                }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <FileJson className="w-5 h-5 text-[#74f7fd]" />
                  <h3 className="text-xl font-semibold" style={{ fontFamily: "'DouyuFont', sans-serif" }}>
                    响应格式
                  </h3>
                </div>
                <p className="text-gray-400 mb-4">
                  所有 API 响应均为 JSON 格式，包含统一的数据结构：
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm text-gray-300 mb-2 flex items-center gap-2">
                      <Check className="w-4 h-4 text-[#74fabd]" />
                      成功响应
                    </h4>
                    <CodeBlock code={responseFormatExample} language="json" />
                  </div>
                  <div>
                    <h4 className="text-sm text-gray-300 mb-2 flex items-center gap-2">
                      <span className="w-4 h-4 text-red-400">✕</span>
                      错误响应
                    </h4>
                    <CodeBlock code={errorResponseExample} language="json" />
                  </div>
                </div>
              </div>
            </section>

            <GradientDivider />

            {/* ─── 端点文档 ─── */}
            <section id="endpoints" data-section className="space-y-8">
              <div className="flex items-center gap-3 mb-8">
                <div
                  className="p-3 rounded-xl"
                  style={{ background: 'linear-gradient(135deg, #5bc7fa 0%, #74f7fd 55%, #5bc7fa 100%)' }}
                >
                  <Server className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-3xl font-bold" style={{ fontFamily: "'DouyuFont', sans-serif" }}>
                  端点文档
                </h2>
              </div>

              <EndpointCard
                id="upload"
                method="POST"
                path="/upload"
                description="上传遥感图像文件。支持 TIFF、PNG、JPEG 等常见格式，单文件最大支持 2GB。"
                tryIt={tryItConfigs.upload}
                request={{
                  params: [
                    { name: 'file', type: 'File', required: true, description: '图像文件 (multipart/form-data)' },
                    { name: 'name', type: 'string', required: false, description: '自定义文件名称' },
                    { name: 'description', type: 'string', required: false, description: '文件描述信息' },
                  ],
                }}
                response={`{
  "success": true,
  "data": {
    "image_id": "img_abc123",
    "filename": "satellite_image.tif",
    "size": 157286400,
    "format": "GeoTIFF",
    "dimensions": {
      "width": 10980,
      "height": 10980,
      "bands": 4
    },
    "crs": "EPSG:4326"
  }
}`}
              />

              <EndpointCard
                id="presets"
                method="GET"
                path="/presets"
                description="获取所有可用的处理预设配置，包括语义分割、目标检测、变化检测等任务类型的预设参数。"
                tryIt={tryItConfigs.presets}
                response={`{
  "success": true,
  "data": [
    {
      "id": "semantic_segmentation",
      "name": "语义分割",
      "description": "像素级分类任务，适用于地物分类",
      "default_tile_size": 512,
      "supported_formats": ["COCO", "VOC", "Mask"]
    },
    {
      "id": "object_detection",
      "name": "目标检测",
      "description": "边界框检测任务，适用于建筑物、车辆等目标",
      "default_tile_size": 640,
      "supported_formats": ["COCO", "YOLO", "VOC"]
    }
  ]
}`}
              />

              <EndpointCard
                id="create-task"
                method="POST"
                path="/tasks"
                description="创建新的数据集处理任务。任务创建后将在后台异步执行，可通过 WebSocket 或轮询接口获取实时进度。"
                tryIt={tryItConfigs['create-task']}
                request={{
                  params: [
                    { name: 'image_id', type: 'string', required: true, description: '已上传图像的 ID' },
                    { name: 'preset_id', type: 'string', required: true, description: '处理预设 ID' },
                    { name: 'classes', type: 'array', required: true, description: '目标类别列表' },
                    { name: 'tile_size', type: 'number', required: false, description: '切片尺寸 (默认: 512)' },
                    { name: 'overlap', type: 'number', required: false, description: '切片重叠率 (默认: 0.1)' },
                    { name: 'output_format', type: 'string', required: false, description: '输出格式: COCO/VOC/YOLO' },
                  ],
                  body: `{
  "image_id": "img_abc123",
  "preset_id": "semantic_segmentation",
  "classes": ["building", "road", "vegetation", "water"],
  "tile_size": 512,
  "overlap": 0.1,
  "output_format": "COCO"
}`,
                }}
                response={`{
  "success": true,
  "data": {
    "task_id": "task_xyz789",
    "status": "pending",
    "created_at": "2024-01-15T10:30:00Z",
    "estimated_time": 300
  }
}`}
              />

              <EndpointCard
                id="task-status"
                method="GET"
                path="/tasks/{id}"
                description="查询指定任务的当前状态和处理进度。"
                tryIt={tryItConfigs['task-status']}
                request={{
                  params: [
                    { name: 'id', type: 'string', required: true, description: '任务 ID (路径参数)' },
                  ],
                }}
                response={`{
  "success": true,
  "data": {
    "task_id": "task_xyz789",
    "status": "processing",
    "progress": 65,
    "current_step": "generating_annotations",
    "steps": [
      { "name": "tiling", "status": "completed", "progress": 100 },
      { "name": "inference", "status": "completed", "progress": 100 },
      { "name": "generating_annotations", "status": "processing", "progress": 45 },
      { "name": "packaging", "status": "pending", "progress": 0 }
    ],
    "started_at": "2024-01-15T10:30:05Z",
    "estimated_remaining": 120
  }
}`}
              />

              <EndpointCard
                id="download"
                method="GET"
                path="/download/{id}"
                description="下载已完成任务的数据集压缩包。仅当任务状态为 completed 时可用。"
                tryIt={tryItConfigs.download}
                request={{
                  params: [
                    { name: 'id', type: 'string', required: true, description: '任务 ID (路径参数)' },
                    { name: 'format', type: 'string', required: false, description: '压缩格式: zip/tar.gz (默认: zip)' },
                  ],
                }}
                response={`// 返回二进制文件流
// Content-Type: application/zip
// Content-Disposition: attachment; filename="dataset_task_xyz789.zip"`}
              />

              <EndpointCard
                id="websocket"
                method="WS"
                path="/ws/{id}"
                description="通过 WebSocket 实时接收任务处理进度更新。连接建立后，服务端将主动推送进度消息。"
                tryIt={tryItConfigs.websocket}
                request={{
                  params: [
                    { name: 'id', type: 'string', required: true, description: '任务 ID (路径参数)' },
                  ],
                }}
                response={`// WebSocket 消息格式
{
  "type": "progress",
  "data": {
    "task_id": "task_xyz789",
    "progress": 75,
    "current_step": "generating_annotations",
    "message": "正在生成标注文件...",
    "timestamp": "2024-01-15T10:32:15Z"
  }
}

// 任务完成消息
{
  "type": "completed",
  "data": {
    "task_id": "task_xyz789",
    "download_url": "/api/download/task_xyz789",
    "statistics": {
      "total_tiles": 256,
      "total_annotations": 1847,
      "file_size": 52428800
    }
  }
}`}
              />
            </section>

            <GradientDivider />

            {/* ─── 代码示例 ─── */}
            <section id="examples" data-section className="space-y-8">
              <div className="flex items-center gap-3 mb-8">
                <div
                  className="p-3 rounded-xl"
                  style={{ background: 'linear-gradient(135deg, #74fabd 0%, #74f7fd 100%)' }}
                >
                  <Code2 className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-3xl font-bold" style={{ fontFamily: "'DouyuFont', sans-serif" }}>
                  代码示例
                </h2>
              </div>

              <div id="python-example" data-section>
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(91, 199, 250, 0.2)' }}
                  >
                    <span className="text-[#5bc7fa] font-bold text-sm">Py</span>
                  </div>
                  <h3 className="text-xl font-semibold" style={{ fontFamily: "'DouyuFont', sans-serif" }}>
                    Python 示例
                  </h3>
                </div>
                <CodeBlock code={pythonExample} language="python" title="完整工作流示例" />
              </div>

              <div id="curl-example" data-section>
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(116, 250, 189, 0.18)' }}
                  >
                    <Terminal className="w-4 h-4 text-[#74fabd]" />
                  </div>
                  <h3 className="text-xl font-semibold" style={{ fontFamily: "'DouyuFont', sans-serif" }}>
                    cURL 示例
                  </h3>
                </div>
                <CodeBlock code={curlExample} language="bash" title="命令行请求示例" />
              </div>
            </section>
              </div>
            </WidgetPanel>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiDocsPage;
