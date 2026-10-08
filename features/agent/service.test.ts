import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolCall } from '@/providers/types';
import type { AgentPortServerMessage } from '@/shared/messaging/protocol';
import type { AgentToolResult, SnapshotPayload } from './types';

const { runChat, runChatWithTools } = vi.hoisted(() => ({
  runChat: vi.fn(), runChatWithTools: vi.fn(),
}));
vi.mock('@/shared/llm/run', () => ({ runChat, runChatWithTools }));

import { runAgentTask, TOOL_TIMEOUT_MS, type RunAgentTaskOptions } from './service';
import { MAX_WAIT_MS } from './tools';

function call(name: string, args: Record<string, unknown> = {}): ToolCall {
  return { id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

function options(patch: Partial<RunAgentTaskOptions> = {}): RunAgentTaskOptions {
  return {
    taskId: 'task', goal: '填写姓名', pageUrl: 'https://example.com/form', pageTitle: '表单',
    maxSteps: 3, signal: new AbortController().signal,
    gate: { waitPlanApproval: async () => 'approved', waitDangerConfirm: async () => 'confirmed' },
    post: vi.fn(),
    executeTool: vi.fn(
      async (): Promise<AgentToolResult> => ({ ok: true, tool: 'finish', summary: '完成', data: { success: true } }),
    ),
    ...patch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  runChat.mockResolvedValue({ content: '{"steps":["观察页面","填写姓名"]}' });
  runChatWithTools.mockReset();
  runChatWithTools.mockResolvedValue({ content: '', tool_calls: [call('finish', { summary: '完成' })] });
});
afterEach(() => vi.useRealTimers());

describe('runAgentTask 安全编排', () => {
  it('拒绝计划不调用工具模型或执行器', async () => {
    const task = options({ gate: { waitPlanApproval: async () => 'rejected', waitDangerConfirm: async () => 'confirmed' } });
    await runAgentTask(task);
    expect(runChatWithTools).not.toHaveBeenCalled();
    expect(task.executeTool).not.toHaveBeenCalled();
    expect(task.post).toHaveBeenCalledWith(expect.objectContaining({ type: 'done', success: false }));
  });

  it('快照与本次危险确认一同传给执行器', async () => {
    const snapshot: SnapshotPayload = {
      snapshotId: 'snapshot', url: 'https://example.com/form', title: '表单', truncated: false, totalCandidates: 1,
      elements: [{ index: 0, tag: 'button', inputType: 'button', name: '删除草稿' }],
    };
    runChatWithTools.mockResolvedValueOnce({ tool_calls: [call('snapshot')] });
    runChatWithTools.mockResolvedValueOnce({ tool_calls: [call('click', { index: 0 }), call('finish', { summary: '完成' })] });
    const executeTool = vi.fn(async (tool: string): Promise<AgentToolResult> => ({
      ok: true, tool: tool as AgentToolResult['tool'], summary: '结果', data: tool === 'snapshot' ? snapshot : { success: true },
    }));
    await runAgentTask(options({ executeTool }));
    expect(executeTool).toHaveBeenCalledWith('click', { index: 0 }, {
      snapshotId: 'snapshot', expectedElement: snapshot.elements[0], dangerConfirmed: true,
    });
  });

  it('支付拒绝不进入确认，拒绝普通危险动作不执行', async () => {
    const waitDangerConfirm = vi.fn(async () => 'rejected' as const);
    const executeTool = vi.fn(async (tool: string): Promise<AgentToolResult> => ({
      ok: true, tool: tool as AgentToolResult['tool'], summary: '结果', data: tool === 'snapshot' ? {
        snapshotId: 'snapshot', url: 'https://example.com/form', elements: [
          { index: 0, tag: 'button', name: '立即支付' }, { index: 1, tag: 'button', name: '删除草稿' },
        ],
      } : { success: true },
    }));
    runChatWithTools.mockResolvedValueOnce({ tool_calls: [call('snapshot')] });
    runChatWithTools.mockResolvedValueOnce({ tool_calls: [call('click', { index: 0 }), call('click', { index: 1 }), call('finish', { summary: '结束' })] });
    await runAgentTask(options({ executeTool, gate: { waitPlanApproval: async () => 'approved', waitDangerConfirm } }));
    expect(waitDangerConfirm).toHaveBeenCalledTimes(1);
    expect(executeTool.mock.calls.map(([tool]) => tool)).toEqual(['snapshot', 'finish']);
  });

  it('确认期间取消不执行后续动作', async () => {
    const controller = new AbortController();
    const task = options({ signal: controller.signal, gate: {
      waitPlanApproval: async () => 'approved',
      waitDangerConfirm: async () => { controller.abort(); return 'aborted'; },
    } });
    runChatWithTools.mockResolvedValueOnce({ tool_calls: [call('click', { index: 0 })] });
    await expect(runAgentTask(task)).rejects.toMatchObject({ code: 'ABORTED' });
    expect(task.executeTool).not.toHaveBeenCalled();
  });

  it('工具超时终止整个任务，不尝试同批次下一个动作', async () => {
    vi.useFakeTimers();
    runChatWithTools.mockResolvedValueOnce({ tool_calls: [call('wait', { ms: 1000 }), call('finish', { summary: '完成' })] });
    const task = options({ executeTool: vi.fn(() => new Promise<AgentToolResult>(() => {})) });
    const rejected = expect(runAgentTask(task)).rejects.toThrow(/超时/);
    await vi.advanceTimersByTimeAsync(TOOL_TIMEOUT_MS + 1);
    await rejected;
    expect(task.executeTool).toHaveBeenCalledTimes(1);
  });

  it('内容页致命错误终止任务', async () => {
    await expect(runAgentTask(options({ executeTool: async () => ({ ok: false, fatal: true, tool: 'finish', summary: '页面已变化' }) }))).rejects.toThrow(/变化/);
  });

  it('达到轮数上限报告未完成', async () => {
    // 一直调用工具但从不 finish：耗尽轮数后应报告未完成
    runChatWithTools.mockResolvedValue({ content: '', tool_calls: [call('snapshot')] });
    const messages: AgentPortServerMessage[] = [];
    await runAgentTask(options({ maxSteps: 2, post: (message) => messages.push(message) }));
    expect(messages.at(-1)).toMatchObject({ type: 'done', success: false, summary: expect.stringContaining('最大步数') });
  });

  it('连续两轮零 tool_calls 判定为不支持 tools，明确失败不再催促', async () => {
    // 模型只回文本、不调工具：应第二次即失败，而不是反复催促到轮数上限
    runChatWithTools.mockResolvedValue({ content: '我不知道该怎么做', tool_calls: [] });
    await expect(runAgentTask(options({ maxSteps: 5 }))).rejects.toMatchObject({ code: 'TOOLS_UNSUPPORTED' });
    expect(runChatWithTools).toHaveBeenCalledTimes(2);
  });
});

describe('工具预算不变量', () => {
  it('单次 wait 上限必须小于工具级超时，留出自报超时的余量', () => {
    // 回归 DM-V3-002：两者相等时，默认的 text 等待会跑满预算被 deadline 抢先取消，
    // 返回 fatal 并丢成 UNKNOWN 兜底文案，runWait 自身的超时结果永远不可达。
    expect(MAX_WAIT_MS).toBeLessThan(TOOL_TIMEOUT_MS);
    // 余量需覆盖 runWait 的轮询粒度（200ms）与消息往返，过小同样会踩线
    expect(TOOL_TIMEOUT_MS - MAX_WAIT_MS).toBeGreaterThanOrEqual(2000);
  });
});
