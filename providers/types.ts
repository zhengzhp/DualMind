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

/** 统一 Provider 接口：永不碰 DOM */
export interface ChatProvider {
  id: string;
  listModels(): Promise<string[]>;
  chat(input: ChatInput): Promise<ChatResult>;
  /** 连通性检测，成功返回简短信息 */
  testConnection(): Promise<{ ok: true; detail: string } | { ok: false; error: string }>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
