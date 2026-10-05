/** 语言代码 → 可读名称（用于 prompt） */
const LANGUAGE_NAMES: Record<string, string> = {
  'zh-CN': 'Simplified Chinese',
  'zh-TW': 'Traditional Chinese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  ru: 'Russian',
  pt: 'Portuguese',
};

export function languageLabel(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

/** 系统提示：约束只输出译文 */
export function buildTranslateSystemPrompt(targetLanguage: string): string {
  const target = languageLabel(targetLanguage);
  return [
    'You are a professional translator.',
    `Translate the user's text into ${target}.`,
    'Rules:',
    '- Output ONLY the translation, with no quotes, labels, or explanations.',
    '- Preserve meaning, tone, and proper nouns when appropriate.',
    '- Keep markdown / code / URLs unchanged if present.',
    '- If the text is already in the target language, return it unchanged.',
  ].join('\n');
}

export function buildTranslateUserPrompt(text: string): string {
  return text;
}
