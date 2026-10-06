import { type ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { browser } from 'wxt/browser';
import { formatErrorForUi } from '@/shared/errors';
import { sendMessage } from '@/shared/messaging/client';
import { streamTranslate } from '@/shared/messaging/stream';
import type { AppSettings } from '@/shared/storage/types';
import {
  TOOLBAR_ID,
  createToolbarStyles,
  getSelectionRect,
  getSelectionText,
} from './dom';
import {
  shouldDismissOnSelectionChange,
  shouldShowOnMouseUp,
  shouldShowOnShortcut,
} from './logic';
import { trackSelection, type SelectionTracker } from './position';
import { createToolbarView, type ToolbarViewState } from './view';

interface ToolbarState extends ToolbarViewState {
  sourceText: string;
}

/** 复制成功提示的展示时长（毫秒） */
const COPY_HINT_MS = 1500;

/**
 * 在页面上挂载划词工具栏（Shadow DOM）
 * 翻译请求一律走 Background（Port 流式）
 */
export async function mountSelectionToolbar(
  ctx: ContentScriptContext,
  settings: AppSettings,
): Promise<void> {
  const state: ToolbarState = {
    sourceText: '',
    translatedText: '',
    loading: false,
    error: '',
    visible: false,
    panelOpen: false,
    copied: false,
  };

  let abortController: AbortController | null = null;
  /** 「已复制」文案的复位定时器 */
  let copyResetTimer: number | undefined;
  /** 会话代际：关闭后使在途 chunk / 结果失效 */
  let sessionId = 0;
  let tracker: SelectionTracker | null = null;
  /**
   * 关闭时记下当时的选区文本。
   * 有些站点点击空白处不会清空选区，若不记录，mouseup 会把浮层又弹回来。
   */
  let suppressShowForText: string | null = null;

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
  const view = createToolbarView(root);

  const render = () => view.render(state);

  /** 统一关闭入口：中止在途请求、清空状态、停掉定位跟随 */
  function closeToolbar(reason: string) {
    if (!state.visible) return;

    sessionId += 1; // 令在途 chunk / 结果失效
    abortController?.abort();
    abortController = null;
    tracker?.stop();
    tracker = null;
    window.clearTimeout(copyResetTimer); // 收起时同步清掉「已复制」复位定时器

    state.visible = false;
    state.loading = false;
    state.error = '';
    state.translatedText = '';
    state.sourceText = '';
    state.copied = false;
    render();

    // 选区未变化前，禁止 mouseup 把浮层重新弹出
    suppressShowForText = getSelectionText() || null;

    if (import.meta.env.DEV) {
      console.debug('[dualmind] toolbar closed:', reason);
    }
  }

  // 事件委托：只绑一次；节点稳定，流式期间点击不再被 innerHTML 重建吞掉
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const el = target?.closest?.('[data-action]') as HTMLElement | null;
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    void onAction(el.dataset.action);
  });

  async function onAction(action?: string) {
    if (action === 'close') {
      closeToolbar('button');
      return;
    }
    if (action === 'stop') {
      abortController?.abort();
      return;
    }
    if (action === 'copy' && state.translatedText) {
      // 会话代际：复制期间浮层被收起 / 重开时，丢弃过期的提示回落
      const mySession = sessionId;
      try {
        await navigator.clipboard.writeText(state.translatedText);
        if (mySession !== sessionId) return;
        state.copied = true;
        // 先清旧定时器，避免连点复制时提示提前消失
        window.clearTimeout(copyResetTimer);
        copyResetTimer = window.setTimeout(() => {
          if (mySession !== sessionId) return;
          state.copied = false;
          render();
        }, COPY_HINT_MS);
        render();
      } catch {
        if (mySession !== sessionId) return;
        state.error = '复制失败，请手动选择译文后复制';
        render();
      }
      return;
    }
    if (action === 'panel') {
      // 先 toggle（需用户手势），打开成功后再推送选区
      try {
        const result = await sendMessage('sidepanel:toggle', undefined);
        state.panelOpen = result.open;
        render();
        if (result.open && state.sourceText) {
          await sendMessage('selection:push', {
            text: state.sourceText,
          }).catch(() => {});
        }
      } catch {
        /* ignore */
      }
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

    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;
    const mySession = ++sessionId; // 标记本次会话，用于忽略过期回调

    state.sourceText = text;
    state.loading = true;
    state.error = '';
    state.translatedText = '';
    state.visible = true;
    render();

    try {
      const result = await streamTranslate({
        text,
        signal: controller.signal,
        onChunk: (accumulated) => {
          if (mySession !== sessionId) return; // 已被关闭 → 丢弃
          state.translatedText = accumulated;
          render();
        },
      });
      if (mySession !== sessionId) return;
      state.translatedText = result.translatedText;
      state.sourceText = result.sourceText;
    } catch (err) {
      if (mySession !== sessionId) return;
      const msg = formatErrorForUi(err);
      if (msg !== '已取消') {
        state.error = msg;
      }
    } finally {
      // 会话已过期（被关闭 / 新请求接管）时不回写，避免污染新状态
      if (mySession === sessionId) {
        if (abortController === controller) abortController = null;
        state.loading = false;
        render();
      }
    }
  }

  async function refreshPanelOpen() {
    try {
      const status = await sendMessage('sidepanel:status', undefined);
      state.panelOpen = status.open;
    } catch {
      /* ignore */
    }
  }

  function showNearSelection(text: string, autoTranslate = false) {
    const rect = getSelectionRect();
    if (!rect) return;

    state.sourceText = text;
    state.translatedText = '';
    state.error = '';
    state.loading = false;
    state.visible = true;
    render();

    // 先显示再定位：display:none 时无法测量浮层尺寸
    if (tracker) {
      tracker.update();
    } else {
      tracker = trackSelection(view.el, getSelectionRect);
    }

    void refreshPanelOpen().then(() => {
      if (state.visible) render();
    });

    if (autoTranslate) {
      void runTranslate();
    }
  }

  /** 多路 dismiss：外部点击 / Esc / 选区变化 */
  function attachDismissHandlers() {
    const controller = new AbortController();
    ctx.onInvalidated(() => controller.abort());
    const options: AddEventListenerOptions = {
      capture: true,
      signal: controller.signal,
    };

    const isInsideToolbar = (event: Event) =>
      event
        .composedPath()
        .some((node) => node instanceof Element && node.id === TOOLBAR_ID);

    // ① 外部按下即关闭：不依赖选区是否被清空
    //    （部分站点在 mousedown preventDefault 或落在 user-select:none 区域，不会清空选区）
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (state.visible && !isInsideToolbar(event)) {
          closeToolbar('outside-pointerdown');
        }
      },
      options,
    );

    // ② Esc 关闭
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Escape' || !state.visible) return;
        closeToolbar('escape');
        event.stopPropagation();
      },
      options,
    );

    // ③ 选区变化兜底（键盘 / 脚本导致选区塌陷）；防抖避免拖拽过程中误关
    let timer: number | undefined;
    document.addEventListener(
      'selectionchange',
      () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (!state.visible) return;
          if (
            shouldDismissOnSelectionChange({
              hasSelection: Boolean(getSelectionText()),
              loading: state.loading,
            })
          ) {
            closeToolbar('selectionchange');
          }
        }, 150);
      },
      options,
    );
  }

  document.addEventListener(
    'mouseup',
    (event) => {
      const path = event.composedPath();
      if (path.some((n) => n instanceof Element && n.id === TOOLBAR_ID)) {
        return;
      }

      const text = getSelectionText();
      const suppressed = suppressShowForText;
      suppressShowForText = null; // 每次抬起都消费掉
      // 刚关闭且选区未变化 → 视为「关闭点击」，不再重新弹出
      if (suppressed !== null && suppressed === text) return;

      if (
        !shouldShowOnMouseUp({
          toolbarTrigger: settings.toolbarTrigger,
          selectionText: text,
        })
      ) {
        return;
      }
      showNearSelection(text, false);
    },
    true,
  );

  // 快捷键仅走 chrome.commands → Background → 本消息，避免与页面/系统抢 Alt 键
  browser.runtime.onMessage.addListener((message: unknown) => {
    if ((message as { type?: string })?.type === 'content:shortcut-translate') {
      const text = getSelectionText();
      if (!shouldShowOnShortcut(text)) return;
      showNearSelection(text, true);
    }
  });

  attachDismissHandlers();

  // 页面上下文失效（导航 / 扩展更新）时清理跟随与请求
  ctx.onInvalidated(() => {
    tracker?.stop();
    tracker = null;
    abortController?.abort();
    abortController = null;
    window.clearTimeout(copyResetTimer);
  });
}
