import type { MessageType, ProtocolMap } from './protocol';

interface Envelope<T extends MessageType> {
  type: T;
  data: ProtocolMap[T]['data'];
}

interface SuccessResponse<T> {
  ok: true;
  data: T;
}

interface ErrorResponse {
  ok: false;
  error: string;
}

type ResponseBody<T extends MessageType> =
  | SuccessResponse<ProtocolMap[T]['return']>
  | ErrorResponse;

/**
 * 向 Background 发送类型安全消息
 * 在 Content / Side Panel / Options 中使用
 */
export async function sendMessage<T extends MessageType>(
  type: T,
  data: ProtocolMap[T]['data'],
): Promise<ProtocolMap[T]['return']> {
  const response = (await browser.runtime.sendMessage({
    type,
    data,
  } satisfies Envelope<T>)) as ResponseBody<T> | undefined;

  if (!response) {
    throw new Error('扩展后台无响应，请刷新页面后重试');
  }
  if (!response.ok) {
    throw new Error(response.error || '请求失败');
  }
  return response.data;
}

/** Background 侧包装成功/失败响应 */
export function ok<T>(data: T): SuccessResponse<T> {
  return { ok: true, data };
}

export function fail(error: unknown): ErrorResponse {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}
