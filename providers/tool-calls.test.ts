/**
 * ToolCallAccumulator / collectChatResult 纯函数单测
 */
import { describe, expect, it } from 'vitest';
import { ToolCallAccumulator, collectChatResult } from './tool-calls';
import type { ChatStreamEvent } from './types';

async function* fromEvents(
  events: ChatStreamEvent[],
): AsyncGenerator<ChatStreamEvent> {
  for (const e of events) yield e;
}

describe('ToolCallAccumulator', () => {
  it('按 index 合并 id / name / arguments 分片', () => {
    const acc = new ToolCallAccumulator();
    acc.apply([
      {
        index: 0,
        id: 'c0',
        function: { name: 'click', arguments: '{"i"' },
      },
      { index: 0, function: { arguments: ':1}' } },
      {
        index: 1,
        id: 'c1',
        function: { name: 'fi', arguments: '' },
      },
      { index: 1, function: { name: 'll', arguments: '{}' } },
    ]);
    expect(acc.toToolCalls()).toEqual([
      {
        id: 'c0',
        type: 'function',
        function: { name: 'click', arguments: '{"i":1}' },
      },
      {
        id: 'c1',
        type: 'function',
        function: { name: 'fill', arguments: '{}' },
      },
    ]);
  });
});

describe('collectChatResult', () => {
  it('拼文本 + tool_calls，忽略空 finish', async () => {
    const result = await collectChatResult(
      fromEvents([
        { type: 'content', delta: ' hi ' },
        {
          type: 'tool_call_delta',
          index: 0,
          id: 'x',
          name: 'finish',
          argumentsDelta: '{}',
        },
        { type: 'finish', finish_reason: null },
      ]),
    );
    expect(result).toEqual({
      content: 'hi',
      tool_calls: [
        {
          id: 'x',
          type: 'function',
          function: { name: 'finish', arguments: '{}' },
        },
      ],
    });
  });
});
