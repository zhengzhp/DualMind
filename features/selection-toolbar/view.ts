/** 划词浮层渲染状态（纯数据，便于外部驱动） */
export interface ToolbarViewState {
  visible: boolean;
  loading: boolean;
  translatedText: string;
  error: string;
  /** Side Panel 是否已打开（按钮文案切换） */
  panelOpen: boolean;
  /** 刚刚复制成功（复制按钮短暂切换文案，给出反馈） */
  copied: boolean;
}

export interface ToolbarView {
  /** 外层定位元素（floating 元素），由 position.ts 写 left/top */
  readonly el: HTMLElement;
  render(state: ToolbarViewState): void;
}

const COPY_ICON =
  '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="7" y="3" width="9" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M13 3v-.5A1.5 1.5 0 0 0 11.5 1h-6A1.5 1.5 0 0 0 4 2.5v8A1.5 1.5 0 0 0 5.5 12H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

const PANEL_ICON =
  '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M12 4v12" stroke="currentColor" stroke-width="1.5"/></svg>';

const CLOSE_ICON =
  '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

/**
 * 创建浮层视图。
 *
 * 关键：DOM 骨架只构建一次，后续只改「文本 / 属性」，绝不重写 innerHTML。
 * 原因是浏览器要求 mousedown 与 mouseup 落在同一个节点才会派发 click；
 * 若流式输出时不断重建按钮节点，用户点击「停止 / 关闭」就会偶发失效。
 */
export function createToolbarView(root: HTMLElement): ToolbarView {
  root.innerHTML = `
    <div class="dm-wrap">
      <div class="dm-card">
        <div class="dm-progress" hidden></div>
        <div class="dm-actions">
          <button class="dm-btn primary" data-action="translate">翻译</button>
          <button class="dm-icon-btn" data-action="copy" aria-label="复制译文" title="复制译文">${COPY_ICON}</button>
          <button class="dm-icon-btn" data-action="panel" aria-label="打开侧边栏" title="打开侧边栏" aria-pressed="false">${PANEL_ICON}</button>
          <button class="dm-icon-btn" data-action="close" aria-label="关闭" title="关闭">${CLOSE_ICON}</button>
        </div>
        <div class="dm-body">
          <div class="dm-status" hidden>
            <span class="dm-status-text"></span>
          </div>
          <div class="dm-text" hidden></div>
        </div>
      </div>
    </div>`;

  const el = root.querySelector<HTMLElement>('.dm-wrap')!;
  const primary = root.querySelector<HTMLButtonElement>(
    '[data-action="translate"]',
  )!;
  const copy = root.querySelector<HTMLButtonElement>('[data-action="copy"]')!;
  const panel = root.querySelector<HTMLButtonElement>('[data-action="panel"]')!;
  const progress = root.querySelector<HTMLElement>('.dm-progress')!;
  const statusEl = root.querySelector<HTMLElement>('.dm-status')!;
  const statusText = root.querySelector<HTMLElement>('.dm-status-text')!;
  const textEl = root.querySelector<HTMLElement>('.dm-text')!;

  // 初始隐藏：未划词时不占据任何交互区域
  el.style.display = 'none';

  return {
    el,
    render(state) {
      el.style.display = state.visible ? '' : 'none';
      if (!state.visible) return;

      // 主按钮在「翻译 / 停止」之间切换
      primary.textContent = state.loading ? '停止' : '翻译';
      primary.dataset.action = state.loading ? 'stop' : 'translate';

      copy.disabled = !state.translatedText;
      // 复制成功反馈：图标按钮用 active 底色 + 标题反馈，由 mount 侧定时复位
      copy.classList.toggle('active', state.copied);
      copy.title = state.copied ? '已复制' : '复制译文';
      copy.setAttribute('aria-label', state.copied ? '已复制' : '复制译文');

      // 侧边栏开关：打开时显示高亮，标题切换为「收起侧栏」
      panel.classList.toggle('active', state.panelOpen);
      panel.setAttribute('aria-pressed', state.panelOpen ? 'true' : 'false');
      panel.title = state.panelOpen ? '收起侧栏' : '打开侧边栏';
      panel.setAttribute(
        'aria-label',
        state.panelOpen ? '收起侧栏' : '打开侧边栏',
      );

      // 加载中用顶部进度条表达；状态行只负责文案
      progress.hidden = !state.loading;

      // 状态行：loading 或 error 时展示，其余情况整行隐藏
      const isError = Boolean(state.error) && !state.loading;
      const statusContent = state.loading
        ? state.translatedText
          ? '生成中…'
          : '翻译中…'
        : state.error;
      statusEl.hidden = !statusContent;
      statusText.textContent = statusContent;
      statusText.className = isError
        ? 'dm-status-text dm-error'
        : 'dm-status-text dm-muted';

      // textContent 天然转义，无需再手写 escapeHtml
      textEl.textContent = state.translatedText;
      textEl.hidden = !state.translatedText;
    },
  };
}
