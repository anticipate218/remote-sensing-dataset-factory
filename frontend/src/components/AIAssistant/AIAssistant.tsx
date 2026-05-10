import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Badge, Button, Dropdown, Input, Tag, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  CloseOutlined,
  CompassOutlined,
  RobotOutlined,
  SendOutlined,
  ThunderboltOutlined,
  RocketOutlined,
  FireOutlined,
  EyeOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { AnimatePresence, motion } from 'framer-motion';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;       // 该消息使用的模型（assistant 消息）
  modelTier?: string;   // 模型档位
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface ParsedMessage {
  text: string;
  navPath: string | null;
}

interface ChatModelInfo {
  id: string;
  name: string;
  tier: string;
  desc: string;
  max_tokens: number;
  supports_vision: boolean;
}

// 内置默认模型列表（如果后端 API 失败时回退使用）
const DEFAULT_MODELS: ChatModelInfo[] = [
  { id: 'gpt-5.5',         name: 'GPT-5.5',         tier: 'Standard', desc: '标准版，平衡速度与质量',  max_tokens: 1024, supports_vision: true },
  { id: 'gpt-5.5-pro',     name: 'GPT-5.5 Pro',     tier: 'Pro',      desc: '深度推理，复杂任务最佳',  max_tokens: 2048, supports_vision: true },
  { id: 'gpt-5.5-mini',    name: 'GPT-5.5 Mini',    tier: 'Fast',     desc: '轻量极速版，短问答首选',  max_tokens: 512,  supports_vision: false },
  { id: 'gpt-5.5-vision',  name: 'GPT-5.5 Vision',  tier: 'Vision',   desc: '视觉多模态版',           max_tokens: 1024, supports_vision: true },
];

const TIER_ICON: Record<string, React.ReactNode> = {
  Standard: <ThunderboltOutlined />,
  Pro:      <RocketOutlined />,
  Fast:     <FireOutlined />,
  Vision:   <EyeOutlined />,
};

const TIER_COLOR: Record<string, string> = {
  Standard: '#74f7fd',
  Pro:      '#a78bfa',
  Fast:     '#74fabd',
  Vision:   '#f0c040',
};

const WELCOME_MSG =
  '你好！我是 RS Factory 智能助手，基于 **GPT-5.5** 系列驱动。\n\n你可以：\n• 问我关于遥感数据集制作、目标检测、超分等任何问题\n• 让我帮你导航到对应功能页面（如「去模型管理」「打开预处理」）\n• 在右上角切换 **GPT-5.5 / Pro / Mini / Vision** 适应不同场景';

const QUICK_CHIPS = [
  '如何制作数据集？',
  '超分辨率怎么用？',
  '支持哪些格式？',
  '去下游任务页面',
];

const CONTEXT_PREFIX: Record<string, string> = {
  '/': '用户当前在首页。',
  '/dataset': '用户当前在数据集制作页面。',
  '/preprocess': '用户当前在数据预处理页面。',
  '/tasks': '用户当前在下游任务页面（目标检测、超分辨率等）。',
  '/models': '用户当前在模型管理页面。',
  '/api-docs': '用户当前在API文档页面。',
};

const NAV_PATTERN = /\[NAV:(\/[^\]]*)\]/g;

function parseNavCommands(raw: string): ParsedMessage {
  let navPath: string | null = null;
  const match = NAV_PATTERN.exec(raw);
  if (match) navPath = match[1];
  NAV_PATTERN.lastIndex = 0;
  const text = raw.replace(NAV_PATTERN, '').trim();
  return { text, navPath };
}

function renderBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} style={{ color: '#74f7fd' }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const TypingDots: React.FC = () => (
  <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: '#74f7fd',
          display: 'inline-block',
          animation: `dotPulse 1.4s ease-in-out ${i * 0.2}s infinite`,
        }}
      />
    ))}
  </span>
);

const KEYFRAMES = `
@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1.1); }
}
@keyframes fabGlow {
  0%, 100% { box-shadow: 0 0 12px rgba(116,247,253,0.3), 0 4px 24px rgba(0,0,0,0.5); }
  50% { box-shadow: 0 0 24px rgba(116,247,253,0.55), 0 4px 24px rgba(0,0,0,0.5); }
}
`;

const AIAssistant: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: WELCOME_MSG, model: 'gpt-5.5', modelTier: 'Standard' },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [unread, setUnread] = useState(0);
  const [models, setModels] = useState<ChatModelInfo[]>(DEFAULT_MODELS);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('rs_chat_model') || 'gpt-5.5';
  });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const stylesInjected = useRef(false);

  useEffect(() => {
    if (!stylesInjected.current) {
      const style = document.createElement('style');
      style.textContent = KEYFRAMES;
      document.head.appendChild(style);
      stylesInjected.current = true;
    }
  }, []);

  // 拉取可用模型列表
  useEffect(() => {
    fetch('/api/chat/models')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.models?.length) {
          setModels(data.models);
          // 如果用户当前选的模型不在列表里，回退到默认
          const ids = new Set(data.models.map((m: ChatModelInfo) => m.id));
          if (!ids.has(selectedModel) && data.default) {
            setSelectedModel(data.default);
          }
        }
      })
      .catch(() => { /* 静默回退到 DEFAULT_MODELS */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSelectModel = useCallback((id: string) => {
    setSelectedModel(id);
    localStorage.setItem('rs_chat_model', id);
    const m = models.find((mm) => mm.id === id);
    if (m) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `已切换到 **${m.name}** · ${m.desc}`,
          model: m.id,
          modelTier: m.tier,
        },
      ]);
    }
  }, [models]);

  const currentModelInfo = models.find((m) => m.id === selectedModel) || DEFAULT_MODELS[0];

  const handleSend = useCallback(
    async (text?: string) => {
      const msg = (text ?? inputValue).trim();
      if (!msg || isTyping) return;

      const userMsg: ChatMessage = { role: 'user', content: msg };
      const contextKey =
        Object.keys(CONTEXT_PREFIX).find((k) =>
          k === '/' ? location.pathname === '/' : location.pathname.startsWith(k),
        ) ?? '/';
      const systemMsg: ChatMessage = {
        role: 'system',
        content: CONTEXT_PREFIX[contextKey],
      };

      const updated = [...messages, userMsg];
      setMessages(updated);
      setInputValue('');
      setIsTyping(true);

      try {
        const resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [systemMsg, ...updated],
            model: selectedModel,
          }),
        });
        const data = await resp.json();
        const reply = data.reply || '抱歉，暂时无法回答。';
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: reply,
            model: data.requested_model || data.model || selectedModel,
            modelTier: data.model_tier,
            usage: data.usage,
          },
        ]);
        if (!open) setUnread((n) => n + 1);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '网络错误，请稍后重试。', model: selectedModel },
        ]);
        if (!open) setUnread((n) => n + 1);
      } finally {
        setIsTyping(false);
      }
    },
    [inputValue, isTyping, messages, location.pathname, open, selectedModel],
  );

  const toggleOpen = () => {
    setOpen((v) => {
      if (!v) setUnread(0);
      return !v;
    });
  };

  const displayMessages = messages.filter((m) => m.role !== 'system');
  const showChips = displayMessages.length <= 1 && !isTyping;

  return (
    <>
      {/* Floating action button */}
      <Tooltip title="AI 助手" placement="left">
        <div
          role="button"
          aria-label="AI 助手"
          tabIndex={0}
          onClick={toggleOpen}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleOpen(); }}
          style={{
            position: 'fixed',
            bottom: 28,
            right: 28,
            zIndex: 1100,
            cursor: 'pointer',
          }}
        >
          <Badge count={unread} size="small" offset={[-4, 4]}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(116, 247, 253, 0.2)',
                border: '1px solid #74f7fd',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'fabGlow 3s ease-in-out infinite',
                transition: 'transform 0.2s, box-shadow 0.25s ease',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = 'scale(1.1)';
                el.style.animation = 'none';
                el.style.boxShadow =
                  '0 0 28px rgba(116, 247, 253, 0.65), 0 0 52px rgba(116, 247, 253, 0.35), 0 4px 24px rgba(0,0,0,0.45)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = 'scale(1)';
                el.style.boxShadow = '';
                el.style.animation = 'fabGlow 3s ease-in-out infinite';
              }}
            >
              {open ? (
                <CloseOutlined style={{ fontSize: 20, color: '#fff' }} />
              ) : (
                <RobotOutlined style={{ fontSize: 22, color: '#fff' }} />
              )}
            </div>
          </Badge>
        </div>
      </Tooltip>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            style={{
              position: 'fixed',
              bottom: 92,
              right: 28,
              width: 400,
              height: 520,
              zIndex: 1099,
              borderRadius: 16,
              overflow: 'hidden',
              background: 'rgba(5, 50, 106, 0.95)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(116, 247, 253, 0.2)',
              boxShadow:
                '0 8px 40px rgba(0,0,0,0.55), 0 0 60px rgba(116,247,253,0.08)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(116,247,253,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Avatar
                size={30}
                icon={<RobotOutlined />}
                style={{
                  background: 'linear-gradient(135deg, #74f7fd, #5bc7fa)',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  flex: 1,
                  fontFamily: "'DouyuFont', sans-serif",
                }}
              >
                AI 智能助手
              </span>
              {/* GPT-5.5 系列模型选择器 */}
              <Dropdown
                trigger={['click']}
                placement="bottomRight"
                overlayStyle={{ zIndex: 1200 }}
                dropdownRender={(menu) => (
                  <div style={{
                    background: 'rgba(2, 14, 31, 0.97)',
                    border: '1px solid rgba(116, 247, 253, 0.25)',
                    borderRadius: 10,
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
                  }}>
                    {React.cloneElement(menu as React.ReactElement, {
                      style: { background: 'transparent', border: 'none', boxShadow: 'none' },
                    })}
                  </div>
                )}
                menu={{
                  items: models.map((m): NonNullable<MenuProps['items']>[number] => ({
                    key: m.id,
                    label: (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 4px', minWidth: 220 }}>
                        <span style={{ color: TIER_COLOR[m.tier] || '#74f7fd', fontSize: 14, marginTop: 2 }}>
                          {TIER_ICON[m.tier] || <ThunderboltOutlined />}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                            <Tag color={selectedModel === m.id ? 'cyan' : undefined} style={{ margin: 0, fontSize: 9, lineHeight: '14px' }}>
                              {m.tier}
                            </Tag>
                          </div>
                          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, lineHeight: 1.5, marginTop: 2 }}>
                            {m.desc}
                          </div>
                        </div>
                      </div>
                    ),
                    onClick: () => handleSelectModel(m.id),
                  })),
                }}
              >
                <div
                  role="button"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 9px',
                    borderRadius: 6,
                    background: 'rgba(116, 247, 253, 0.1)',
                    border: '1px solid rgba(116, 247, 253, 0.35)',
                    cursor: 'pointer',
                    fontFamily: "'Source Serif 4', serif",
                    fontSize: 10,
                    color: '#74f7fd',
                    transition: 'all 0.18s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(116, 247, 253, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(116, 247, 253, 0.1)';
                  }}
                >
                  <span style={{ color: TIER_COLOR[currentModelInfo.tier] || '#74f7fd', fontSize: 11 }}>
                    {TIER_ICON[currentModelInfo.tier] || <ThunderboltOutlined />}
                  </span>
                  <span>{currentModelInfo.name}</span>
                  <DownOutlined style={{ fontSize: 8, opacity: 0.7 }} />
                </div>
              </Dropdown>
            </div>

            {/* Messages */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {displayMessages.map((msg, i) => {
                const isUser = msg.role === 'user';
                const parsed = isUser
                  ? { text: msg.content, navPath: null }
                  : parseNavCommands(msg.content);

                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: isUser ? 'flex-end' : 'flex-start',
                      flexDirection: 'column',
                      alignItems: isUser ? 'flex-end' : 'flex-start',
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '85%',
                        padding: '9px 14px',
                        borderRadius: isUser
                          ? '12px 12px 2px 12px'
                          : '12px 12px 12px 2px',
                        background: isUser
                          ? 'rgba(116, 247, 253, 0.1)'
                          : 'rgba(5, 50, 106, 0.6)',
                        border: `1px solid ${
                          isUser
                            ? 'rgba(116, 247, 253, 0.22)'
                            : 'rgba(116, 247, 253, 0.12)'
                        }`,
                        fontSize: 13,
                        color: 'rgba(255,255,255,0.85)',
                        lineHeight: 1.7,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {renderBold(parsed.text)}
                    </div>
                    {/* assistant 消息底部小标签：模型 + token 用量 */}
                    {!isUser && msg.model && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 9,
                        color: TIER_COLOR[msg.modelTier || 'Standard'] || 'rgba(116,247,253,0.55)',
                        opacity: 0.7,
                        fontFamily: "'SarasaMonoSC', monospace",
                        paddingLeft: 4,
                      }}>
                        <span>{TIER_ICON[msg.modelTier || 'Standard']}</span>
                        <span>{msg.model}</span>
                        {msg.usage && msg.usage.total_tokens > 0 && (
                          <>
                            <span style={{ opacity: 0.4 }}>·</span>
                            <span>{msg.usage.total_tokens} tokens</span>
                          </>
                        )}
                      </div>
                    )}
                    {parsed.navPath && (
                      <Button
                        size="small"
                        type="link"
                        icon={<CompassOutlined />}
                        onClick={() => {
                          navigate(parsed.navPath!);
                          setOpen(false);
                        }}
                        style={{
                          color: '#74f7fd',
                          fontSize: 12,
                          padding: '2px 8px',
                          height: 'auto',
                          border: '1px solid rgba(116,247,253,0.25)',
                          borderRadius: 8,
                          background: 'rgba(116,247,253,0.08)',
                        }}
                      >
                        前往 {parsed.navPath}
                      </Button>
                    )}
                  </div>
                );
              })}

              {isTyping && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                  }}
                >
                  <div
                    style={{
                      padding: '9px 16px',
                      borderRadius: '12px 12px 12px 2px',
                      background: 'rgba(5, 50, 106, 0.6)',
                      border: '1px solid rgba(116, 247, 253, 0.12)',
                      color: 'rgba(255,255,255,0.4)',
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    思考中 <TypingDots />
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Quick action chips */}
            {showChips && (
              <div
                style={{
                  padding: '0 16px 10px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                {QUICK_CHIPS.map((chip) => (
                  <Button
                    key={chip}
                    size="small"
                    onClick={() => handleSend(chip)}
                    style={{
                      borderRadius: 14,
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.7)',
                      background: 'rgba(116,247,253,0.06)',
                      border: '1px solid rgba(116,247,253,0.18)',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'rgba(116,247,253,0.14)';
                      (e.currentTarget as HTMLButtonElement).style.color = '#74f7fd';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'rgba(116,247,253,0.06)';
                      (e.currentTarget as HTMLButtonElement).style.color =
                        'rgba(255,255,255,0.7)';
                    }}
                  >
                    {chip}
                  </Button>
                ))}
              </div>
            )}

            {/* Input area */}
            <div
              style={{
                padding: '10px 14px',
                borderTop: '1px solid rgba(116,247,253,0.08)',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onPressEnter={() => handleSend()}
                placeholder="输入消息..."
                style={{
                  flex: 1,
                  borderRadius: 10,
                  background: 'rgba(5, 50, 106, 0.5)',
                  borderColor: 'rgba(91, 199, 250, 0.15)',
                  color: 'rgba(255,255,255,0.85)',
                }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isTyping}
                style={{
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #74f7fd, #5bc7fa)',
                  border: 'none',
                  height: 34,
                  width: 34,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIAssistant;
