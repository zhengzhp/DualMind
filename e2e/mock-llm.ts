/**
 * V3 测试专用「OpenAI 兼容」mock 服务器（**零新增依赖**，仅 node:http）
 *
 * 为什么需要它（见 .cursor/plans/dualmind-agent-e2e-harness.plan.md）：
 * - Agent 的 tool 环要求模型返回**结构化** tool_calls，真模型是**概率性**的；
 *   安全闸门层（SEC-17）需要模型**必然**吐出危险 tool_call —— 人工两次都没构造出来。
 * - 错误注入（NET-04：401/429/5xx/连接重置/慢响应）与超时（LIFE-06）需要确定性。
 *
 * 协议要点（与 `providers/sse.ts` / `providers/tool-calls.ts` 对齐）：
 * - 响应必须是 `text/event-stream`，逐帧 `data: {...}`，以 `data: [DONE]` 结束；
 * - `tool_calls` 按 `choices[0].delta.tool_calls[].index` 增量拼接（name / arguments 可跨帧）；
 * - 结束帧带 `finish_reason: 'tool_calls'`（工具）或 `'stop'`（文本）。
 *
 * 分流规则：请求体**不含** `tools` → 计划调用（`runChat`，返回 JSON 计划文本）；
 * 含 `tools` → tool 环（`runChatWithTools`，返回 tool_calls）。二者共用一个有序脚本队列。
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/** mock 默认端口（与 Ollama 的 11434 区分，避免误连） */
export const MOCK_LLM_DEFAULT_PORT = 11435;

export interface MockToolCall {
  name: string;
  /** 结构化参数（会被 JSON.stringify 后分片发出） */
  args?: unknown;
  /** 直接给出 arguments 原文，用于构造「损坏 JSON」等非法调用 */
  raw?: string;
  /**
   * 从**最近一次 snapshot 结果**里按元素文案解析 `index`，再并入 args。
   * 为什么需要：元素 index 取决于真实页面快照顺序，脚本无法硬编码；
   * 用「按文案选目标」才能写出稳定用例（也是压测闸门层的唯一现实办法）。
   */
  pick?: { labelIncludes: string; occurrence?: number };
}

export type MockStep =
  /** 计划调用：返回 JSON 计划文本（无 tools 时使用） */
  | { type: 'plan'; steps?: string[]; notes?: string; delayMs?: number }
  /** tool 环：返回一批 tool_calls */
  | { type: 'tools'; calls: MockToolCall[]; delayMs?: number }
  /** 纯文本回答（不含 tool_calls），用于 NET-05「模型不支持 tools」 */
  | { type: 'text'; content?: string; delayMs?: number }
  /** HTTP 错误，用于 NET-04 */
  | { type: 'http_error'; status: number; body?: string; delayMs?: number }
  /** 直接掐断连接（ECONNRESET），用于 NET-04 */
  | { type: 'reset'; delayMs?: number }
  /** 一直不响应，直到测试停止（用于 LIFE-01「规划中停止」） */
  | { type: 'hang' };

export interface RecordedRequest {
  path: string;
  /** 是否带 tools（决定走计划还是 tool 环） */
  hasTools: boolean;
  model: string;
  body: unknown;
}

export interface MockLlm {
  readonly port: number;
  /** 形如 `http://127.0.0.1:11435/v1`，直接填进 BYOK Base URL */
  readonly baseUrl: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** 重置脚本与请求记录（每个用例开始前调用） */
  reset(script: MockStep[]): void;
  /** 已记录的请求（用于断言轮次 / 域名 / 是否泄露 Key） */
  requests(): RecordedRequest[];
  /** 已消费的脚本步数（用于断言「模型被调用了几轮」） */
  cursor(): number;
}

const DEFAULT_PLAN_STEPS = ['观察页面可交互元素', '按目标操作页面', '汇报结果'];

function sseFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function chunkBase(model: string) {
  return {
    id: `mock-${Math.random().toString(36).slice(2)}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
  };
}

/** 便捷构造「计划」步骤（脚本里最常用的一项） */
export function mockPlan(steps: string[], notes?: string): MockStep {
  return { type: 'plan', steps, ...(notes ? { notes } : {}) };
}

/** 便捷构造「一批 tool_calls」步骤 */
export function mockTools(calls: MockToolCall[]): MockStep {
  return { type: 'tools', calls };
}

export function createMockLlm(options: { port?: number } = {}): MockLlm {
  const port = options.port ?? Number(process.env.DM_MOCK_LLM_PORT ?? MOCK_LLM_DEFAULT_PORT);
  const baseUrl = `http://127.0.0.1:${port}/v1`;

  let script: MockStep[] = [{ type: 'plan', steps: DEFAULT_PLAN_STEPS }];
  let cursor = 0;
  const recorded: RecordedRequest[] = [];
  /** 被 `hang` 挂起的响应，stop 时统一销毁，避免测试卡死 */
  const pending = new Set<ServerResponse>();
  let server: Server | null = null;

  const nextStep = (): MockStep => {
    if (cursor >= script.length) {
      // 脚本用尽后重复最后一步：便于「多轮 finish」等无需逐轮脚本的场景
      return script[script.length - 1] ?? { type: 'text', content: 'done' };
    }
    // noUncheckedIndexedAccess 下取值为 `MockStep | undefined`，上面已保证下标合法
    const step = script[cursor] ?? { type: 'text', content: 'done' };
    cursor += 1;
    return step;
  };

  const writeSseHeaders = (res: ServerResponse) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      // 扩展 SW 有 <all_urls> 主机权限，理论上不受 CORS 影响；仍放开以便直连调试
      'Access-Control-Allow-Origin': '*',
    });
  };

  const respondPlan = (res: ServerResponse, model: string, step: Extract<MockStep, { type: 'plan' }>) => {
    writeSseHeaders(res);
    const payload = JSON.stringify({
      steps: step.steps ?? DEFAULT_PLAN_STEPS,
      ...(step.notes ? { notes: step.notes } : {}),
    });
    res.write(sseFrame({ ...chunkBase(model), choices: [{ index: 0, delta: { role: 'assistant', content: payload }, finish_reason: null }] }));
    res.write(sseFrame({ ...chunkBase(model), choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }));
    res.write('data: [DONE]\n\n');
    res.end();
  };

  const respondText = (res: ServerResponse, model: string, content: string) => {
    writeSseHeaders(res);
    res.write(sseFrame({ ...chunkBase(model), choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] }));
    res.write(sseFrame({ ...chunkBase(model), choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }));
    res.write('data: [DONE]\n\n');
    res.end();
  };

  const respondToolCalls = (res: ServerResponse, model: string, calls: MockToolCall[], body: Record<string, unknown>) => {
    writeSseHeaders(res);
    calls.forEach((call, i) => {
      // 参数统一收敛成对象：pick 解析出的 index 会并入其中
      let argsObject: Record<string, unknown> =
        typeof call.args === 'object' && call.args !== null
          ? { ...(call.args as Record<string, unknown>) }
          : {};
      if (call.pick) {
        // 解析失败时给 -1：让工具参数校验明确报错，而不是静默点错元素
        argsObject = { ...argsObject, index: resolvePickIndex(body, call.pick) ?? -1 };
      }
      const args = call.raw ?? JSON.stringify(argsObject);
      // 第一帧：id + name（arguments 为空）—— 模拟真实流式的分片
      res.write(
        sseFrame({
          ...chunkBase(model),
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  { index: i, id: `call_${cursor}_${i}`, type: 'function', function: { name: call.name, arguments: '' } },
                ],
              },
              finish_reason: null,
            },
          ],
        }),
      );
      // 第二帧：arguments 主体（跨帧拼接由 ToolCallAccumulator 处理）
      res.write(
        sseFrame({
          ...chunkBase(model),
          choices: [
            {
              index: 0,
              delta: { tool_calls: [{ index: i, function: { arguments: args } }] },
              finish_reason: null,
            },
          ],
        }),
      );
    });
    res.write(sseFrame({ ...chunkBase(model), choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }));
    res.write('data: [DONE]\n\n');
    res.end();
  };

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * 从请求体的 `role: 'tool'` 消息里回溯最近一次 snapshot，按元素文案找 index。
   * snapshot 的 tool 结果形如 `{"ok":true,"data":{"elements":[{"index":0,"name":"…"}]}}`。
   */
  const resolvePickIndex = (
    body: Record<string, unknown>,
    pick: NonNullable<MockToolCall['pick']>,
  ): number | null => {
    const messages = Array.isArray(body.messages) ? (body.messages as Array<{ role?: string; content?: unknown }>) : [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (!m || m.role !== 'tool') continue;
      try {
        const parsed = JSON.parse(String(m.content ?? '')) as {
          data?: { elements?: Array<{ index?: number; name?: string }> };
        };
        const els = parsed?.data?.elements;
        if (!Array.isArray(els)) continue;
        const hits = els.filter(
          (e) => typeof e.index === 'number' && (e.name ?? '').includes(pick.labelIncludes),
        );
        const target = hits[pick.occurrence ?? 0];
        return target ? (target.index as number) : null;
      } catch {
        /* 非法 JSON 的 tool 消息：继续往更早找 */
      }
    }
    return null;
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
      res.end();
      return;
    }

    // 模型列表（Registry / Provider 探测用）
    if (req.method === 'GET' && url.endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ data: [{ id: 'mock-tools' }] }));
      return;
    }

    if (req.method !== 'POST' || !url.includes('/chat/completions')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `mock 未实现：${req.method} ${url}` } }));
      return;
    }

    const raw = await new Promise<string>((resolve) => {
      let data = '';
      req.setEncoding('utf8');
      req.on('data', (c) => {
        data += c;
      });
      req.on('end', () => resolve(data));
    });

    let body: Record<string, unknown> = {};
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      /* 保留空 body */
    }
    const hasTools = Array.isArray(body.tools) && (body.tools as unknown[]).length > 0;
    const model = typeof body.model === 'string' ? body.model : 'unknown';
    recorded.push({ path: url, hasTools, model, body });

    const step = nextStep();
    if ('delayMs' in step && typeof step.delayMs === 'number') await delay(step.delayMs);

    switch (step.type) {
      case 'plan':
        respondPlan(res, model, step);
        return;
      case 'text':
        respondText(res, model, step.content ?? '（mock 纯文本，不含 tool_calls）');
        return;
      case 'tools':
        respondToolCalls(res, model, step.calls, body);
        return;
      case 'http_error': {
        // 刻意在 body 里塞入假 Key 与内网地址：用于断言 PRIV-06「响应体不外显」
        const errorBody =
          step.body ??
          JSON.stringify({
            error: { message: 'sk-MOCK-LEAK-SHOULD-NOT-APPEAR', internal: '10.0.0.1' },
            detail: 'mock error body',
          });
        res.writeHead(step.status, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(errorBody);
        return;
      }
      case 'reset':
        res.socket?.destroy();
        return;
      case 'hang':
        pending.add(res);
        res.on('close', () => pending.delete(res));
        return;
      default: {
        // 穷尽性保护：新增 step 类型时此处会编译报错
        const never: never = step;
        res.writeHead(500).end(JSON.stringify({ error: { message: `未知 mock 步骤 ${String(never)}` } }));
      }
    }
  };

  return {
    port,
    baseUrl,
    async start() {
      if (server) return;
      // 端口可能被上一批用例的残留实例占用：短重试，避免整套 E2E 因端口抖动变红
      const deadline = Date.now() + 5_000;
      for (;;) {
        const s = createServer((req, res) => {
          void handle(req, res);
        });
        try {
          await new Promise<void>((resolve, reject) => {
            const onError = (err: NodeJS.ErrnoException) => {
              s.off('listening', onListening);
              reject(err);
            };
            const onListening = () => {
              s.off('error', onError);
              resolve();
            };
            s.once('error', onError);
            s.once('listening', onListening);
            s.listen(port, '127.0.0.1');
          });
          server = s;
          return;
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          // 未成功 listen 的 server：直接 close() 会以 'error' 事件抛出 ERR_SERVER_NOT_RUNNING
          // （无监听者时 Node 会 throw）。先摘掉/补一个空 error 监听再关，避免测试进程崩溃。
          s.removeAllListeners('error');
          s.on('error', () => {
            /* 关闭未监听 server 的预期错误 */
          });
          s.close();
          if (code === 'EADDRINUSE' && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            continue;
          }
          throw new Error(
            `mock LLM 无法监听 127.0.0.1:${port}（${code ?? String(err)}）。` +
              `请确认没有残留的 mock 进程：lsof -i :${port}`,
          );
        }
      }
    },
    async stop() {
      for (const res of pending) res.socket?.destroy();
      pending.clear();
      const s = server;
      server = null;
      if (!s) return;
      // 先掐掉 keep-alive / 挂起连接，否则 close() 会一直等连接自然结束
      s.closeAllConnections?.();
      await new Promise<void>((resolve) => s.close(() => resolve()));
    },
    reset(next) {
      script = next;
      cursor = 0;
      recorded.length = 0;
    },
    requests: () => recorded.slice(),
    cursor: () => cursor,
  };
}
