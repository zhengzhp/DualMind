import {
  createProviderFromSettings,
  resolveModel,
} from '@/providers/registry';
import type {
  ChatMessage,
  ChatResult,
  ChatStreamEvent,
  ToolChoice,
  ToolDefinition,
} from '@/providers/types';
import { getSettings } from '@/shared/storage/settings';

export interface RunChatOptions {
  messages: ChatMessage[];
  /** 覆盖设置中的模型；默认 resolveModel */
  model?: string;
  signal?: AbortSignal;
}

export interface RunChatWithToolsOptions extends RunChatOptions {
  tools: ToolDefinition[];
  tool_choice?: ToolChoice;
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

/**
 * 带 tools 的一次性 chat（可能返回 tool_calls，content 可为空）
 * Agent tool 环用此入口；不支持 tools 的模型由上层检测并提示
 */
export async function runChatWithTools(
  options: RunChatWithToolsOptions,
): Promise<ChatResult> {
  const settings = await getSettings();
  const provider = createProviderFromSettings(settings);
  const model = options.model ?? resolveModel(settings);
  return provider.chat({
    model,
    messages: options.messages,
    tools: options.tools,
    tool_choice: options.tool_choice,
    signal: options.signal,
  });
}

/**
 * 带 tools 的流式事件（content / tool_call_delta / finish）
 * 供 Agent 边收边展示；完整结果用 providers/tool-calls.collectChatResult
 */
export async function* runChatStreamWithTools(
  options: RunChatWithToolsOptions,
): AsyncGenerator<ChatStreamEvent> {
  const settings = await getSettings();
  const provider = createProviderFromSettings(settings);
  const model = options.model ?? resolveModel(settings);
  yield* provider.chatStreamEvents({
    model,
    messages: options.messages,
    tools: options.tools,
    tool_choice: options.tool_choice,
    signal: options.signal,
  });
}
