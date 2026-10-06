/**
 * 站点禁用（`AppSettings.disabledHosts`）判定的唯一实现。
 *
 * 两处消费方共用以避免语义漂移：
 * - 内容脚本注入前判断是否跳过（`entrypoints/content.ts`）
 * - Background 右键菜单项按站点置灰（`entrypoints/background.ts`）
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
