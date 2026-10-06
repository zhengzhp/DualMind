/**
 * 沉浸式全文翻译的 Prompt。
 * 用 `[[n]]` 编号标记而非 JSON：小模型对结构化分隔符的遵循度更高，
 * 且解析失败时能优雅降级（见 parse.ts）。
 */
import { languageLabel } from '@/features/translate/prompts';
import type { ImmersiveSegment } from './types';

export function buildImmersiveSystemPrompt(targetLanguage: string): string {
  const target = languageLabel(targetLanguage);
  return [
    'You are a professional translator working on a web page.',
    `Translate every numbered segment into ${target}.`,
    'Input format: each segment is preceded by a marker line like [[1]].',
    'Output rules:',
    '- For each input segment, output the SAME marker line, then its translation on the following lines.',
    '- Keep the original order; never merge, skip, or renumber segments.',
    '- Output ONLY marker lines and translations. No explanations or extra commentary.',
    '- Keep code, URLs, numbers and markdown syntax unchanged.',
    '- If a segment is already in the target language, repeat it unchanged.',
  ].join('\n');
}

export function buildImmersiveUserPrompt(
  segments: ImmersiveSegment[],
): string {
  return segments
    .map((segment, index) => `[[${index + 1}]]\n${segment.text}`)
    .join('\n\n');
}
