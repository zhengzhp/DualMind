import {
  translateText,
  translateTextStream,
} from '@/features/translate/service';
import {
  createProviderFromSettings,
  resolveModel,
} from '@/providers/registry';
import { formatErrorForUi, normalizeError } from '@/shared/errors';
import { fail, ok } from '@/shared/messaging/client';
import {
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
    };
  }
).sidePanel;

type HandlerMap = {
  [K in MessageType]: (
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

  'sidepanel:open': async () => {
    return { ok: true as const };
  },

  'selection:push': async (data) => {
    const text = data.text.trim();
    if (!text) return { ok: true as const };
    const settings = await getSettings();
    await translateSessionItem.setValue({
      sourceText: text,
      translatedText: '',
      targetLanguage: settings.targetLanguage,
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
  sidePanelApi
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {
      /* Firefox 等可能不支持，忽略 */
    });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === TRANSLATE_PORT) {
      attachTranslatePort(port);
    }
  });

  browser.runtime.onMessage.addListener(((
    message: unknown,
    sender: { tab?: { windowId?: number } },
    sendResponse: (response: unknown) => void,
  ) => {
    const type = (message as { type?: MessageType })?.type;
    if (!type || !(type in handlers)) {
      return false;
    }

    const data = (message as { data: unknown }).data;
    void (async () => {
      try {
        if (type === 'sidepanel:open' && sidePanelApi) {
          const windowId =
            sender.tab?.windowId ?? (await browser.windows.getCurrent()).id;
          if (windowId != null) {
            await sidePanelApi.open({ windowId });
          }
          sendResponse(ok({ ok: true as const }));
          return;
        }

        const handler = handlers[type] as (d: unknown) => Promise<unknown>;
        const result = await handler(data);
        sendResponse(ok(result));
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
      const settings = await getSettings();
      await translateSessionItem.setValue({
        sourceText: text,
        translatedText: '',
        targetLanguage: settings.targetLanguage,
        updatedAt: Date.now(),
        error: formatErrorForUi(err),
      });
    }
  });

  getSettings()
    .then((s) => {
      try {
        if (s.providerType === 'openai-compatible' && s.openai.apiKey) {
          resolveModel(s);
        }
      } catch {
        /* ignore */
      }
    })
    .catch(() => {});
});
