/** 沉浸式翻译入口（悬浮按钮）的样式与渲染 */
import type { ImmersiveStatus } from './types';

export function createFabStyles(): string {
  return `
    :host, * { box-sizing: border-box; }
    .dm-fab-wrap {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483645;
      font-family: "IBM Plex Sans", "Noto Sans SC", system-ui, sans-serif;
      pointer-events: auto;
    }
    .dm-fab {
      appearance: none;
      border: 1px solid #c9d9ea;
      background: linear-gradient(165deg, #ffffff 0%, #eaf3fc 100%);
      color: #1466ad;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      padding: 8px 12px;
      border-radius: 999px;
      box-shadow: 0 6px 18px rgba(15, 47, 77, 0.18);
      cursor: pointer;
      white-space: nowrap;
    }
    .dm-fab:hover { background: #e8f2fc; }
    .dm-fab[data-state="running"] {
      background: #1b7fd1;
      border-color: #1b7fd1;
      color: #fff;
    }
    .dm-fab[data-state="active"] {
      background: #1b7fd1;
      border-color: #1b7fd1;
      color: #fff;
    }
    .dm-fab[data-state="error"] { border-color: #f0b4ad; color: #b42318; }
    .dm-fab[data-state="warning"] {
      background: #d9a13b;
      border-color: #d9a13b;
      color: #fff;
    }
  `;
}

/** 按运行状态刷新悬浮按钮的文案与样式 */
export function renderFab(button: HTMLButtonElement, status: ImmersiveStatus): void {
  delete button.dataset.state;

  if (status.running) {
    button.dataset.state = 'running';
    button.textContent = `翻译中 ${status.done}/${status.total}`;
    button.title = '点击停止并还原原文';
    return;
  }
  if (status.active) {
    button.dataset.state = status.error
      ? 'error'
      : status.untranslated > 0
        ? 'warning'
        : 'active';
    button.textContent = '显示原文';
    button.title =
      status.untranslated > 0
        ? `${status.untranslated} 段未翻译 · 点击还原原文`
        : status.error || '点击还原原文';
    return;
  }
  button.dataset.state = status.error ? 'error' : 'idle';
  button.textContent = '沉浸译';
  button.title = status.error || '翻译整个网页';
}
