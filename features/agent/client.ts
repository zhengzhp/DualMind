/**
 * Agent Port 客户端（Side Panel / 全页工作台）
 * 单任务单 Port：计划批准与危险确认走同一连接。
 */
import { browser } from 'wxt/browser';
import {
  AppError,
  normalizeError,
  toUserMessage,
  type ErrorCode,
} from '@/shared/errors';
import {
  AGENT_PORT,
  type AgentPortClientMessage,
  type AgentPortServerMessage,
} from '@/shared/messaging/protocol';

let seq = 0;

export interface AgentTaskHandles {
  taskId: string;
  approvePlan: () => void;
  rejectPlan: () => void;
  confirmDanger: (stepId: string) => void;
  rejectDanger: (stepId: string) => void;
  abort: () => void;
}

export interface StartAgentTaskOptions {
  goal: string;
  onMessage: (msg: AgentPortServerMessage) => void;
  signal?: AbortSignal;
}

/**
 * 启动一次 Agent 任务并保持 Port，直到 done / error / abort / disconnect
 */
export function startAgentTask(
  options: StartAgentTaskOptions,
): AgentTaskHandles {
  const port = browser.runtime.connect({ name: AGENT_PORT });
  seq += 1;
  const taskId = `dmagent-${Date.now().toString(36)}-${seq}`;
  let settled = false;

  const post = (message: AgentPortClientMessage) => {
    try {
      port.postMessage(message);
    } catch {
      /* Port 已断开 */
    }
  };

  const cleanup = () => {
    options.signal?.removeEventListener('abort', onAbort);
    try {
      port.disconnect();
    } catch {
      /* ignore */
    }
  };

  const settle = () => {
    if (settled) return;
    settled = true;
    cleanup();
  };

  const onAbort = () => {
    post({ type: 'abort', taskId });
    settle();
  };

  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) {
    onAbort();
    return {
      taskId,
      approvePlan: () => {},
      rejectPlan: () => {},
      confirmDanger: () => {},
      rejectDanger: () => {},
      abort: () => {},
    };
  }

  port.onMessage.addListener((raw: unknown) => {
    const message = raw as AgentPortServerMessage;
    if (!message || typeof message !== 'object') return;
    if (!('taskId' in message) || message.taskId !== taskId) return;

    options.onMessage(message);

    if (
      message.type === 'done' ||
      message.type === 'error'
    ) {
      settle();
    }
  });

  port.onDisconnect.addListener(() => {
    if (settled) return;
    const lastError = browser.runtime.lastError?.message;
    options.onMessage({
      type: 'error',
      taskId,
      code: 'UNKNOWN',
      message: lastError
        ? normalizeError(new Error(lastError)).message
        : '连接已断开',
    });
    settle();
  });

  post({ type: 'start', taskId, goal: options.goal });

  return {
    taskId,
    approvePlan: () => post({ type: 'approve_plan', taskId }),
    rejectPlan: () => post({ type: 'reject_plan', taskId }),
    confirmDanger: (stepId) =>
      post({ type: 'confirm_danger', taskId, stepId }),
    rejectDanger: (stepId) =>
      post({ type: 'reject_danger', taskId, stepId }),
    abort: () => {
      post({ type: 'abort', taskId });
      settle();
    },
  };
}

/** 把 Port error 转成 AppError（UI 可选） */
export function agentErrorFromPort(
  code: string,
  message: string,
): AppError {
  return new AppError(
    message || toUserMessage('UNKNOWN'),
    (code as ErrorCode) || 'UNKNOWN',
  );
}
