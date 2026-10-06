/** 扩展内 HTML 入口路径（WXT 按目录名生成 *.html） */
export const OPTIONS_PAGE = '/options.html' as const;
export const WORKSPACE_PAGE = '/workspace.html' as const;

const WORKSPACE_TAB_KEY = 'dualmind.workspaceTabId';

type SessionArea = {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

function sessionArea(): SessionArea | undefined {
  return (
    browser.storage as typeof browser.storage & { session?: SessionArea }
  ).session;
}

/**
 * 打开（或聚焦已有）扩展页标签。不经过 Background，也不调模型。
 * 全页工作台用 session 记下 tabId，避免连开多个；无需额外 tabs 权限。
 */
async function openOrFocusTab(
  url: string,
  reuseTabKey?: string,
): Promise<void> {
  const key = reuseTabKey;
  const session = key ? sessionArea() : undefined;

  if (key && session) {
    const stored = await session.get(key);
    const tabId = stored[key];
    if (typeof tabId === 'number') {
      try {
        const tab = await browser.tabs.get(tabId);
        if (tab.id != null) {
          await browser.tabs.update(tab.id, { active: true });
          if (typeof tab.windowId === 'number') {
            try {
              await browser.windows.update(tab.windowId, { focused: true });
            } catch {
              /* 无 windows 权限时仅激活标签即可 */
            }
          }
          return;
        }
      } catch {
        /* 标签已关，下面新建 */
      }
    }
  }

  const created = await browser.tabs.create({ url });
  if (key && session && created.id != null) {
    await session.set({ [key]: created.id });
  }
}

export async function openWorkspaceTab(): Promise<void> {
  await openOrFocusTab(
    browser.runtime.getURL(WORKSPACE_PAGE),
    WORKSPACE_TAB_KEY,
  );
}

export async function openOptionsTab(): Promise<void> {
  await openOrFocusTab(browser.runtime.getURL(OPTIONS_PAGE));
}

/**
 * 收起当前侧栏：优先 sidePanel.close，旧版回退 window.close。
 */
export async function closeSidePanelSelf(): Promise<void> {
  const api = (
    browser as typeof browser & {
      sidePanel?: { close?: (o: { windowId: number }) => Promise<void> };
    }
  ).sidePanel;
  try {
    if (api?.close) {
      await api.close({ windowId: browser.windows.WINDOW_ID_CURRENT });
      return;
    }
  } catch {
    /* 旧版本不支持 close */
  }
  window.close();
}
