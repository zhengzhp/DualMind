import { translateText } from '@/features/translate/service';
import {
  createProviderFromSettings,
  resolveModel,
} from '@/providers/registry';
import { fail, ok } from '@/shared/messaging/client';
import type { MessageType, ProtocolMap } from '@/shared/messaging/protocol';
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
    return { ok: false, error: result.error };
  },

  'settings:get': async () => getSettings(),

  'settings:save': async (data) => saveSettings(data),

  'session:get': async () => translateSessionItem.getValue(),

  'sidepanel:open': async () => {
    // 实际打开逻辑在 onMessage 中结合 sender.tab 处理
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

export default defineBackground(() => {
  // 点击扩展图标 → 打开 Side Panel（Monica 风格主入口）
  sidePanelApi
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {
      /* Firefox 等可能不支持，忽略 */
    });

  // webextension-polyfill 要求 async 监听器返回 true；未知消息直接忽略
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

  // 快捷键：翻译选区（向当前 tab 广播）
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

  // 右键菜单
  void browser.contextMenus?.removeAll().then(() => {
    browser.contextMenus.create({
      id: 'dualmind-translate',
      title: '用 DualMind 翻译',
      contexts: ['selection'],
    });
  });

  browser.contextMenus?.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'dualmind-translate' || !info.selectionText) return;
    try {
      await translateText({ text: info.selectionText });
      if (tab?.windowId != null) {
        await sidePanelApi?.open({ windowId: tab.windowId });
      }
    } catch {
      const settings = await getSettings();
      await translateSessionItem.setValue({
        sourceText: info.selectionText,
        translatedText: '',
        targetLanguage: settings.targetLanguage,
        updatedAt: Date.now(),
        error: '翻译失败，请检查 Provider 设置',
      });
      if (tab?.windowId != null) {
        await sidePanelApi?.open({ windowId: tab.windowId }).catch(() => {});
      }
    }
  });

  // 预热：校验当前模型配置是否可读（不强制）
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
