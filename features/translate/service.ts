import {
  createProviderFromSettings,
  resolveModel,
} from '@/providers/registry';
import { getSettings, translateSessionItem } from '@/shared/storage/settings';
import {
  buildTranslateSystemPrompt,
  buildTranslateUserPrompt,
} from './prompts';
import type { TranslateRequest, TranslateResult } from './types';

/**
 * 翻译用例编排：读设置 → Provider → 写 session（供 Side Panel）
 * 仅在 Background 中调用
 */
export async function translateText(
  request: TranslateRequest,
): Promise<TranslateResult> {
  const text = request.text.trim();
  if (!text) {
    throw new Error('没有可翻译的文本');
  }

  const settings = await getSettings();
  const targetLanguage = request.targetLanguage ?? settings.targetLanguage;
  const provider = createProviderFromSettings(settings);
  const model = resolveModel(settings);

  const { content } = await provider.chat({
    model,
    messages: [
      { role: 'system', content: buildTranslateSystemPrompt(targetLanguage) },
      { role: 'user', content: buildTranslateUserPrompt(text) },
    ],
    signal: request.signal,
  });

  const result: TranslateResult = {
    sourceText: text,
    translatedText: content,
    targetLanguage,
  };

  await translateSessionItem.setValue({
    ...result,
    updatedAt: Date.now(),
  });

  return result;
}
