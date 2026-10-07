import type { ErrorCode } from '@/shared/errors';
import { ProviderError } from '@/shared/errors';

/** Chat 消息角色（含 tool-calling 多轮） */
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** OpenAI 风格 function tool 定义 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    /** JSON Schema object */
    parameters?: Record<string, unknown>;
  };
}

/** 模型发起的一次完整 tool 调用 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    /** JSON 字符串，由调用方 JSON.parse */
    arguments: string;
  };
}

export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

export interface ChatMessage {
  role: ChatRole;
  /** assistant 仅 tool_calls 时可为空串；tool 角色放执行结果 */
  content: string;
  /** assistant 回合携带的工具调用 */
  tool_calls?: ToolCall[];
  /** role=tool 时对应的 call id */
  tool_call_id?: string;
}

export interface ChatInput {
  model: string;
  messages: ChatMessage[];
  /** 有值时请求体带 tools（需模型支持） */
  tools?: ToolDefinition[];
  tool_choice?: ToolChoice;
  signal?: AbortSignal;
}

export interface ChatResult {
  content: string;
  tool_calls?: ToolCall[];
  finish_reason?: string | null;
}

/**
 * 流式事件：文本增量 / tool_call 增量 / 结束
 * Agent UI 可边收边展示；最终结果用 finish_reason + 累加器拼出
 */
export type ChatStreamEvent =
  | { type: 'content'; delta: string }
  | {
      type: 'tool_call_delta';
      index: number;
      id?: string;
      name?: string;
      argumentsDelta?: string;
    }
  | { type: 'finish'; finish_reason: string | null };

/** Provider 能力声明 */
export interface ProviderCapabilities {
  streaming: boolean;
  /** 协议层支持 tools；具体模型仍可能不支持（由 UI 提示） */
  toolCalling: boolean;
}

/** 统一 Provider 接口：永不碰 DOM */
export interface ChatProvider {
  id: string;
  capabilities: ProviderCapabilities;
  listModels(): Promise<string[]>;
  chat(input: ChatInput): Promise<ChatResult>;
  /** 流式文本；不支持时应退化为单次 yield 全文 */
  chatStream(input: ChatInput): AsyncIterable<string>;
  /** 流式含 tool_calls；无 tools 时等价于 content 事件流 */
  chatStreamEvents(input: ChatInput): AsyncIterable<ChatStreamEvent>;
  /** 连通性检测，成功返回简短信息（不回显 Key） */
  testConnection(): Promise<
    { ok: true; detail: string } | { ok: false; error: string; code?: ErrorCode }
  >;
}

export { ProviderError };
