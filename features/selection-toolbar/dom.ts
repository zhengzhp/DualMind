/** 划词浮层样式（注入 Shadow DOM） */
export function createToolbarStyles(fontCss = ''): string {
  return `${fontCss}

    :host, * { box-sizing: border-box; }
    .dm-wrap {
      --dm-tb-surface: #ffffff;
      --dm-tb-surface-2: #fafafc;
      --dm-tb-ink: #1d1d1f;
      --dm-tb-ink-2: #6e6e73;
      --dm-tb-ink-3: #8e8e93;
      --dm-tb-line: #e6e6eb;
      --dm-tb-accent: #1466ad;
      --dm-tb-accent-hover: #12528c;
      --dm-tb-accent-soft: #eaf3fb;
      --dm-tb-danger: #c4342d;
      --dm-tb-on-accent: #ffffff;
      position: fixed;
      z-index: 2147483646;
      font-family: "IBM Plex Sans", "IBM Plex Sans SC", "PingFang SC",
        "Microsoft YaHei", system-ui, sans-serif;
      font-size: 14px;
      color: var(--dm-tb-ink);
      pointer-events: auto;
    }
    .dm-wrap[data-dm-theme="dark"] {
      --dm-tb-surface: #1a1d23;
      --dm-tb-surface-2: #21252c;
      --dm-tb-ink: #f2f3f5;
      --dm-tb-ink-2: #a6adb8;
      --dm-tb-ink-3: #6b7280;
      --dm-tb-line: #2b3038;
      --dm-tb-accent: #6faeec;
      --dm-tb-accent-hover: #8cc2f2;
      --dm-tb-accent-soft: #1b2a3a;
      --dm-tb-danger: #f2777a;
      --dm-tb-on-accent: #0b1220;
    }
    .dm-card {
      position: relative;
      width: 300px;
      max-width: calc(100vw - 24px);
      background: var(--dm-tb-surface);
      border: 1px solid var(--dm-tb-line);
      border-radius: 10px;
      box-shadow: 0 12px 32px rgba(15, 23, 32, 0.14);
      overflow: hidden;
    }
    /* 加载中：顶部 2px 不确定进度条，替换旧的转圈 loader */
    .dm-progress {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      overflow: hidden;
      background: var(--dm-tb-accent-soft);
      z-index: 1;
    }
    .dm-progress::before {
      content: "";
      display: block;
      width: 40%;
      height: 100%;
      background: var(--dm-tb-accent);
      animation: dm-progress 1.1s ease-in-out infinite;
    }
    .dm-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px;
      border-bottom: 1px solid var(--dm-tb-line);
      background: var(--dm-tb-surface);
    }
    .dm-btn.primary {
      appearance: none;
      border: 0;
      background: var(--dm-tb-accent);
      color: var(--dm-tb-on-accent);
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      height: 32px;
      padding: 0 12px;
      border-radius: 6px;
      cursor: pointer;
      margin-right: auto;
      text-align: center;
    }
    .dm-btn.primary:hover { background: var(--dm-tb-accent-hover); }
    .dm-btn.primary:disabled { opacity: 0.5; cursor: default; }
    .dm-icon-btn {
      appearance: none;
      border: 0;
      background: transparent;
      color: var(--dm-tb-ink-2);
      width: 32px;
      height: 32px;
      padding: 0;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .dm-icon-btn:hover { background: var(--dm-tb-surface-2); color: var(--dm-tb-ink); }
    .dm-icon-btn:disabled { opacity: 0.4; cursor: default; }
    .dm-icon-btn.active { background: var(--dm-tb-accent-soft); color: var(--dm-tb-accent); }
    .dm-icon-btn svg { width: 16px; height: 16px; display: block; }
    .dm-body {
      padding: 10px 12px 12px;
      line-height: 1.55;
      max-height: 240px;
      overflow: auto;
    }
    .dm-status {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .dm-status-text { min-width: 0; }
    .dm-text {
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 14px;
      line-height: 1.6;
    }
    /* 仅当上方状态行可见时，正文才需要额外间距 */
    .dm-status:not([hidden]) + .dm-text:not([hidden]) { margin-top: 6px; }
    .dm-muted { color: var(--dm-tb-ink-2); }
    .dm-error { color: var(--dm-tb-danger); }
    /* [hidden] 的 UA display:none 优先级低于作者样式，需显式声明 */
    .dm-status[hidden],
    .dm-text[hidden],
    .dm-progress[hidden] { display: none; }
    @keyframes dm-progress {
      0% { transform: translateX(-110%); }
      100% { transform: translateX(360%); }
    }
    @media (prefers-reduced-motion: reduce) {
      .dm-progress::before { animation: none; width: 100%; }
    }
  `;
}

export function getSelectionText(): string {
  const sel = window.getSelection();
  return sel?.toString().trim() ?? '';
}

export function getSelectionRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;
  return rect;
}

export const TOOLBAR_ID = 'dualmind-selection-toolbar';
