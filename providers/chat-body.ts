import type { ChatInput } from './types';

/**
 * 构造 OpenAI 兼容 /chat/completions 请求体
 * tools / tool_choice 仅在有工具时附带，避免干扰纯文本路径
 */
export function buildChatCompletionsBody(input: ChatInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    temperature: 0.2,
    stream: true,
  };
  if (input.tools?.length) {
    body.tools = input.tools;
    if (input.tool_choice !== undefined) {
      body.tool_choice = input.tool_choice;
    }
  }
  return body;
}
