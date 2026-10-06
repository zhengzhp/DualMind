/**
 * 会话来源页与「当前页」是否同一页面的判定（纯函数，可单测）。
 *
 * 背景：会话记录了 `pageUrl`，但重开旧会话后提问取的是**当前活动标签页**的正文。
 * 两者不一致时需在发送前确认（见 docs/decisions.md「会话与页面绑定」）。
 */

/**
 * 归一化页面地址：只保留 `origin + pathname + search`，**忽略 hash**。
 *
 * 忽略 hash 的原因：站内锚点跳转（`#section`）仍属同一页，不应被误判成
 * 「换了页面」而反复弹确认。
 */
export function normalizePageUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    // 非标准 URL（如 about:blank）：原样比较，交由调用方决定
    return url;
  }
}

/**
 * 两个页面地址是否指向同一页面。
 * 任一侧为空串时视为「未知」，返回 `false`（调用方需自行判断是否具备可比性）。
 */
export function isSamePageUrl(a: string, b: string): boolean {
  const left = normalizePageUrl(a);
  const right = normalizePageUrl(b);
  if (!left || !right) return false;
  return left === right;
}
