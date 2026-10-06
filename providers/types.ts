import type { ErrorCode } from '@/shared/errors';
import { ProviderError } from '@/shared/errors';

/** Chat 消息角色 */
export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatInput {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

export interface ChatResult {
  content: string;
}

/** Provider 能力声明，便于后续扩展 */
export interface ProviderCapabilities {
  streaming: boolean;
}

/** 统一 Provider 接口：永不碰 DOM */
export interface ChatProvider {
  id: string;
  capabilities: ProviderCapabilities;
  listModels(): Promise<string[]>;
  chat(input: ChatInput): Promise<ChatResult>;
  /** 流式输出；不支持时应退化为单次 yield 全文 */
  chatStream(input: ChatInput): AsyncIterable<string>;
  /** 连通性检测，成功返回简短信息（不回显 Key） */
  testConnection(): Promise<
    { ok: true; detail: string } | { ok: false; error: string; code?: ErrorCode }
  >;
}

export { ProviderError };
