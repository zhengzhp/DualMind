import type { ToolCallStreamDelta } from './tool-calls';
import type { ChatStreamEvent } from './types';

/** OpenAI chat/completions SSE 单帧可解析字段 */
export interface OpenAIChatCompletionsChunk {
  content?: string;
  tool_calls?: ToolCallStreamDelta[];
  finish_reason?: string | null;
}

/**
 * 解析 OpenAI 兼容 chat/completions SSE，产出 content / tool_calls / finish
 * 行格式：data: {...} / data: [DONE]
 */
export async function* parseOpenAIChatCompletionsSSE(
  res: Response,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  if (!res.body) {
    throw new Error('响应无 body，无法流式读取');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let emittedFinish = false;

  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          if (!emittedFinish) {
            emittedFinish = true;
            yield { type: 'finish', finish_reason: null };
          }
          return;
        }

        try {
          const json = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string | null;
                tool_calls?: ToolCallStreamDelta[];
              };
              finish_reason?: string | null;
            }>;
          };
          const choice = json.choices?.[0];
          if (!choice) continue;

          const content = choice.delta?.content;
          if (content) {
            yield { type: 'content', delta: content };
          }

          const toolCalls = choice.delta?.tool_calls;
          if (toolCalls?.length) {
            for (const tc of toolCalls) {
              yield {
                type: 'tool_call_delta',
                index: tc.index,
                id: tc.id,
                name: tc.function?.name,
                argumentsDelta: tc.function?.arguments,
              };
            }
          }

                          // 流式中间帧常带 finish_reason: null，仅非空字符串才算结束
          if (typeof choice.finish_reason === 'string') {
            emittedFinish = true;
            yield { type: 'finish', finish_reason: choice.finish_reason };
          }
        } catch {
          /* 忽略残缺 JSON 行 */
        }
      }
    }

    if (!emittedFinish) {
      yield { type: 'finish', finish_reason: null };
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * 仅产出文本 delta（兼容翻译 / Chat 旧调用）
 */
export async function* parseOpenAIChatSSE(
  res: Response,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  for await (const ev of parseOpenAIChatCompletionsSSE(res, signal)) {
    if (ev.type === 'content') yield ev.delta;
  }
}
