import { AppError, formatErrorForUi, normalizeError } from '@/shared/errors';
import type { TranslateResult } from '@/features/translate/types';
import {
  TRANSLATE_PORT,
  type TranslatePortClientMessage,
  type TranslatePortServerMessage,
} from './protocol';

export interface StreamTranslateOptions {
  text: string;
  targetLanguage?: string;
  /** 每收到一段增量时回调（accumulated 为当前全文） */
  onChunk?: (accumulated: string, delta: string) => void;
  signal?: AbortSignal;
}

/**
 * 通过 Port 流式翻译；支持 AbortSignal 取消
 * Content / Side Panel 使用；Background 不调用
 */
export function streamTranslate(
  options: StreamTranslateOptions,
): Promise<TranslateResult> {
  return new Promise((resolve, reject) => {
    const port = browser.runtime.connect({ name: TRANSLATE_PORT });
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
      const msg: TranslatePortClientMessage = { type: 'abort' };
      try {
        port.postMessage(msg);
      } catch {
        /* ignore */
      }
    };

    options.signal?.addEventListener('abort', onAbort);

    port.onMessage.addListener((raw: unknown) => {
      const message = raw as TranslatePortServerMessage;
      if (message.type === 'chunk') {
        options.onChunk?.(message.accumulated, message.text);
        return;
      }
      if (message.type === 'done') {
        settle(() => resolve(message.result));
        return;
      }
      if (message.type === 'error') {
        settle(() =>
          reject(
            new AppError(
              message.message || formatErrorForUi(message),
              (message.code as AppError['code']) || 'UNKNOWN',
            ),
          ),
        );
      }
    });

    port.onDisconnect.addListener(() => {
      if (settled) return;
      const err = browser.runtime.lastError;
      settle(() =>
        reject(
          normalizeError(
            err?.message
              ? new Error(err.message)
              : new AppError('连接已断开', 'UNKNOWN'),
          ),
        ),
      );
    });

    const start: TranslatePortClientMessage = {
      type: 'start',
      text: options.text,
      targetLanguage: options.targetLanguage,
    };
    port.postMessage(start);
  });
}
