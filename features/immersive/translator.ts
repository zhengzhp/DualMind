/**
 * 沉浸式全文翻译的编排（仅在 Background 调用）。
 *
 * 与 `features/translate/service.ts` 隔离：不写 `translateSession`，
 * 只按批把网页片段送去翻译并回传结果。
 */
import { AppError, normalizeError, toUserMessage } from '@/shared/errors';
import { runChat } from '@/shared/llm/run';
import { parseSegmentedOutput } from './parse';
import {
  buildImmersiveSystemPrompt,
  buildImmersiveUserPrompt,
} from './prompts';
import type { ImmersiveSegment, ImmersiveSegmentResult } from './types';
import { looksLikeEcho } from './validate';

/**
 * 翻译一批片段。
 *
 * 整批解析缺段 / 回显时逐段补译，避免个别段落异常导致整页失败；
 * 单段补译仍回显时显式标记 `untranslated`，不让回显伪装成成功。
 */
export async function translateBatch(
  segments: ImmersiveSegment[],
  targetLanguage: string,
  signal?: AbortSignal,
): Promise<ImmersiveSegmentResult[]> {
  if (segments.length === 0) return [];

  if (segments.length === 1) {
    const only = segments[0];
    if (!only) return [];
    return [await translateOne(only, targetLanguage, signal)];
  }

  const { content } = await runChat({
    messages: [
      { role: 'system', content: buildImmersiveSystemPrompt(targetLanguage) },
      { role: 'user', content: buildImmersiveUserPrompt(segments) },
    ],
    signal,
  });

  const parsed = parseSegmentedOutput(content, segments.length);
  const results: ImmersiveSegmentResult[] = [];
  const fallback: ImmersiveSegment[] = [];

  segments.forEach((segment, index) => {
    const text = (parsed[index] ?? '').trim();
    // 缺段或与原文完全一致（回显）都视为未翻译，交给逐段补译
    if (!text || looksLikeEcho(text, segment.text)) fallback.push(segment);
    else results.push({ id: segment.id, text });
  });

  // 降级：逐段补译缺失 / 回显的内容；单段失败不影响其余片段
  for (const segment of fallback) {
    if (signal?.aborted) throw new AppError(toUserMessage('ABORTED'), 'ABORTED');
    results.push(await translateOne(segment, targetLanguage, signal));
  }

  return results;
}

/**
 * 单段翻译（含回显兜底）：包一层 `[[1]]` 复用同一套 prompt 与解析。
 * 单段仍回显 / 失败时标记 `untranslated`，保留原文并让 UI 明示未翻译。
 */
async function translateOne(
  segment: ImmersiveSegment,
  targetLanguage: string,
  signal?: AbortSignal,
): Promise<ImmersiveSegmentResult> {
  try {
    const text = await translateSingle(segment.text, targetLanguage, signal);
    if (looksLikeEcho(text, segment.text)) {
      return { id: segment.id, text: segment.text, untranslated: true };
    }
    return { id: segment.id, text };
  } catch (err) {
    const normalized = normalizeError(err);
    if (normalized.code === 'ABORTED') throw normalized;
    // 单段失败：标记未翻译，避免中断整页进度
    return { id: segment.id, text: segment.text, untranslated: true };
  }
}

/** 单段翻译：包一层 `[[1]]` 复用同一套 prompt 与解析 */
async function translateSingle(
  text: string,
  targetLanguage: string,
  signal?: AbortSignal,
): Promise<string> {
  const { content } = await runChat({
    messages: [
      { role: 'system', content: buildImmersiveSystemPrompt(targetLanguage) },
      { role: 'user', content: `[[1]]\n${text}` },
    ],
    signal,
  });
  const parsed = (parseSegmentedOutput(content, 1)[0] ?? '').trim();
  return parsed || content.trim();
}
