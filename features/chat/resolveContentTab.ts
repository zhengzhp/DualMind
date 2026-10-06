/**
 * 解析「网页助手」应读取的内容标签页（纯函数 + 进程内追踪器）。
 *
 * 背景：全页工作台本身是活动标签页（chrome-extension://），若只查
 * `active: true` 会打到扩展页、拿不到正文。Side Panel 不是标签页，通常仍命中内容站。
 *
 * 策略（按窗口隔离）：
 * 1. 活动页是 http(s) → 用它并记入「最近可读」
 * 2. 否则回退该窗口最近一次活动过的可读 tab
 * 3. 追踪器空（SW 冷启动）→ 同窗口按 `lastAccessed` 挑最近的可读页
 */

/** 供单测与 Background 共用的轻量标签形状 */
export interface ContentTabLite {
  id?: number;
  windowId?: number;
  url?: string;
  title?: string;
  /** Chrome 提供；用于 SW 冷启动时的次级回退 */
  lastAccessed?: number;
}

/** 是否为可注入内容脚本的普通网页（仅 http / https） */
export function isReadableContentUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 在「活动页 + 最近可读缓存 + 同窗口候选」中选出目标内容页（纯函数）。
 * `candidates` 仅在缓存未命中时使用（通常为同窗口全部标签）。
 */
export function pickContentTab(
  active: ContentTabLite | null | undefined,
  lastTabId: number | undefined,
  candidates: ContentTabLite[],
): ContentTabLite | null {
  if (active?.id != null && isReadableContentUrl(active.url)) {
    return active;
  }

  if (lastTabId != null) {
    const cached = candidates.find(
      (tab) => tab.id === lastTabId && isReadableContentUrl(tab.url),
    );
    if (cached) return cached;
  }

  const readable = candidates
    .filter((tab) => tab.id != null && isReadableContentUrl(tab.url))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  return readable[0] ?? null;
}

/**
 * 按 windowId 记住「最近一次活动过的可读内容 tab」。
 * 仅内存；SW 休眠后清空，由 `pickContentTab` 的 lastAccessed 回退兜底。
 */
export class ContentTabTracker {
  private readonly lastByWindow = new Map<number, number>();

  remember(tab: ContentTabLite): void {
    if (tab.id == null || tab.windowId == null) return;
    if (!isReadableContentUrl(tab.url)) return;
    this.lastByWindow.set(tab.windowId, tab.id);
  }

  forgetTab(tabId: number): void {
    for (const [windowId, id] of this.lastByWindow) {
      if (id === tabId) this.lastByWindow.delete(windowId);
    }
  }

  lastTabId(windowId: number): number | undefined {
    return this.lastByWindow.get(windowId);
  }
}
