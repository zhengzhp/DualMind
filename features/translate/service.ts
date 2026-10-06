/**
 * 翻译用例编排：解析目标语 → shared/llm → 写 session（供 Side Panel）
 * 仅在 Background 中调用
 */
import { AppError, toUserMessage } from '@/shared/errors';
import { runChat, runChatStream } from '@/shared/llm/run';
import { translateSessionItem } from '@/shared/storage/settings';
import { resolveAutoTargetLanguage } from './detectLang';
import {
  buildTranslateSystemPrompt,
  buildTranslateUserPrompt,
} from './prompts';
import type { TranslateRequest, TranslateResult } from './types';

function buildMessages(text: string, targetLanguage: string) {
  return [
    { role: 'system' as const, content: buildTranslateSystemPrompt(targetLanguage) },
    { role: 'user' as const, content: buildTranslateUserPrompt(text) },
  ];
}

async function prepare(
  request: TranslateRequest,
): Promise<{ text: string; targetLanguage: string }> {
  const text = request.text.trim();
  if (!text) {
    throw new AppError(toUserMessage('EMPTY_TEXT'), 'EMPTY_TEXT');
  }
  // 未显式指定时走划词中英互切；Side Panel 会传入用户选择的目标语
  const targetLanguage =
    request.targetLanguage ?? resolveAutoTargetLanguage(text);
  return { text, targetLanguage };
}

/** 非流式：兼容右键菜单等一次性场景 */
export async function translateText(
  request: TranslateRequest,
): Promise<TranslateResult> {
  const { text, targetLanguage } = await prepare(request);
  const { content } = await runChat({
    messages: buildMessages(text, targetLanguage),
    signal: request.signal,
  });

  const result: TranslateResult = {
    sourceText: text,
    translatedText: content.trim(),
    targetLanguage,
  };

  await translateSessionItem.setValue({
    ...result,
    updatedAt: Date.now(),
  });

  return result;
}

export type TranslateStreamEvent =
  | { type: 'chunk'; text: string; accumulated: string }
  | { type: 'done'; result: TranslateResult };

/**
 * 流式翻译：边生成边写 session，Side Panel 可通过 storage 监听更新
 */
export async function* translateTextStream(
  request: TranslateRequest,
): AsyncGenerator<TranslateStreamEvent> {
  const { text, targetLanguage } = await prepare(request);

  await translateSessionItem.setValue({
    sourceText: text,
    translatedText: '',
    targetLanguage,
    updatedAt: Date.now(),
  });

  let accumulated = '';
  try {
    for await (const delta of runChatStream({
      messages: buildMessages(text, targetLanguage),
      signal: request.signal,
    })) {
      accumulated += delta;
      await translateSessionItem.setValue({
        sourceText: text,
        translatedText: accumulated,
        targetLanguage,
        updatedAt: Date.now(),
      });
      yield { type: 'chunk', text: delta, accumulated };
    }

    const trimmed = accumulated.trim();
    if (!trimmed) {
      throw new AppError(toUserMessage('EMPTY_RESPONSE'), 'EMPTY_RESPONSE');
    }

    const result: TranslateResult = {
      sourceText: text,
      translatedText: trimmed,
      targetLanguage,
    };

    await translateSessionItem.setValue({
      ...result,
      updatedAt: Date.now(),
    });
    yield { type: 'done', result };
  } catch (err) {
    // 由调用方统一 normalize；此处把 session 标上错误便于 Side Panel
    if (err instanceof AppError && err.code !== 'ABORTED') {
      await translateSessionItem.setValue({
        sourceText: text,
        translatedText: accumulated,
        targetLanguage,
        updatedAt: Date.now(),
        error: err.message,
      });
    }
    throw err;
  }
}
