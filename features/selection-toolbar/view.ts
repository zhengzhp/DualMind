/** 划词浮层渲染状态（纯数据，便于外部驱动） */
export interface ToolbarViewState {
  visible: boolean;
  loading: boolean;
  translatedText: string;
  error: string;
}

export interface ToolbarView {
  /** 外层定位元素（floating 元素），由 position.ts 写 left/top */
  readonly el: HTMLElement;
  render(state: ToolbarViewState): void;
}

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
        <div class="dm-actions">
          <button class="dm-btn primary" data-action="translate">翻译</button>
          <button class="dm-btn" data-action="copy">复制</button>
          <button class="dm-btn" data-action="panel">侧边栏</button>
          <button class="dm-btn" data-action="close">关闭</button>
        </div>
        <div class="dm-body">
          <div class="dm-status" hidden>
            <span class="dm-loader" hidden></span>
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
  const statusEl = root.querySelector<HTMLElement>('.dm-status')!;
  const loader = root.querySelector<HTMLElement>('.dm-loader')!;
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

      // 状态行：loading 或 error 时展示，其余情况整行隐藏
      const isError = Boolean(state.error) && !state.loading;
      const statusContent = state.loading
        ? state.translatedText
          ? '生成中…'
          : '翻译中…'
        : state.error;
      statusEl.hidden = !statusContent;
      loader.hidden = !state.loading;
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
