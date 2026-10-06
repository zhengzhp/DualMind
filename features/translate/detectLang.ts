/**
 * 划词源语言启发式：不调用模型，仅用于中英互切目标语。
 * - 纯英文 → zh-CN
 * - 纯中文 → en
 * - 中英混排 → zh-CN
 * - 其它 / 无法判断 → en
 */

export type SourceLangKind = 'en' | 'zh' | 'mixed' | 'other';

const CJK_RE = /[\u4e00-\u9fff]/g;
const LATIN_RE = /[a-zA-Z]/g;

/** 至少若干拉丁字母才视为「含英文」，避免单个字母误判混排 */
const MIN_LATIN_FOR_EN = 2;

export function classifySourceLang(text: string): SourceLangKind {
  const sample = text.trim();
  if (!sample) return 'other';

  const cjk = sample.match(CJK_RE)?.length ?? 0;
  const latin = sample.match(LATIN_RE)?.length ?? 0;
  const hasCjk = cjk > 0;
  const hasLatin = latin >= MIN_LATIN_FOR_EN;

  if (hasCjk && hasLatin) return 'mixed';
  if (hasCjk) return 'zh';
  if (hasLatin) return 'en';
  return 'other';
}

/** 划词未显式指定目标语时的中英互切 */
export function resolveAutoTargetLanguage(text: string): 'zh-CN' | 'en' {
  const kind = classifySourceLang(text);
  if (kind === 'zh') return 'en';
  if (kind === 'en' || kind === 'mixed') return 'zh-CN';
  return 'en';
}
