/**
 * OpenAI 兼容 SSE 流解析单测
 * 覆盖：跨 TCP 分包的 buffer 拼接、注释/空行/残缺 JSON 容错、[DONE] 终止、abort、tool_calls
 */
import { describe, expect, it } from 'vitest';
import { parseOpenAIChatCompletionsSSE, parseOpenAIChatSSE } from './sse';
import { collectChatResult } from './tool-calls';

/** 把若干字符串按顺序推入一个 Response 的 body，模拟网络分包 */
function responseFrom(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body);
}

/** 构造一条 OpenAI 风格的 delta 事件 */
function sseDelta(content: string): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content } }],
  })}\n\n`;
}

async function collect(res: Response, signal?: AbortSignal): Promise<string[]> {
  const out: string[] = [];
  for await (const d of parseOpenAIChatSSE(res, signal)) out.push(d);
  return out;
}

describe('parseOpenAIChatSSE', () => {
  it('拼接多个 SSE 事件为完整文本', async () => {
    const out = await collect(responseFrom(['a', 'b', 'c'].map(sseDelta)));
    expect(out.join('')).toBe('abc');
  });

  it('单个事件被拆成多个 TCP 包时仍能正确拼接', async () => {
    const raw = sseDelta('你') + sseDelta('好') + sseDelta('，世界');
    // 按 17 / 40 字节切成三段，故意切在 JSON 中间
    const out = await collect(
      responseFrom([raw.slice(0, 17), raw.slice(17, 40), raw.slice(40)]),
    );
    expect(out.join('')).toBe('你好，世界');
  });

  it('忽略注释行、空行与残缺 JSON 行', async () => {
    const out = await collect(
      responseFrom([
        ': keep-alive\n\n',
        sseDelta('A'),
        'data: {bad json\n\n',
        '\n',
        sseDelta('B'),
      ]),
    );
    expect(out.join('')).toBe('AB');
  });

  it('遇到 [DONE] 立即停止，忽略其后的内容', async () => {
    const out = await collect(
      responseFrom([sseDelta('A'), 'data: [DONE]\n\n', sseDelta('C')]),
    );
    expect(out.join('')).toBe('A');
  });

  it('delta 没有 content 时不产出空串', async () => {
    const out = await collect(
      responseFrom([
        'data: {"choices":[{"delta":{}}]}\n\n',
        sseDelta('X'),
        'data: {"choices":[{"delta":{"content":""}}]}\n\n',
      ]),
    );
    expect(out).toEqual(['X']);
  });

  it('响应无 body 时抛错', async () => {
    await expect(collect(new Response(null))).rejects.toThrow();
  });

  it('signal 已 abort 时抛 AbortError', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      collect(responseFrom([sseDelta('A')]), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('parseOpenAIChatCompletionsSSE · tool_calls', () => {
  it('合并分片 tool_calls 并读出 finish_reason', async () => {
    const frames = [
      `data: ${JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'snap', arguments: '' },
                },
              ],
            },
          },
        ],
      })}\n\n`,
      `data: ${JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '{"i":' } }],
            },
          },
        ],
      })}\n\n`,
      `data: ${JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '1}' } }],
            },
            finish_reason: 'tool_calls',
          },
        ],
      })}\n\n`,
      'data: [DONE]\n\n',
    ];

    const result = await collectChatResult(
      parseOpenAIChatCompletionsSSE(responseFrom(frames)),
    );
    expect(result).toEqual({
      content: '',
      finish_reason: 'tool_calls',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'snap', arguments: '{"i":1}' },
        },
      ],
    });
  });

  it('中间帧 finish_reason:null 不提前结束', async () => {
    const frames = [
      `data: ${JSON.stringify({
        choices: [{ delta: { content: 'A' }, finish_reason: null }],
      })}\n\n`,
      `data: ${JSON.stringify({
        choices: [{ delta: { content: 'B' }, finish_reason: 'stop' }],
      })}\n\n`,
    ];
    const events = [];
    for await (const ev of parseOpenAIChatCompletionsSSE(responseFrom(frames))) {
      events.push(ev);
    }
    expect(events).toEqual([
      { type: 'content', delta: 'A' },
      { type: 'content', delta: 'B' },
      { type: 'finish', finish_reason: 'stop' },
    ]);
  });
});
