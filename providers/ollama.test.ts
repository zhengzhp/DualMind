/**
 * OllamaProvider 单测
 * 用本地 mock HTTP server 覆盖：/api/tags 模型列表、OpenAI 兼容流式对话、
 * 未启动 / 空 host / 无模型 / 模型不存在等错误分支
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { OllamaProvider } from './ollama';

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

describe('OllamaProvider', () => {
  it('listModels 解析 /api/tags 并去掉尾部斜杠', async () => {
    const srv = await startMockServer({
      'GET /api/tags': (_req, res) => {
        res
          .writeHead(200)
          .end(JSON.stringify({ models: [{ name: 'qwen2.5' }, { name: 'llama3' }] }));
      },
    });
    closers.push(srv.close);

    const provider = new OllamaProvider(`${srv.baseUrl}/`);
    expect(await provider.listModels()).toEqual(['llama3', 'qwen2.5']);
  });

  it('testConnection 报告本地模型数量', async () => {
    const srv = await startMockServer({
      'GET /api/tags': (_req, res) => {
        res.writeHead(200).end(JSON.stringify({ models: [{ name: 'a' }, { name: 'b' }] }));
      },
    });
    closers.push(srv.close);

    const tc = await new OllamaProvider(srv.baseUrl).testConnection();
    expect(tc).toEqual({ ok: true, detail: '已连接，本地模型 2 个' });
  });

  it('已连通但本地无模型时提示 ollama pull', async () => {
    const srv = await startMockServer({
      'GET /api/tags': (_req, res) => {
        res.writeHead(200).end(JSON.stringify({ models: [] }));
      },
    });
    closers.push(srv.close);

    const tc = await new OllamaProvider(srv.baseUrl).testConnection();
    expect(tc).toMatchObject({ ok: false, code: 'NO_MODEL' });
    expect(tc.ok === false && tc.error).toContain('ollama pull');
  });

  it('chatStream 走 /v1/chat/completions 并解析中文流', async () => {
    const srv = await startMockServer({
      'POST /v1/chat/completions': (_req, res) => sseReply(res, ['测', '试', '成功']),
    });
    closers.push(srv.close);

    const provider = new OllamaProvider(srv.baseUrl);
    const text = await drain(
      provider.chatStream({ model: 'qwen2.5', messages: [] }),
    );
    expect(text).toBe('测试成功');
  });

  it('模型不存在（404）映射为 MODEL_NOT_FOUND', async () => {
    const srv = await startMockServer({
      'POST /v1/chat/completions': (_req, res) => res.writeHead(404).end('nope'),
    });
    closers.push(srv.close);

    await expect(
      drain(new OllamaProvider(srv.baseUrl).chatStream({ model: 'ghost', messages: [] })),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' });
  });

  it('未启动时映射为 OLLAMA_UNREACHABLE', async () => {
    const tc = await new OllamaProvider('http://127.0.0.1:1').testConnection();
    expect(tc).toMatchObject({ ok: false, code: 'OLLAMA_UNREACHABLE' });
  });

  it('host 为空白时映射为 NO_HOST', async () => {
    const tc = await new OllamaProvider('   ').testConnection();
    expect(tc).toMatchObject({ ok: false, code: 'NO_HOST' });
  });
});
