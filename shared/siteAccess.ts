/**
 * 站点访问判定的唯一实现。
 *
 * 三处消费方共用以避免语义漂移：
 * - 内容脚本注入前判断是否整体跳过（`entrypoints/content.ts`）
 * - 内容脚本判断是否挂载悬浮入口
 * - Background 右键菜单项按站点置灰（`entrypoints/background.ts`）
 *
 * 这里有两个**语义不同**的判定，不要合并：
 * - `isHostDisabled`：整站停用（划词 + 悬浮入口一起关）
 * - `isFabHidden`：只隐藏悬浮入口，划词照常
 */

/** 从页面地址解析 hostname（空串 / 非法 URL 均返回空串） */
export function hostnameFromUrl(url: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * 该 hostname 是否命中站点禁用列表。
 * 语义与内容脚本一致：**精确匹配 hostname**；空 hostname 不视为禁用。
 */
export function isHostDisabled(
  disabledHosts: readonly string[],
  hostname: string,
): boolean {
  return hostname !== '' && disabledHosts.includes(hostname);
}

/** 悬浮入口是否应当出现在该 hostname（全局开关 / 站点列表任一命中即不显示） */
export function shouldShowPageFab(
  settings: {
    pageFabEnabled: boolean;
    pageFabHiddenHosts: readonly string[];
  },
  hostname: string,
): boolean {
  if (!settings.pageFabEnabled) return false;
  // 复用与 disabledHosts 相同的匹配语义（精确 hostname，不误伤子域名）
  return !isHostDisabled(settings.pageFabHiddenHosts, hostname);
}
