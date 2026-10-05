import { type ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { browser } from 'wxt/browser';
import { sendMessage } from '@/shared/messaging/client';
import type { AppSettings } from '@/shared/storage/types';
import {
  TOOLBAR_ID,
  createToolbarStyles,
  escapeHtml,
  getSelectionRect,
  getSelectionText,
} from './dom';

interface ToolbarState {
  sourceText: string;
  translatedText: string;
  loading: boolean;
  error: string;
  visible: boolean;
}

/**
 * 在页面上挂载划词工具栏（Shadow DOM）
 * 翻译请求一律走 Background
 */
export async function mountSelectionToolbar(
  ctx: ContentScriptContext,
  settings: AppSettings,
): Promise<void> {
  let state: ToolbarState = {
    sourceText: '',
    translatedText: '',
    loading: false,
    error: '',
    visible: false,
  };

  let anchorX = 0;
  let anchorY = 0;
  let hideTimer: number | undefined;

  const ui = await createShadowRootUi(ctx, {
    name: 'dualmind-toolbar',
    position: 'overlay',
    alignment: 'top-left',
    zIndex: 2147483646,
    onMount(container) {
      const root = document.createElement('div');
      root.id = TOOLBAR_ID;
      const style = document.createElement('style');
      style.textContent = createToolbarStyles();
      container.append(style, root);
      return root;
    },
  });

  ui.mount();
  const root = ui.mounted!;

  function render() {
    if (!state.visible) {
      root.innerHTML = '';
      return;
    }

    const bodyHtml = state.loading
      ? `<div class="dm-muted"><span class="dm-loader"></span>翻译中…</div>`
      : state.error
        ? `<div class="dm-error">${escapeHtml(state.error)}</div>`
        : state.translatedText
          ? escapeHtml(state.translatedText)
          : `<div class="dm-muted">选中文本后点击翻译</div>`;

    root.innerHTML = `
      <div class="dm-wrap" style="left:${anchorX}px;top:${anchorY}px;">
        <div class="dm-card">
          <div class="dm-actions">
            <button class="dm-btn primary" data-action="translate" ${state.loading ? 'disabled' : ''}>翻译</button>
            <button class="dm-btn" data-action="copy" ${!state.translatedText ? 'disabled' : ''}>复制</button>
            <button class="dm-btn" data-action="panel">侧边栏</button>
            <button class="dm-btn" data-action="close">关闭</button>
          </div>
          <div class="dm-body">${bodyHtml}</div>
        </div>
      </div>
    `;

    root.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = (el as HTMLElement).dataset.action;
        void onAction(action);
      });
    });
  }

  async function onAction(action?: string) {
    if (action === 'close') {
      state.visible = false;
      render();
      return;
    }
    if (action === 'copy' && state.translatedText) {
      await navigator.clipboard.writeText(state.translatedText).catch(() => {});
      return;
    }
    if (action === 'panel') {
      if (state.sourceText) {
        await sendMessage('selection:push', { text: state.sourceText }).catch(
          () => {},
        );
      }
      await sendMessage('sidepanel:open', undefined).catch(() => {});
      return;
    }
    if (action === 'translate') {
      await runTranslate();
    }
  }

  async function runTranslate() {
    const text = state.sourceText || getSelectionText();
    if (!text) {
      state.error = '没有选中文本';
      state.visible = true;
      render();
      return;
    }
    state.sourceText = text;
    state.loading = true;
    state.error = '';
    state.translatedText = '';
    state.visible = true;
    render();

    try {
      const result = await sendMessage('translate:run', { text });
      state.translatedText = result.translatedText;
      state.sourceText = result.sourceText;
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
    } finally {
      state.loading = false;
      render();
    }
  }

  function showNearSelection(text: string, autoTranslate = false) {
    const rect = getSelectionRect();
    if (!rect) return;
    // position:fixed 使用视口坐标
    anchorX = Math.min(Math.max(8, rect.left), window.innerWidth - 280);
    anchorY = Math.min(rect.bottom + 8, window.innerHeight - 120);
    state.sourceText = text;
    state.translatedText = '';
    state.error = '';
    state.loading = false;
    state.visible = true;
    render();
    if (autoTranslate) {
      void runTranslate();
    }
  }

  function scheduleHideCheck() {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      const text = getSelectionText();
      if (!text && !state.loading && !state.translatedText) {
        state.visible = false;
        render();
      }
    }, 200);
  }

  document.addEventListener(
    'mouseup',
    (event) => {
      const path = event.composedPath();
      if (path.some((n) => n instanceof Element && n.id === TOOLBAR_ID)) {
        return;
      }
      const text = getSelectionText();
      if (!text) {
        scheduleHideCheck();
        return;
      }
      if (settings.toolbarTrigger === 'auto') {
        showNearSelection(text, false);
      }
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.altKey && (event.key === 't' || event.key === 'T')) {
        const text = getSelectionText();
        if (!text) return;
        event.preventDefault();
        showNearSelection(text, true);
      }
    },
    true,
  );

  browser.runtime.onMessage.addListener((message: unknown) => {
    if ((message as { type?: string })?.type === 'content:shortcut-translate') {
      const text = getSelectionText();
      if (!text) return;
      showNearSelection(text, true);
    }
  });
}
