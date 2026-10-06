type DevReloadTabsMode = 'active' | 'none' | 'all';

function resolveMode(): DevReloadTabsMode {
  const raw = String(
    import.meta.env.WXT_DEV_RELOAD_TABS ?? 'active',
  ).toLowerCase();
  if (raw === 'none' || raw === 'all' || raw === 'active') return raw;
  return 'active';
}

/**
 * 缓和 WXT 开发态「Content Script 变更 → 全标签页 reload」行为。
 *
 * WXT 在 serve 时会对所有匹配 matches 的 tab 调用 browser.tabs.reload；
 * DualMind 使用 `<all_urls>`，保存一次会刷掉大量标签，体感像「不停 reload」。
 *
 * `.env` 中 `WXT_DEV_RELOAD_TABS`：
 * - `active`（默认）：只刷新当前窗口的活动标签
 * - `none`：不自动刷页面（仍更新已注册 CS；需手动刷新）
 * - `all`：恢复 WXT 默认
 */
export function softenDevTabReloads(): void {
  if (import.meta.env.COMMAND !== 'serve') return;

  const mode = resolveMode();
  if (mode === 'all') return;

  const original = browser.tabs.reload.bind(browser.tabs);

  // WXT 热更新路径会批量调用 tabs.reload；在此拦截
  browser.tabs.reload = (async (tabId?: number, reloadProperties?: unknown) => {
    if (mode === 'none') {
      console.debug('[dualmind] skip tab reload (WXT_DEV_RELOAD_TABS=none)', tabId);
      return;
    }

    const [active] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (typeof tabId === 'number' && active?.id != null && tabId !== active.id) {
      console.debug('[dualmind] skip inactive tab reload', tabId);
      return;
    }
    return original(
      tabId as Parameters<typeof original>[0],
      reloadProperties as Parameters<typeof original>[1],
    );
  }) as typeof browser.tabs.reload;
}
