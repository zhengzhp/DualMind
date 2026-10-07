import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentPortServerMessage } from '@/shared/messaging/protocol';

const { port, listeners } = vi.hoisted(() => {
  const listeners = {
    message: (_message: unknown) => {},
    disconnect: () => {},
  };
  return {
    listeners,
    port: {
      postMessage: vi.fn(), disconnect: vi.fn(),
      onMessage: { addListener: (listener: (message: unknown) => void) => { listeners.message = listener; } },
      onDisconnect: { addListener: (listener: () => void) => { listeners.disconnect = listener; } },
    },
  };
});
vi.mock('wxt/browser', () => ({ browser: { runtime: { connect: () => port } } }));

import { startAgentTask } from './client';

beforeEach(() => vi.clearAllMocks());

describe('Agent Port 迟到消息', () => {
  it('取消后丢弃同任务迟到消息，也丢弃其他任务消息', () => {
    const onMessage = vi.fn();
    const task = startAgentTask({ goal: '填写姓名', onMessage });
    listeners.message({ type: 'phase', taskId: 'other', phase: 'running' });
    expect(onMessage).not.toHaveBeenCalled();
    task.abort();
    listeners.message({ type: 'phase', taskId: task.taskId, phase: 'running' });
    listeners.disconnect();
    task.approvePlan();
    expect(onMessage).not.toHaveBeenCalled();
    expect(port.postMessage.mock.calls.map(([message]) => message.type)).toEqual(['start', 'abort']);
    expect(port.disconnect).toHaveBeenCalledTimes(1);
  });

  it('终态后不再接收消息，绑定页正常转发', () => {
    const messages: AgentPortServerMessage[] = [];
    const task = startAgentTask({ goal: '目标', onMessage: (message) => messages.push(message) });
    listeners.message({ type: 'bound_page', taskId: task.taskId, url: 'https://example.com/', title: '实际页面' });
    listeners.message({ type: 'done', taskId: task.taskId, summary: '完成', success: true });
    listeners.message({ type: 'error', taskId: task.taskId, code: 'UNKNOWN', message: '迟到错误' });
    expect(messages.map((message) => message.type)).toEqual(['bound_page', 'done']);
  });
});
