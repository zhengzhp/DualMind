/**
 * 译文有效性校验（纯函数，便于单测）。
 *
 * 背景：代码模型（如 `*-coder`）在多语混排批量下会原样抄写输入，
 * 若不校验就会被当成「成功译文」渲染（见 docs/decisions.md 的 P0）。
 * 这里只做「译文是否等于原文」的回显检测，不判断翻译质量。
 */

/** 归一化：压缩所有空白、去首尾，消除换行 / 缩进差异带来的误判 */
export function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 译文是否只是把原文（近乎）原样抄回。
 * 空译文不算回显（交由「缺失」分支处理）。
 */
export function looksLikeEcho(translation: string, source: string): boolean {
  const translated = normalizeForCompare(translation);
  if (!translated) return false;
  return translated === normalizeForCompare(source);
}
