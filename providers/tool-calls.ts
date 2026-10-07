import type { ChatResult, ChatStreamEvent, ToolCall } from './types';

/** 流式 tool_calls 增量（OpenAI choices[0].delta.tool_calls 单项） */
export interface ToolCallStreamDelta {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * 按 index 合并流式 tool_calls 增量，得到完整 ToolCall[]
 * name / arguments 可能分片到达，按拼接合并
 */
export class ToolCallAccumulator {
  private readonly byIndex = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();

  apply(deltas: ToolCallStreamDelta[]): void {
    for (const d of deltas) {
      const cur = this.byIndex.get(d.index) ?? {
        id: '',
        name: '',
        arguments: '',
      };
      if (d.id) cur.id = d.id;
      if (d.function?.name) cur.name += d.function.name;
      if (d.function?.arguments) cur.arguments += d.function.arguments;
      this.byIndex.set(d.index, cur);
    }
  }

  /** 是否收到过任意增量 */
  get size(): number {
    return this.byIndex.size;
  }

  toToolCalls(): ToolCall[] {
    return [...this.byIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => ({
        id: v.id,
        type: 'function' as const,
        function: { name: v.name, arguments: v.arguments },
      }));
  }
}

/**
 * 消费 chatStreamEvents，拼出最终 ChatResult
 * 供 Provider.chat / shared/llm 复用
 */
export async function collectChatResult(
  events: AsyncIterable<ChatStreamEvent>,
): Promise<ChatResult> {
  let content = '';
  let finish_reason: string | null | undefined;
  const tools = new ToolCallAccumulator();

  for await (const ev of events) {
    if (ev.type === 'content') {
      content += ev.delta;
    } else if (ev.type === 'tool_call_delta') {
      tools.apply([
        {
          index: ev.index,
          id: ev.id,
          function: {
            name: ev.name,
            arguments: ev.argumentsDelta,
          },
        },
      ]);
    } else if (ev.type === 'finish') {
      finish_reason = ev.finish_reason;
    }
  }

  const tool_calls = tools.size > 0 ? tools.toToolCalls() : undefined;
  // finish_reason 仅在有明确字符串时带出，避免纯文本路径多一个 null 字段
  return {
    content: content.trim(),
    ...(tool_calls ? { tool_calls } : {}),
    ...(finish_reason ? { finish_reason } : {}),
  };
}
