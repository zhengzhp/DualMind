/**
 * 聊天 Port 客户端（Side Panel / 全页工作台侧）。
 *
 * 每次提问建立独立 Port 与 requestId：协议允许多请求并发，abort 只影响自己那条。
 * 主动取消时本地立即落定（不再等 Background 回包），避免「停止」按钮有延迟。
 */
import { browser } from 'wxt/browser';
import {
  AppError,
  normalizeError,
  toUserMessage,
  type ErrorCode,
} from '@/shared/errors';
import {
  CHAT_PORT,
  type ChatPortClientMessage,
  type ChatPortServerMessage,
} from '@/shared/messaging/protocol';
import type { ChatTurn } from '@/shared/storage/types';
import type { ChatContextPayload } from './types';

/** 进程内自增，保证同一时刻的 requestId 唯一 */
let seq = 0;

export interface StreamChatOptions {
  /** 页面上下文；null 表示无上下文（退化为纯对话） */
  context: ChatContextPayload | null;
  /** 历史消息（不含本次提问） */
  history: ChatTurn[];
  question: string;
  /** 每收到一段增量回调（accumulated 为当前全文） */
  onChunk?: (accumulated: string, delta: string) => void;
  signal?: AbortSignal;
}

/** 流式问答：resolve 为最终全文；取消时以 ABORTED reject */
export function streamChat(options: StreamChatOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const port = browser.runtime.connect({ name: CHAT_PORT });
    seq += 1;
    const requestId = `dmchat-${Date.now().toString(36)}-${seq}`;
    let settled = false;

    const cleanup = () => {
      options.signal?.removeEventListener('abort', onAbort);
      try {
        port.disconnect();
      } catch {
        /* ignore */
      }
    };

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onAbort = () => {
      const message: ChatPortClientMessage = { type: 'abort', requestId };
      try {
        port.postMessage(message);
      } catch {
        /* Port 已断开：走 onDisconnect 分支 */
      }
      settle(() => reject(new AppError(toUserMessage('ABORTED'), 'ABORTED')));
    };

    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) {
      onAbort();
      return;
    }

    port.onMessage.addListener((raw: unknown) => {
      const message = raw as ChatPortServerMessage;
      if (!message || typeof message !== 'object') return;
      // 同一 Port 上可能有其他 requestId 的回包，按 id 过滤
      if (message.requestId !== requestId) return;

      if (message.type === 'chunk') {
        options.onChunk?.(message.accumulated, message.text);
        return;
      }
      if (message.type === 'done') {
        settle(() => resolve(message.content));
        return;
      }
      if (message.type === 'error') {
        settle(() =>
          reject(
            new AppError(
              message.message || toUserMessage('UNKNOWN'),
              (message.code as ErrorCode) || 'UNKNOWN',
            ),
          ),
        );
      }
    });

    port.onDisconnect.addListener(() => {
      if (settled) return;
      const lastError = browser.runtime.lastError?.message;
      settle(() =>
        reject(
          lastError
            ? normalizeError(new Error(lastError))
            : new AppError('连接已断开，请重试', 'UNKNOWN'),
        ),
      );
    });

    const start: ChatPortClientMessage = {
      type: 'start',
      requestId,
      context: options.context,
      history: options.history,
      question: options.question,
    };
    try {
      port.postMessage(start);
    } catch (err) {
      settle(() => reject(err));
    }
  });
}
