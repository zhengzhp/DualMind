/**
 * 沉浸式翻译 Port 客户端（Content 侧）。
 *
 * 每次 `translateBatch` 分配独立 requestId，因此可以并发多批；
 * abort 通过同一 Port 通知 Background 取消对应的模型请求。
 */
import { browser } from 'wxt/browser';
import {
  AppError,
  formatErrorForUi,
  normalizeError,
  toUserMessage,
  type ErrorCode,
} from '@/shared/errors';
import {
  IMMERSIVE_PORT,
  type ImmersivePortClientMessage,
  type ImmersivePortServerMessage,
} from '@/shared/messaging/protocol';
import type { ImmersiveSegment, ImmersiveSegmentResult } from './types';

export interface ImmersiveClient {
  translateBatch(
    segments: ImmersiveSegment[],
    targetLanguage: string,
    signal?: AbortSignal,
  ): Promise<ImmersiveSegmentResult[]>;
  dispose(): void;
}

interface PendingRequest {
  resolve: (results: ImmersiveSegmentResult[]) => void;
  reject: (err: unknown) => void;
  cleanup: () => void;
  settled: boolean;
}

export function createImmersiveClient(): ImmersiveClient {
  const port = browser.runtime.connect({ name: IMMERSIVE_PORT });
  const pending = new Map<string, PendingRequest>();
  let seq = 0;

  /** 统一的落定入口：保证 cleanup 只跑一次、Promise 只 settle 一次 */
  const settle = (
    requestId: string,
    action: (request: PendingRequest) => void,
  ) => {
    const request = pending.get(requestId);
    if (!request || request.settled) return;
    request.settled = true;
    pending.delete(requestId);
    request.cleanup();
    action(request);
  };

  port.onMessage.addListener((raw: unknown) => {
    const message = raw as ImmersivePortServerMessage;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'batch-done') {
      settle(message.requestId, (request) => request.resolve(message.results));
      return;
    }
    if (message.type === 'batch-error') {
      settle(message.requestId, (request) =>
        request.reject(
          new AppError(
            message.message || formatErrorForUi(new AppError('', 'UNKNOWN')),
            (message.code as ErrorCode) || 'UNKNOWN',
          ),
        ),
      );
    }
  });

  port.onDisconnect.addListener(() => {
    const disconnectedError = normalizeError(
      new AppError('连接已断开，请刷新页面后重试', 'UNKNOWN'),
    );
    for (const requestId of Array.from(pending.keys())) {
      settle(requestId, (request) => request.reject(disconnectedError));
    }
  });

  return {
    translateBatch(segments, targetLanguage, signal) {
      const requestId = `dmimm-${Date.now().toString(36)}-${seq + 1}`;
      seq += 1;

      return new Promise<ImmersiveSegmentResult[]>((resolve, reject) => {
        const onAbort = () => {
          const abortMessage: ImmersivePortClientMessage = {
            type: 'abort',
            requestId,
          };
          try {
            port.postMessage(abortMessage);
          } catch {
            /* Port 已断开：settle 会走 onDisconnect 分支 */
          }
          settle(requestId, (request) =>
            request.reject(new AppError(toUserMessage('ABORTED'), 'ABORTED')),
          );
        };
        const cleanup = () => signal?.removeEventListener('abort', onAbort);

        pending.set(requestId, { resolve, reject, cleanup, settled: false });

        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener('abort', onAbort, { once: true });

        const start: ImmersivePortClientMessage = {
          type: 'translate-batch',
          requestId,
          segments,
          targetLanguage,
        };
        try {
          port.postMessage(start);
        } catch (err) {
          settle(requestId, (request) => request.reject(err));
        }
      });
    },

    dispose() {
      try {
        port.disconnect();
      } catch {
        /* 已断开则忽略 */
      }
      pending.clear();
    },
  };
}
