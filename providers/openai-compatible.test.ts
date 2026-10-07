/**
 * OpenAICompatibleProvider 单测
 * 用本地 mock HTTP server 覆盖：模型列表、流式/一次性对话、鉴权头、
 * HTTP 状态 → 错误码映射、未配置与网络失败分支
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { OpenAICompatibleProvider } from './openai-compatible';

type Route = (req: http.IncomingMessage, res: http.ServerResponse) => void;

/** 起一个可编程 mock HTTP server（端口随机，测完显式关闭） */
async function startMockServer(routes: Record<string, Route>) {
  const server = http.createServer((req, res) => {
    const handler = routes[`${req.method} ${req.url}`];
    if (!handler) {
      res.writeHead(404).end('not found');
      return;
    }
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

const closers: Array<() => Promise<void>> = [];
afterAll(async () => {
  await Promise.all(closers.map((c) => c()));
});

/** 以 OpenAI SSE 格式分块写出全部文本 */
function sseReply(res: http.ServerResponse, parts: string[]) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const p of parts) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`);
  }
  res.end();
}

/** 收集 chatStream 的全部输出 */
async function drain(iterable: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of iterable) out += chunk;
  return out;
}

describe('OpenAICompatibleProvider', () => {
  it('listModels 去掉尾部斜杠并按名称排序', async () => {
    const srv = await startMockServer({
      'GET /v1/models': (_req, res) => {
        res.writeHead(200).end(
          JSON.stringify({ data: [{ id: 'b-model' }, { id: 'a-model' }] }),
        );
      },
    });
    closers.push(srv.close);

    const provider = new OpenAICompatibleProvider(`${srv.baseUrl}/v1/`, 'sk-test');
    expect(await provider.listModels()).toEqual(['a-model', 'b-model']);
  });

  it('testConnection 成功时返回模型数量', async () => {
    const srv = await startMockServer({
      'GET /v1/models': (_req, res) => {
        res.writeHead(200).end(JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }));
      },
    });
    closers.push(srv.close);

    const tc = await new OpenAICompatibleProvider(`${srv.baseUrl}/v1`, 'sk').testConnection();
    expect(tc).toEqual({ ok: true, detail: '已连接，可用模型 2 个' });
  });

  it('chatStream 注入 Bearer 头并携带 stream=true', async () => {
    let authHeader = '';
    let body = '';
    const srv = await startMockServer({
      'POST /v1/chat/completions': (req, res) => {
        authHeader = String(req.headers.authorization ?? '');
        req.on('data', (c) => (body += c));
        req.on('end', () => sseReply(res, ['你', '好']));
      },
    });
    closers.push(srv.close);

    const provider = new OpenAICompatibleProvider(`${srv.baseUrl}/v1`, 'sk-test');
    const text = await drain(
      provider.chatStream({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }),
    );

    expect(text).toBe('你好');
    expect(authHeader).toBe('Bearer sk-test');
    expect(JSON.parse(body)).toMatchObject({ stream: true, model: 'm' });
    expect(JSON.parse(body).tools).toBeUndefined();
  });

  it('chat 带 tools 时请求体含 tools，且允许仅 tool_calls 无文本', async () => {
    let body = '';
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'snapshot',
          description: 'page snapshot',
          parameters: { type: 'object', properties: {} },
        },
      },
    ];
    const srv = await startMockServer({
      'POST /v1/chat/completions': (req, res) => {
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          res.write(
            `data: ${JSON.stringify({
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: 'call_s',
                        type: 'function',
                        function: { name: 'snapshot', arguments: '{}' },
                      },
                    ],
                  },
                  finish_reason: 'tool_calls',
                },
              ],
            })}\n\n`,
          );
          res.end();
        });
      },
    });
    closers.push(srv.close);

    const provider = new OpenAICompatibleProvider(`${srv.baseUrl}/v1`, 'sk');
    const result = await provider.chat({
      model: 'm',
      messages: [{ role: 'user', content: '看一下页面' }],
      tools,
      tool_choice: 'auto',
    });

    expect(JSON.parse(body)).toMatchObject({
      tools,
      tool_choice: 'auto',
      stream: true,
    });
    expect(result).toEqual({
      content: '',
      finish_reason: 'tool_calls',
      tool_calls: [
        {
          id: 'call_s',
          type: 'function',
          function: { name: 'snapshot', arguments: '{}' },
        },
      ],
    });
  });

  it('apiKey 为空白时在发请求前就被拦下', async () => {
    let hit = false;
    const srv = await startMockServer({
      'GET /v1/models': (_req, res) => {
        hit = true;
        res.writeHead(200).end(JSON.stringify({ data: [] }));
      },
    });
    closers.push(srv.close);

    const provider = new OpenAICompatibleProvider(`${srv.baseUrl}/v1`, '   ');
    await expect(provider.listModels()).rejects.toMatchObject({ code: 'NO_API_KEY' });
    // 未配置时不应产生任何网络请求
    expect(hit).toBe(false);
  });

  it('chat 返回 trim 后的全文', async () => {
    const srv = await startMockServer({
      'POST /v1/chat/completions': (_req, res) => sseReply(res, ['  hello ', 'world  ']),
    });
    closers.push(srv.close);

    const provider = new OpenAICompatibleProvider(`${srv.baseUrl}/v1`, 'sk');
    expect(await provider.chat({ model: 'm', messages: [] })).toEqual({
      content: 'hello world',
    });
  });

  it.each([
    [401, 'UNAUTHORIZED'],
    [403, 'UNAUTHORIZED'],
    [404, 'MODEL_NOT_FOUND'],
    [429, 'RATE_LIMIT'],
    [500, 'CHAT_FAILED'],
  ])('HTTP %i 映射为错误码 %s', async (status, code) => {
    const srv = await startMockServer({
      'POST /v1/chat/completions': (_req, res) => res.writeHead(status).end('err'),
    });
    closers.push(srv.close);

    const provider = new OpenAICompatibleProvider(`${srv.baseUrl}/v1`, 'sk');
    await expect(
      drain(provider.chatStream({ model: 'm', messages: [] })),
    ).rejects.toMatchObject({ code });
  });

  it('缺少配置时给出 NO_API_KEY / NO_BASE_URL', async () => {
    const noKey = new OpenAICompatibleProvider('http://127.0.0.1:1/v1', '');
    expect(await noKey.testConnection()).toMatchObject({ ok: false, code: 'NO_API_KEY' });

    const noUrl = new OpenAICompatibleProvider('', 'sk');
    expect(await noUrl.testConnection()).toMatchObject({ ok: false, code: 'NO_BASE_URL' });
  });

  it('端口不通时映射为 NETWORK', async () => {
    const provider = new OpenAICompatibleProvider('http://127.0.0.1:1/v1', 'sk');
    expect(await provider.testConnection()).toMatchObject({ ok: false, code: 'NETWORK' });
  });

  it('model 为空白时抛 NO_MODEL', async () => {
    const srv = await startMockServer({});
    closers.push(srv.close);

    const provider = new OpenAICompatibleProvider(`${srv.baseUrl}/v1`, 'sk');
    await expect(
      drain(provider.chatStream({ model: '   ', messages: [] })),
    ).rejects.toMatchObject({ code: 'NO_MODEL' });
  });
});
