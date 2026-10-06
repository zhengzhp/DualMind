import { resolveAutoTargetLanguage } from '@/features/translate/detectLang';
import {
  translateText,
  translateTextStream,
} from '@/features/translate/service';
import { createProviderFromSettings } from '@/providers/registry';
import { softenDevTabReloads } from '@/shared/dev/softenTabReload';
import { formatErrorForUi, normalizeError } from '@/shared/errors';
import { fail, ok } from '@/shared/messaging/client';
import {
  SIDEPANEL_PORT,
  TRANSLATE_PORT,
  type MessageType,
  type ProtocolMap,
  type TranslatePortClientMessage,
  type TranslatePortServerMessage,
} from '@/shared/messaging/protocol';
import {
  getSettings,
  saveSettings,
  translateSessionItem,
} from '@/shared/storage/settings';

/** Chrome Side Panel API（webextension-polyfill 类型可能未覆盖） */
const sidePanelApi = (
  browser as typeof browser & {
    sidePanel?: {
      setPanelBehavior: (o: {
        openPanelOnActionClick: boolean;
      }) => Promise<void>;
      open: (o: { windowId?: number; tabId?: number }) => Promise<void>;
      close?: (o: { windowId?: number; tabId?: number }) => Promise<void>;
    };
  }
).sidePanel;

/** 已连接的 Side Panel Port（用于开关态与自关闭回退） */
const sidePanelPorts = new Set<{
  postMessage: (msg: unknown) => void;
  onDisconnect: { addListener: (cb: () => void) => void };
}>();

function isSidePanelConnected(): boolean {
  return sidePanelPorts.size > 0;
}

async function isSidePanelOpen(): Promise<boolean> {
  if (isSidePanelConnected()) return true;
  const getContexts = (
    browser.runtime as typeof browser.runtime & {
      getContexts?: (filter: {
        contextTypes: string[];
      }) => Promise<Array<{ contextType?: string }>>;
    }
  ).getContexts;
  if (!getContexts) return false;
  try {
    const contexts = await getContexts({ contextTypes: ['SIDE_PANEL'] });
    return contexts.length > 0;
  } catch {
    return false;
  }
}

async function closeSidePanel(windowId: number): Promise<void> {
  if (sidePanelApi?.close) {
    try {
      await sidePanelApi.close({ windowId });
      return;
    } catch {
      /* 旧版或全局面板场景失败时走 Port / 广播回退 */
    }
  }
  for (const port of sidePanelPorts) {
    try {
      port.postMessage({ type: 'sidepanel:close-self' });
    } catch {
      /* ignore */
    }
  }
  try {
    await browser.runtime.sendMessage({ type: 'sidepanel:close-self' });
  } catch {
    /* 无接收方时忽略 */
  }
}

async function toggleSidePanel(windowId: number): Promise<boolean> {
  // 关键：`sidePanel.open()` 依赖瞬时用户激活（transient activation）。
  // 网页点击的激活能经 sendMessage 传到本 SW，但经不起 open() 前多一次异步往返：
  // 旧实现先 `await isSidePanelOpen()`（内含 getContexts 往返），等它返回时激活已过期，
  // open() 会抛 "may only be called in response to a user gesture"。
  // 因此这里改用「同步」的 Port 连接态判断是否已开，确保 open() 紧跟手势调用。
  if (isSidePanelConnected()) {
    await closeSidePanel(windowId);
    return false;
  }
  // 若面板其实已开但 Port 尚未连上（刚打开的竞态），open() 是幂等 no-op，
  // 返回 true 也与真实状态一致（面板确实开着）。
  await sidePanelApi?.open({ windowId });
  return true;
}

/** 需要瞬时用户手势的侧边栏开关：在 onMessage 中特判（见下），故不进通用表 */
type SidePanelGestureType = 'sidepanel:open' | 'sidepanel:toggle';

type HandlerMap = {
  [K in Exclude<MessageType, SidePanelGestureType>]: (
    data: ProtocolMap[K]['data'],
  ) => Promise<ProtocolMap[K]['return']>;
};

const handlers: HandlerMap = {
  'translate:run': async (data) => {
    return translateText({
      text: data.text,
      targetLanguage: data.targetLanguage,
    });
  },

  'provider:listModels': async () => {
    const settings = await getSettings();
    const provider = createProviderFromSettings(settings);
    const models = await provider.listModels();
    return { models };
  },

  'provider:test': async () => {
    const settings = await getSettings();
    const provider = createProviderFromSettings(settings);
    const result = await provider.testConnection();
    if (result.ok) {
      return { ok: true, detail: result.detail };
    }
    return { ok: false, error: result.error, code: result.code };
  },

  'settings:get': async () => getSettings(),

  'settings:save': async (data) => saveSettings(data),

  'session:get': async () => translateSessionItem.getValue(),

  'sidepanel:status': async () => ({ open: await isSidePanelOpen() }),

  'selection:push': async (data) => {
    const text = data.text.trim();
    if (!text) return { ok: true as const };
    await translateSessionItem.setValue({
      sourceText: text,
      translatedText: '',
      targetLanguage: resolveAutoTargetLanguage(text),
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
};

/** Port 流式翻译：支持 abort */
function attachTranslatePort(port: {
  postMessage: (msg: unknown) => void;
  onMessage: {
    addListener: (cb: (msg: unknown) => void) => void;
  };
  onDisconnect: { addListener: (cb: () => void) => void };
}) {
  let abortController: AbortController | null = null;

  const post = (msg: TranslatePortServerMessage) => {
    try {
      port.postMessage(msg);
    } catch {
      /* port 已断开 */
    }
  };

  port.onMessage.addListener((raw: unknown) => {
    const message = raw as TranslatePortClientMessage;

    if (message.type === 'abort') {
      abortController?.abort();
      return;
    }

    if (message.type !== 'start') return;

    // 新请求取消旧请求
    abortController?.abort();
    abortController = new AbortController();
    const signal = abortController.signal;

    void (async () => {
      try {
        for await (const event of translateTextStream({
          text: message.text,
          targetLanguage: message.targetLanguage,
          signal,
        })) {
          if (signal.aborted) break;
          if (event.type === 'chunk') {
            post({
              type: 'chunk',
              text: event.text,
              accumulated: event.accumulated,
            });
          } else if (event.type === 'done') {
            post({ type: 'done', result: event.result });
          }
        }
      } catch (err) {
        const normalized = normalizeError(err);
        if (normalized.code === 'ABORTED') {
          post({
            type: 'error',
            code: 'ABORTED',
            message: formatErrorForUi(normalized),
          });
          return;
        }
        post({
          type: 'error',
          code: normalized.code,
          message: formatErrorForUi(normalized),
        });
      }
    })();
  });

  port.onDisconnect.addListener(() => {
    abortController?.abort();
    abortController = null;
  });
}

export default defineBackground(() => {
  // 必须尽早打补丁：WXT serve 会在 CS 变更时对所有匹配 tab 调 tabs.reload
  softenDevTabReloads();

  sidePanelApi
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {
      /* Firefox 等可能不支持，忽略 */
    });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === TRANSLATE_PORT) {
      attachTranslatePort(port);
      return;
    }
    if (port.name === SIDEPANEL_PORT) {
      sidePanelPorts.add(port);
      port.onDisconnect.addListener(() => {
        sidePanelPorts.delete(port);
      });
    }
  });

  browser.runtime.onMessage.addListener(((
    message: unknown,
    sender: { tab?: { windowId?: number } },
    sendResponse: (response: unknown) => void,
  ) => {
    const type = (message as { type?: MessageType })?.type;
    if (!type) return false;

    const data = (message as { data: unknown }).data;

    // 侧边栏开关特判：open() 依赖瞬时用户手势，必须在任何多余 await 之前调用。
    // 来自网页的 sender.tab.windowId 是同步可得的，不会破坏手势窗口。
    if (
      (type === 'sidepanel:open' || type === 'sidepanel:toggle') &&
      sidePanelApi
    ) {
      void (async () => {
        try {
          const windowId =
            sender.tab?.windowId ?? (await browser.windows.getCurrent()).id;
          if (type === 'sidepanel:open') {
            if (windowId != null) {
              await sidePanelApi.open({ windowId });
            }
            sendResponse(ok({ ok: true as const }));
            return;
          }
          if (windowId == null) {
            sendResponse(ok({ ok: true as const, open: false }));
            return;
          }
          const open = await toggleSidePanel(windowId);
          sendResponse(ok({ ok: true as const, open }));
        } catch (err) {
          sendResponse(fail(err));
        }
      })();
      return true;
    }

    if (!(type in handlers)) return false;

    void (async () => {
      try {
        const handler = handlers[type as keyof HandlerMap] as (
          d: unknown,
        ) => Promise<unknown>;
        sendResponse(ok(await handler(data)));
      } catch (err) {
        sendResponse(fail(err));
      }
    })();

    return true;
  }) as Parameters<typeof browser.runtime.onMessage.addListener>[0]);

  browser.commands?.onCommand.addListener(async (command) => {
    if (command !== 'translate-selection') return;
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id == null) return;
    await browser.tabs.sendMessage(tab.id, {
      type: 'content:shortcut-translate',
    });
  });

  void browser.contextMenus?.removeAll().then(() => {
    browser.contextMenus.create({
      id: 'dualmind-translate',
      title: '用 DualMind 翻译',
      contexts: ['selection'],
    });
  });

  browser.contextMenus?.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'dualmind-translate' || !info.selectionText) return;

    // 关键：sidePanel.open() 必须在用户手势有效期内调用。
    // 若放到 await translateText()（网络耗时）之后再打开，手势已失效，会抛
    // 「sidePanel.open() may only be called in response to a user gesture」，
    // 且该异常会被下面的 catch 捕获，用错误覆盖掉刚写好的译文。
    // 因此先同步开面板，再执行翻译。
    if (sidePanelApi && tab?.windowId != null) {
      void sidePanelApi.open({ windowId: tab.windowId }).catch(() => {});
    }

    const text = info.selectionText;
    try {
      await translateText({ text });
    } catch (err) {
      // 仅翻译失败才写错误会话；开侧边栏失败不应影响译文结果
      await translateSessionItem.setValue({
        sourceText: text,
        translatedText: '',
        targetLanguage: resolveAutoTargetLanguage(text),
        updatedAt: Date.now(),
        error: formatErrorForUi(err),
      });
    }
  });
});
