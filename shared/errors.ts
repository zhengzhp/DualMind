/** DualMind 统一错误码（UI 只映射文案，不直接展示原始堆栈） */
export type ErrorCode =
  | 'EMPTY_TEXT'
  | 'NO_API_KEY'
  | 'NO_BASE_URL'
  | 'NO_HOST'
  | 'NO_MODEL'
  | 'UNAUTHORIZED'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'OLLAMA_UNREACHABLE'
  | 'MODEL_NOT_FOUND'
  | 'EMPTY_RESPONSE'
  | 'ABORTED'
  | 'CHAT_FAILED'
  | 'LIST_MODELS_FAILED'
  /** 模型未返回任何工具调用，判定为不支持 tool calling（Agent 专用） */
  | 'TOOLS_UNSUPPORTED'
  | 'UNKNOWN';

/** 带错误码的应用错误 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Provider 层错误（与 AppError 兼容，code 同源） */
export class ProviderError extends AppError {
  constructor(message: string, code: ErrorCode = 'UNKNOWN') {
    super(message, code);
    this.name = 'ProviderError';
  }
}

/**
 * 「业务可展示」错误：message **已经是我们写给用户的文案**，
 * 允许 `formatErrorForUi` 直接展示（区别于 UNKNOWN 的统一兜底）。
 *
 * 为什么需要：Background 里大量**可预期**的拒绝（站点已停用、本页已有 Agent 任务等）
 * 过去以普通 `Error` 抛出，经 `normalizeError` 归为 `UNKNOWN` 后 message 被丢弃，
 * 用户只看到「出错了，请稍后重试」，无从判断原因（缺陷 DM-V3-004）。
 *
 * ⚠️ 只允许包装**本项目自己的**用户文案；**绝不能**包装 Provider 原始响应体
 * 或任何可能含凭据 / 内网信息的文本（PRIV-06 边界）。
 */
export class UserFacingError extends AppError {
  constructor(message: string) {
    super(message, 'UNKNOWN');
    this.name = 'UserFacingError';
  }
}

/** 面向用户的固定文案；detail 仅作补充（不暴露 Key） */
const USER_MESSAGES: Record<ErrorCode, string> = {
  EMPTY_TEXT: '没有可翻译的文本',
  NO_API_KEY: '请先在设置中填写 API Key',
  NO_BASE_URL: '请先在设置中填写 Base URL',
  NO_HOST: '请先在设置中填写 Ollama Host',
  NO_MODEL: '请先在设置中选择或填写模型',
  UNAUTHORIZED: '鉴权失败，请检查 API Key 是否正确',
  RATE_LIMIT: '请求过于频繁，请稍后再试',
  TIMEOUT: '请求超时，请稍后重试',
  NETWORK: '网络连接失败，请检查网络或 Base URL',
  OLLAMA_UNREACHABLE:
    '无法连接 Ollama。请确认已启动（默认端口 11434），并检查 Host 配置',
  MODEL_NOT_FOUND: '模型不存在或未拉取，请在设置中刷新列表或执行 ollama pull',
  EMPTY_RESPONSE: '模型返回空内容，请换模型或重试',
  ABORTED: '已取消',
  CHAT_FAILED: '模型请求失败，请检查 Provider 设置后重试',
  LIST_MODELS_FAILED: '拉取模型列表失败，请检查连接配置',
  TOOLS_UNSUPPORTED:
    '当前模型未返回任何工具调用，可能不支持 tool calling。请在设置中换用支持 tools 的模型后重试。',
  UNKNOWN: '出错了，请稍后重试',
};

/** 将错误码转为用户可读文案 */
export function toUserMessage(code: ErrorCode, detail?: string): string {
  const base = USER_MESSAGES[code] ?? USER_MESSAGES.UNKNOWN;
  if (!detail || code === 'ABORTED') return base;
  // 仅对部分码附加短 detail（已由调用方脱敏）
  if (
    code === 'CHAT_FAILED' ||
    code === 'LIST_MODELS_FAILED' ||
    code === 'MODEL_NOT_FOUND'
  ) {
    return `${base}（${detail}）`;
  }
  return base;
}

/** 根据 HTTP 状态推断错误码 */
export function errorCodeFromHttpStatus(status: number): ErrorCode {
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status === 429) return 'RATE_LIMIT';
  if (status === 408 || status === 504) return 'TIMEOUT';
  return 'CHAT_FAILED';
}

/** 规范化任意抛出值为 AppError */
export function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof DOMException && err.name === 'AbortError') {
    return new AppError(toUserMessage('ABORTED'), 'ABORTED');
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return new AppError(toUserMessage('ABORTED'), 'ABORTED');
  }

  // fetch 网络失败
  if (err instanceof TypeError) {
    return new AppError(toUserMessage('NETWORK'), 'NETWORK');
  }

  if (err instanceof Error) {
    return new AppError(err.message || toUserMessage('UNKNOWN'), 'UNKNOWN');
  }

  return new AppError(toUserMessage('UNKNOWN'), 'UNKNOWN');
}

/** UI 展示用：统一取可读文案 */
export function formatErrorForUi(err: unknown): string {
  const normalized = normalizeError(err);
  // 显式标记的业务文案：直接展示（见 UserFacingError 注释；不含任何 Provider 原始内容）
  if (normalized instanceof UserFacingError) {
    return normalized.message;
  }
  // 若 message 已是用户文案则直接用；否则按 code 映射
  if (normalized.message && normalized.code !== 'UNKNOWN') {
    return normalized.message;
  }
  return toUserMessage(normalized.code, normalized.message);
}
