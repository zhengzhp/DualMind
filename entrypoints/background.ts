import { resolveAutoTargetLanguage } from '@/features/translate/detectLang';
import {
  translateText,
  translateTextStream,
} from '@/features/translate/service';
import { translateBatch } from '@/features/immersive/translator';
import {
  IDLE_IMMERSIVE_STATUS,
  type ImmersiveStatus,
} from '@/features/immersive/types';
import {
  ContentTabTracker,
  isReadableContentUrl,
  pickContentTab,
  type ContentTabLite,
} from '@/features/chat/resolveContentTab';
import { answerQuestion } from '@/features/chat/service';
import { createProviderFromSettings } from '@/providers/registry';
import { softenDevTabReloads } from '@/shared/dev/softenTabReload';
import { formatErrorForUi, normalizeError } from '@/shared/errors';
import { fail, ok } from '@/shared/messaging/client';
import { hostnameFromUrl, isHostDisabled } from '@/shared/siteAccess';
import {
  CHAT_PORT,
  IMMERSIVE_PORT,
  SIDEPANEL_PORT,
  TRANSLATE_PORT,
  type ChatPortClientMessage,
  type ChatPortServerMessage,
  type ImmersivePortClientMessage,
  type ImmersivePortServerMessage,
  type MessageType,
  type ProtocolMap,
  type TranslatePortClientMessage,
  type TranslatePortServerMessage,
} from '@/shared/messaging/protocol';
import {
  clearChatSessions,
  deleteChatSession,
  getChatPrefs,
  getChatSession,
  getImmersivePrefs,
  getSettings,
  listChatSessions,
  saveChatPrefs,
  saveImmersivePrefs,
  saveSettings,
  setChatPending,
  setChatPageNavSignal,
  translateSessionItem,
  upsertChatSession,
} from '@/shared/storage/settings';
import type { ChatContextScope } from '@/shared/storage/types';

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

/**
 * 按窗口记住最近可读内容页。全页工作台占着活动标签时，
 * `chat:context` / `chat:page-info` 回退到此记录（见 docs/decisions.md）。
 */
const contentTabTracker = new ContentTabTracker();

/**
 * 解析网页助手应操作的内容标签页。
 * 活动页可读 → 用之；否则最近可读缓存 → 同窗口 lastAccessed 兜底。
 */
async function resolveContentTab(): Promise<browser.tabs.Tab | null> {
  const [active] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (active?.id != null && isReadableContentUrl(active.url)) {
    contentTabTracker.remember(active);
    return active;
  }

  const windowId =
    active?.windowId ?? (await browser.windows.getCurrent()).id;
  if (windowId == null) return null;

  const candidates = await browser.tabs.query({ windowId });
  const picked = pickContentTab(
    active,
    contentTabTracker.lastTabId(windowId),
    candidates,
  );
  if (!picked || picked.id == null) return null;

  // pick 可能来自 lastAccessed 兜底：写回追踪器，后续同窗口命中更稳
  contentTabTracker.remember(picked);
  try {
    return await browser.tabs.get(picked.id);
  } catch {
    contentTabTracker.forgetTab(picked.id);
    return null;
  }
}

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

/** 把沉浸式指令 / 状态查询转发到内容脚本；无内容脚本时返回 available:false */
async function sendImmersiveToTab(
  tabId: number,
  message: unknown,
): Promise<ImmersiveStatus> {
  try {
    const status = (await browser.tabs.sendMessage(tabId, message)) as
      | ImmersiveStatus
      | undefined;
    return status
      ? { ...status, available: true }
      : { ...IDLE_IMMERSIVE_STATUS, available: true };
  } catch {
    // 目标页未注入内容脚本（chrome:// 页、扩展更新后未刷新的旧标签页等）
    return { ...IDLE_IMMERSIVE_STATUS, available: false };
  }
}

async function forwardImmersiveCommand(data: {
  command: 'start' | 'stop' | 'toggle';
  displayMode?: ProtocolMap['immersive:command']['data']['displayMode'];
}): Promise<ImmersiveStatus> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tab?.id == null) return { ...IDLE_IMMERSIVE_STATUS };
  return sendImmersiveToTab(tab.id, {
    type: 'content:immersive-command',
    command: data.command,
    displayMode: data.displayMode,
  });
}

async function queryImmersiveStatus(): Promise<ImmersiveStatus> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tab?.id == null) return { ...IDLE_IMMERSIVE_STATUS };
  return sendImmersiveToTab(tab.id, { type: 'content:immersive-query' });
}

/**
 * 提取目标内容页的上下文（经 `resolveContentTab`，工作台前台可回退）。
 * 范围与字符预算以 `chatPrefs` 为准（调用方可不传 scope，走用户偏好）。
 * 页面未注入内容脚本时返回 null，由 UI 提示「无可用上下文」。
 */
async function forwardChatContext(
  scope?: ChatContextScope,
): Promise<ProtocolMap['chat:context']['return']> {
  const prefs = await getChatPrefs();
  const tab = await resolveContentTab();
  if (tab?.id == null) return null;
  try {
    const payload = (await browser.tabs.sendMessage(tab.id, {
      type: 'content:chat-extract',
      scope: scope ?? prefs.contextScope,
      maxChars: prefs.maxContextChars,
    })) as ProtocolMap['chat:context']['return'];
    return payload ?? null;
  } catch {
    // chrome:// 页、扩展更新后未刷新的旧标签页等：无内容脚本可响应
    return null;
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

/**
 * 「总结本页」的送达链路：打开 Side Panel + 投递信箱（`local:chatPending`）。
 *
 * 右键菜单与页面悬浮入口共用同一条链路（真正生成摘要的仍是 Side Panel 内的
 * `ChatPanel`，见 docs/decisions.md「右键菜单入口」与「V2 页面悬浮入口」）。
 *
 * 关键：调用方必须在**用户手势有效期内同步**调用本函数 —— `open()` 是函数体内
 * 第一个 await 之前的**同步调用**（且刻意不 await 它，避免面板打开变慢时拖住
 * 信箱写入），因此手势不会失效（见 docs/decisions-v1.md「侧边栏 open 的手势窗口」）。
 *
 * @returns 是否已发起打开侧栏；未发起（无 Side Panel API / 拿不到 windowId）时
 * 仍会写信箱，全页工作台下次打开时照样能消费到这个动作。
 */
async function deliverSummarizeAction(
  tab: ContentTabLite | undefined,
): Promise<boolean> {
  // 记下来源页：随后焦点会落到侧栏，不记住就会拿错「总结哪一页」
  if (tab) contentTabTracker.remember(tab);

  const windowId = tab?.windowId;
  const canOpen = sidePanelApi != null && windowId != null;
  if (sidePanelApi && windowId != null) {
    void sidePanelApi.open({ windowId }).catch(() => {
      /* 打开失败不阻塞：信箱仍会写入，由工作台兜底消费 */
    });
  }
  await setChatPending('summarize');
  return canOpen;
}

/** 需要瞬时用户手势的侧边栏开关：在 onMessage 中特判（见下），故不进通用表 */
type SidePanelGestureType =
  | 'sidepanel:open'
  | 'sidepanel:toggle'
  | 'chat:summarize-page';

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

  'immersive:command': async (data) => forwardImmersiveCommand(data),

  'immersive:status': async () => queryImmersiveStatus(),

  'immersive:prefs:get': async () => getImmersivePrefs(),

  'immersive:prefs:save': async (data) => saveImmersivePrefs(data),

  /* ---------------- V2 聊天（摘要 / 问答） ---------------- */

  'chat:prefs:get': async () => getChatPrefs(),

  'chat:prefs:save': async (data) => saveChatPrefs(data),

  'chat:sessions:list': async () => listChatSessions(),

  'chat:sessions:get': async (data) => getChatSession(data.id),

  'chat:sessions:upsert': async (data) => upsertChatSession(data.session),

  'chat:sessions:delete': async (data) => {
    await deleteChatSession(data.id);
    return { ok: true as const };
  },

  'chat:sessions:clear': async () => {
    await clearChatSessions();
    return { ok: true as const };
  },

  'chat:context': async (data) => forwardChatContext(data.scope),

  'chat:page-info': async () => {
    // 与 chat:context 同一解析：工作台前台时回退到最近可读内容页
    const tab = await resolveContentTab();
    if (!tab) return null;
    return { url: tab.url ?? '', title: tab.title ?? '' };
  },

  'chat:page-nav': async (data) => {
    await setChatPageNavSignal({ url: data.url, title: data.title });
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

/** Port 批量翻译：一个 Port 上可并发多个 requestId，各自独立 abort */
function attachImmersivePort(port: {
  postMessage: (msg: unknown) => void;
  onMessage: {
    addListener: (cb: (msg: unknown) => void) => void;
  };
  onDisconnect: { addListener: (cb: () => void) => void };
}) {
  const controllers = new Map<string, AbortController>();

  const post = (msg: ImmersivePortServerMessage) => {
    try {
      port.postMessage(msg);
    } catch {
      /* port 已断开 */
    }
  };

  port.onMessage.addListener((raw: unknown) => {
    const message = raw as ImmersivePortClientMessage;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'abort') {
      controllers.get(message.requestId)?.abort();
      return;
    }
    if (message.type !== 'translate-batch') return;

    // 同一 requestId 重复请求时取消旧的
    controllers.get(message.requestId)?.abort();
    const controller = new AbortController();
    controllers.set(message.requestId, controller);

    void (async () => {
      try {
        const results = await translateBatch(
          message.segments,
          message.targetLanguage,
          controller.signal,
        );
        post({
          type: 'batch-done',
          requestId: message.requestId,
          results,
        });
      } catch (err) {
        const normalized = normalizeError(err);
        post({
          type: 'batch-error',
          requestId: message.requestId,
          code: normalized.code,
          message: formatErrorForUi(normalized),
        });
      } finally {
        controllers.delete(message.requestId);
      }
    })();
  });

  port.onDisconnect.addListener(() => {
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
  });
}

/** Port 流式问答：一个 Port 上可并发多个 requestId，各自独立 abort */
function attachChatPort(port: {
  postMessage: (msg: unknown) => void;
  onMessage: {
    addListener: (cb: (msg: unknown) => void) => void;
  };
  onDisconnect: { addListener: (cb: () => void) => void };
}) {
  const controllers = new Map<string, AbortController>();

  const post = (msg: ChatPortServerMessage) => {
    try {
      port.postMessage(msg);
    } catch {
      /* port 已断开 */
    }
  };

  port.onMessage.addListener((raw: unknown) => {
    const message = raw as ChatPortClientMessage;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'abort') {
      controllers.get(message.requestId)?.abort();
      return;
    }
    if (message.type !== 'start') return;

    // 同一 requestId 重复请求（如重试）时取消旧的
    controllers.get(message.requestId)?.abort();
    const controller = new AbortController();
    controllers.set(message.requestId, controller);

    void (async () => {
      let accumulated = '';
      try {
        for await (const delta of answerQuestion({
          context: message.context,
          history: message.history,
          question: message.question,
          signal: controller.signal,
        })) {
          if (controller.signal.aborted) break;
          accumulated += delta;
          post({
            type: 'chunk',
            requestId: message.requestId,
            text: delta,
            accumulated,
          });
        }
        if (!controller.signal.aborted) {
          post({
            type: 'done',
            requestId: message.requestId,
            content: accumulated,
          });
        }
      } catch (err) {
        // 主动取消由客户端自行 settle，不额外回错误（避免「已取消」被当成失败）
        if (controller.signal.aborted) return;
        const normalized = normalizeError(err);
        post({
          type: 'error',
          requestId: message.requestId,
          code: normalized.code,
          message: formatErrorForUi(normalized),
        });
      } finally {
        controllers.delete(message.requestId);
      }
    })();
  });

  port.onDisconnect.addListener(() => {
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
  });
}

/** DualMind 的右键菜单项 id（按站点统一置灰时用） */
const CONTEXT_MENU_IDS = [
  'dualmind-translate',
  'dualmind-immersive',
  'dualmind-chat-summarize',
] as const;

/**
 * 按「当前活动标签页是否被禁用」统一更新右键菜单项的 `enabled`。
 *
 * 背景：菜单项全站可见，而 `contextMenus` 的 `documentUrlPatterns` 无法表达
 * 「除 disabledHosts 之外的所有站点」；在内容脚本被禁用的站点上点击只会得到
 * 一个空洞的失败提示。改为在这些站点上把菜单置灰（见 docs/decisions.md）。
 *
 * 触发时机：标签页切换 / 地址变化 / 设置变更。任何失败都静默（菜单可能尚未创建）。
 */
async function refreshContextMenuEnabled(): Promise<void> {
  try {
    const { disabledHosts } = await getSettings();
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const disabled = isHostDisabled(
      disabledHosts,
      hostnameFromUrl(tab?.url ?? ''),
    );
    for (const id of CONTEXT_MENU_IDS) {
      try {
        await browser.contextMenus?.update(id, { enabled: !disabled });
      } catch {
        /* 菜单项尚未创建：忽略 */
      }
    }
  } catch {
    /* 查询失败不影响主流程 */
  }
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
    if (port.name === IMMERSIVE_PORT) {
      attachImmersivePort(port);
      return;
    }
    if (port.name === CHAT_PORT) {
      attachChatPort(port);
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
    sender: { tab?: browser.tabs.Tab },
    sendResponse: (response: unknown) => void,
  ) => {
    const type = (message as { type?: MessageType })?.type;
    if (!type) return false;

    const data = (message as { data: unknown }).data;

    // 页面悬浮入口「总结本页」：与侧边栏开关同理，open() 依赖瞬时用户手势。
    // sender.tab 同步可得（?? 会短路，不会插入 await），且 open() 是
    // deliverSummarizeAction 内第一个 await 之前的同步调用，因此手势不会失效。
    if (type === 'chat:summarize-page') {
      void (async () => {
        try {
          const opened = await deliverSummarizeAction(sender.tab);
          sendResponse(ok({ ok: true as const, open: opened }));
        } catch (err) {
          sendResponse(fail(err));
        }
      })();
      return true;
    }

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
    try {
      await browser.tabs.sendMessage(tab.id, {
        type: 'content:shortcut-translate',
      });
    } catch (err) {
      // 目标页未注入 content script 时会抛错（如 chrome:// 页、扩展更新后未刷新的旧标签页）。
      // 显式记录，避免快捷键表现为「静默无效」而难以定位。
      console.warn(
        '[dualmind] 快捷键消息投递失败：目标页可能未注入 content script',
        err,
      );
    }
  });

  void browser.contextMenus?.removeAll().then(() => {
    browser.contextMenus.create({
      id: 'dualmind-translate',
      title: '用 DualMind 翻译',
      contexts: ['selection'],
    });
    browser.contextMenus.create({
      id: 'dualmind-immersive',
      title: '用 DualMind 翻译整页',
      contexts: ['page'],
    });
    browser.contextMenus.create({
      id: 'dualmind-chat-summarize',
      title: '用 DualMind 总结本页',
      contexts: ['page'],
    });
    // 创建完成后再按当前站点置灰（removeAll + create 是异步的，不能提前调用）
    void refreshContextMenuEnabled();
  });

  // 右键菜单置灰 + 最近可读内容页：切标签页 / 地址变化 / 设置变更时重算
  browser.tabs?.onActivated.addListener((activeInfo) => {
    void (async () => {
      try {
        const tab = await browser.tabs.get(activeInfo.tabId);
        contentTabTracker.remember({
          id: tab.id,
          windowId: tab.windowId ?? activeInfo.windowId,
          url: tab.url,
        });
      } catch {
        /* 标签已关 */
      }
      void refreshContextMenuEnabled();
    })();
  });
  browser.tabs?.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      // 仅活动标签推进「最近可读」，避免后台页加载完成抢占缓存
      if (tab.active) {
        contentTabTracker.remember({
          id: tab.id ?? tabId,
          windowId: tab.windowId,
          url: tab.url,
        });
      }
      void refreshContextMenuEnabled();
    }
  });
  browser.tabs?.onRemoved.addListener((tabId) => {
    contentTabTracker.forgetTab(tabId);
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!Object.keys(changes).some((key) => key.includes('settings'))) return;
    void refreshContextMenuEnabled();
  });

  browser.contextMenus?.onClicked.addListener(async (info, tab) => {
    // 翻译整页：直接向当前标签页的内容脚本下发指令
    if (info.menuItemId === 'dualmind-immersive') {
      if (tab?.id != null) {
        await sendImmersiveToTab(tab.id, {
          type: 'content:immersive-command',
          command: 'start',
        });
      }
      return;
    }

    // 总结本页：真正执行在 Side Panel 的 UI 上下文里，用 storage 当信箱。
    if (info.menuItemId === 'dualmind-chat-summarize') {
      // 与下面翻译同理：open() 必须在用户手势有效期内「同步」调用。
      // 先开面板再写信箱，两种时序面板都能收到（见 useChat 的 storage 监听）。
      await deliverSummarizeAction(tab);
      return;
    }

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
