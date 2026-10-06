/** 划词浮层样式（注入 Shadow DOM） */
export function createToolbarStyles(): string {
  return `
    :host, * { box-sizing: border-box; }
    .dm-wrap {
      position: fixed;
      z-index: 2147483646;
      font-family: "IBM Plex Sans", "Noto Sans SC", system-ui, sans-serif;
      font-size: 13px;
      color: #0f2f4d;
      pointer-events: auto;
    }
    .dm-card {
      min-width: 220px;
      max-width: 360px;
      background: linear-gradient(165deg, #ffffff 0%, #f3f8fd 100%);
      border: 1px solid #c9d9ea;
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(15, 47, 77, 0.16);
      overflow: hidden;
    }
    .dm-actions {
      display: flex;
      gap: 4px;
      padding: 6px;
      border-bottom: 1px solid #e2ebf4;
      background: rgba(255,255,255,0.85);
    }
    .dm-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: #1466ad;
      font: inherit;
      font-weight: 600;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
    }
    .dm-btn:hover { background: #e8f2fc; }
    .dm-btn:disabled { opacity: 0.5; cursor: default; }
    .dm-btn.active { background: #e8f2fc; box-shadow: inset 0 0 0 1px #9dbfe0; }
    .dm-btn.primary {
      background: #1b7fd1;
      color: #fff;
    }
    .dm-btn.primary:hover { background: #1466ad; }
    .dm-body {
      padding: 10px 12px 12px;
      line-height: 1.5;
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
    }
    /* 仅当上方状态行可见时，正文才需要额外间距 */
    .dm-status:not([hidden]) + .dm-text:not([hidden]) { margin-top: 6px; }
    .dm-muted { color: #5a7390; }
    .dm-error { color: #b42318; }
    .dm-loader {
      display: inline-block;
      width: 12px; height: 12px;
      border: 2px solid #c9d9ea;
      border-top-color: #1b7fd1;
      border-radius: 50%;
      animation: dm-spin 0.7s linear infinite;
      flex: none;
    }
    /* [hidden] 的 UA display:none 优先级低于作者样式，需显式声明 */
    .dm-status[hidden],
    .dm-text[hidden],
    .dm-loader[hidden] { display: none; }
    @keyframes dm-spin { to { transform: rotate(360deg); } }
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
