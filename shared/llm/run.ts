import {
  createProviderFromSettings,
  resolveModel,
} from '@/providers/registry';
import type { ChatMessage, ChatResult } from '@/providers/types';
import { getSettings } from '@/shared/storage/settings';

export interface RunChatOptions {
  messages: ChatMessage[];
  /** 覆盖设置中的模型；默认 resolveModel */
  model?: string;
  signal?: AbortSignal;
}

/**
 * 薄封装：读设置 → 建 Provider → 一次性 chat
 * 仅 Background 调用；Feature 不要各自拼 Provider
 */
export async function runChat(options: RunChatOptions): Promise<ChatResult> {
  const settings = await getSettings();
  const provider = createProviderFromSettings(settings);
  const model = options.model ?? resolveModel(settings);
  return provider.chat({
    model,
    messages: options.messages,
    signal: options.signal,
  });
}

/**
 * 流式 chat：逐段 yield 文本 delta
 */
export async function* runChatStream(
  options: RunChatOptions,
): AsyncGenerator<string> {
  const settings = await getSettings();
  const provider = createProviderFromSettings(settings);
  const model = options.model ?? resolveModel(settings);
  yield* provider.chatStream({
    model,
    messages: options.messages,
    signal: options.signal,
  });
}
