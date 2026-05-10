/**
 * PageHeader - 各功能页统一的 hero header（主题色 + 装饰背景）
 * 
 * 不同 page 用不同主题色 + 装饰元素：
 *   - models     : 紫青色 + "晶片纹理" 网格
 *   - preprocess : 蓝青色 + "频谱" 流动条纹
 *   - tasks      : 橙青色 + "节点连线" 神经网络感
 *   - api-docs   : 绿青色 + 流动代码块
 */
import React from 'react';

export type PageTheme = 'models' | 'preprocess' | 'tasks' | 'apidocs' | 'dataset';

const titleFont = "'DouyuFont', sans-serif";
const serifFont = "'Source Serif 4', serif";
const bodyFont = "'SarasaMonoSC', monospace";

const THEMES: Record<PageTheme, {
  primary: string;
  secondary: string;
  glow: string;
  iconColor: string;
}> = {
  models:     { primary: '#a78bfa', secondary: '#74f7fd', glow: 'rgba(167,139,250,0.4)', iconColor: '#a78bfa' },
  preprocess: { primary: '#5bc7fa', secondary: '#74f7fd', glow: 'rgba(91,199,250,0.4)',  iconColor: '#5bc7fa' },
  tasks:      { primary: '#f97316', secondary: '#74fabd', glow: 'rgba(249,115,22,0.4)',  iconColor: '#f97316' },
  apidocs:    { primary: '#74fabd', secondary: '#5bc7fa', glow: 'rgba(116,250,189,0.4)', iconColor: '#74fabd' },
  dataset:    { primary: '#74f7fd', secondary: '#5bc7fa', glow: 'rgba(116,247,253,0.4)', iconColor: '#74f7fd' },
};

interface Props {
  theme: PageTheme;
  title: string;
  subtitle?: string;
  iconClass?: string;          // FontAwesome class，例如 "fa-solid fa-cubes"
  meta?: React.ReactNode;      // 右侧自定义内容（如统计、按钮等）
  decoration?: 'chip' | 'spectrum' | 'neural' | 'code' | 'satellite';
}

const PageHeader: React.FC<Props> = ({
  theme,
  title,
  subtitle,
  iconClass = 'fa-solid fa-circle-nodes',
  meta,
  decoration = 'chip',
}) => {
  const t = THEMES[theme];

  return (
    <div
      style={{
        position: 'relative',
        marginBottom: 20,
        padding: '20px 24px',
        background: `linear-gradient(135deg, rgba(5,50,106,0.85) 0%, rgba(5,50,106,0.65) 100%)`,
        border: `1px solid ${t.primary}33`,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: `0 8px 28px rgba(0,0,0,0.35), 0 0 30px ${t.glow}`,
      }}
    >
      {/* 主题装饰层 */}
      <DecorationLayer decoration={decoration} primary={t.primary} secondary={t.secondary} />

      {/* 内容层 */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 18 }}>
        {/* 图标 */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${t.primary}33, ${t.secondary}11)`,
            border: `1px solid ${t.primary}66`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `inset 0 0 20px ${t.primary}22, 0 0 16px ${t.glow}`,
            flexShrink: 0,
          }}
        >
          <i
            className={iconClass}
            style={{
              fontSize: 26,
              color: t.iconColor,
              textShadow: `0 0 12px ${t.glow}`,
            }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: titleFont,
              fontSize: 22,
              letterSpacing: 2,
              background: `linear-gradient(180deg, #fff, ${t.primary})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: 2,
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontFamily: serifFont,
                fontStyle: 'italic',
                fontSize: 12,
                color: 'rgba(185,207,255,0.65)',
                letterSpacing: 0.5,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {meta && <div style={{ flexShrink: 0 }}>{meta}</div>}
      </div>

      {/* 学术装饰：左下角 latitude/longitude 风格刻度 */}
      <div
        style={{
          position: 'absolute',
          bottom: 6,
          left: 12,
          fontSize: 9,
          color: `${t.primary}88`,
          fontFamily: serifFont,
          fontStyle: 'italic',
          letterSpacing: 1.5,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >
        ⌜ {decoration.toUpperCase()} · {theme.toUpperCase()} ⌝
      </div>

      {/* 右下角时间戳风格 */}
      <div
        style={{
          position: 'absolute',
          bottom: 6,
          right: 12,
          fontSize: 9,
          color: `${t.primary}88`,
          fontFamily: bodyFont,
          letterSpacing: 1,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >
        SYS::{theme.toUpperCase()}_v1
      </div>
    </div>
  );
};

// ====================================================================
// 装饰层：根据 decoration 类型渲染不同的背景动效
// ====================================================================
const DecorationLayer: React.FC<{ decoration: string; primary: string; secondary: string }> = ({
  decoration,
  primary,
  secondary,
}) => {
  if (decoration === 'chip') {
    // 晶片纹理：方格 + 节点 + 走线
    return (
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0.18,
          pointerEvents: 'none',
        }}
        viewBox="0 0 800 100"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id="chip-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke={primary} strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="800" height="100" fill="url(#chip-grid)" />
        {/* 节点 + 连线 */}
        {[100, 220, 340, 460, 580, 700].map((x, i) => (
          <g key={i}>
            <circle cx={x} cy={50} r="3" fill={secondary} opacity="0.6">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
            </circle>
            {i < 5 && (
              <line x1={x} y1={50} x2={x + 120} y2={50} stroke={primary} strokeWidth="1" opacity="0.4" />
            )}
            <circle cx={x} cy={20} r="1.5" fill={primary} opacity="0.5" />
            <circle cx={x} cy={80} r="1.5" fill={primary} opacity="0.5" />
            <line x1={x} y1={20} x2={x} y2={80} stroke={primary} strokeWidth="0.5" opacity="0.3" />
          </g>
        ))}
      </svg>
    );
  }

  if (decoration === 'spectrum') {
    // 频谱：垂直波形条
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 2,
          padding: '0 24px',
          opacity: 0.16,
          pointerEvents: 'none',
        }}
      >
        {Array.from({ length: 60 }).map((_, i) => {
          const h = 20 + Math.abs(Math.sin(i * 0.4 + i * 0.13) * 60);
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${h}%`,
                background: `linear-gradient(180deg, ${primary}, ${secondary})`,
                borderRadius: 2,
                animation: `pulse ${1.5 + (i % 7) * 0.2}s ease-in-out infinite alternate`,
                animationDelay: `${(i % 11) * 0.1}s`,
              }}
            />
          );
        })}
        <style>{`
          @keyframes pulse {
            0% { transform: scaleY(0.8); opacity: 0.5; }
            100% { transform: scaleY(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  if (decoration === 'neural') {
    // 神经网络：节点圆 + 连线动画
    return (
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0.2,
          pointerEvents: 'none',
        }}
        viewBox="0 0 800 100"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* 三层神经元 */}
        {[150, 400, 650].map((x, layer) => (
          <g key={layer}>
            {[20, 50, 80].map((y, n) => (
              <circle
                key={n}
                cx={x}
                cy={y}
                r="4"
                fill={layer === 1 ? secondary : primary}
                opacity="0.7"
              >
                <animate attributeName="r" values="3;5;3" dur="3s" begin={`${(layer * 3 + n) * 0.2}s`} repeatCount="indefinite" />
              </circle>
            ))}
          </g>
        ))}
        {/* 连线 */}
        {[150, 400].map((x1, l) => {
          const x2 = [400, 650][l];
          return [20, 50, 80].flatMap((y1, i) =>
            [20, 50, 80].map((y2, j) => (
              <line
                key={`${l}-${i}-${j}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={primary}
                strokeWidth="0.4"
                opacity="0.3"
              />
            )),
          );
        })}
      </svg>
    );
  }

  if (decoration === 'code') {
    // 代码块：字符流
    const chars = '01∇λ⟨⟩{}[]∑Σπτφ→←↑↓∈∂∇∮∫∞';
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.11,
          fontFamily: bodyFont,
          fontSize: 11,
          color: primary,
          pointerEvents: 'none',
          overflow: 'hidden',
          padding: '8px',
          letterSpacing: 1,
          lineHeight: 1.4,
        }}
      >
        {Array.from({ length: 7 }).map((_, line) => (
          <div key={line} style={{ whiteSpace: 'nowrap' }}>
            {Array.from({ length: 100 }).map((__, c) => chars[(line * 7 + c) % chars.length]).join(' ')}
          </div>
        ))}
      </div>
    );
  }

  if (decoration === 'satellite') {
    // 卫星轨道：绕中心圆环 + 卫星图标
    return (
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0.22,
          pointerEvents: 'none',
        }}
        viewBox="0 0 800 100"
        preserveAspectRatio="xMidYMid slice"
      >
        {[40, 80, 120].map((r, i) => (
          <ellipse
            key={i}
            cx={400}
            cy={50}
            rx={r * 3}
            ry={r * 0.4}
            fill="none"
            stroke={primary}
            strokeWidth="0.5"
            strokeDasharray={i === 1 ? '4 2' : 'none'}
          />
        ))}
        <circle cx={400} cy={50} r={14} fill={secondary} opacity="0.4" />
        <circle cx={400} cy={50} r={6} fill={primary} />
      </svg>
    );
  }

  return null;
};

export default PageHeader;
