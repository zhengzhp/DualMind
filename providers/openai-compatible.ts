import {
  errorCodeFromHttpStatus,
  ProviderError,
  toUserMessage,
} from '@/shared/errors';
import { parseOpenAIChatSSE } from './sse';
import type {
  ChatInput,
  ChatProvider,
  ChatResult,
  ProviderCapabilities,
} from './types';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * OpenAI 兼容 Provider（含各类中转 / DeepSeek / Groq 等）
 * 约定路径：POST {baseUrl}/chat/completions、GET {baseUrl}/models
 */
export class OpenAICompatibleProvider implements ChatProvider {
  readonly id = 'openai-compatible';
  readonly capabilities: ProviderCapabilities = { streaming: true };

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private headers(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey.trim()) {
      headers.Authorization = `Bearer ${this.apiKey.trim()}`;
    }
    return headers;
  }

  private assertConfigured() {
    if (!this.baseUrl.trim()) {
      throw new ProviderError(toUserMessage('NO_BASE_URL'), 'NO_BASE_URL');
    }
    if (!this.apiKey.trim()) {
      throw new ProviderError(toUserMessage('NO_API_KEY'), 'NO_API_KEY');
    }
  }

  async listModels(): Promise<string[]> {
    this.assertConfigured();
    const url = `${normalizeBaseUrl(this.baseUrl)}/models`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: this.headers(),
      });
    } catch {
      throw new ProviderError(toUserMessage('NETWORK'), 'NETWORK');
    }

    if (!res.ok) {
      const code = errorCodeFromHttpStatus(res.status);
      throw new ProviderError(
        toUserMessage(code === 'CHAT_FAILED' ? 'LIST_MODELS_FAILED' : code, `${res.status}`),
        code === 'CHAT_FAILED' ? 'LIST_MODELS_FAILED' : code,
      );
    }
    const data = (await res.json()) as {
      data?: Array<{ id: string }>;
    };
    return (data.data ?? []).map((m) => m.id).sort();
  }

  async chat(input: ChatInput): Promise<ChatResult> {
    let full = '';
    for await (const chunk of this.chatStream(input)) {
      full += chunk;
    }
    const content = full.trim();
    if (!content) {
      throw new ProviderError(toUserMessage('EMPTY_RESPONSE'), 'EMPTY_RESPONSE');
    }
    return { content };
  }

  async *chatStream(input: ChatInput): AsyncIterable<string> {
    this.assertConfigured();
    if (!input.model.trim()) {
      throw new ProviderError(toUserMessage('NO_MODEL'), 'NO_MODEL');
    }

    const url = `${normalizeBaseUrl(this.baseUrl)}/chat/completions`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: input.model,
          messages: input.messages,
          temperature: 0.2,
          stream: true,
        }),
        signal: input.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ProviderError(toUserMessage('ABORTED'), 'ABORTED');
      }
      throw new ProviderError(toUserMessage('NETWORK'), 'NETWORK');
    }

    if (!res.ok) {
      await res.text().catch(() => '');
      const code = errorCodeFromHttpStatus(res.status);
      throw new ProviderError(
        toUserMessage(code, res.status === 404 ? input.model : `${res.status}`),
        code,
      );
    }

    let any = false;
    for await (const delta of parseOpenAIChatSSE(res, input.signal)) {
      any = true;
      yield delta;
    }
    if (!any) {
      throw new ProviderError(toUserMessage('EMPTY_RESPONSE'), 'EMPTY_RESPONSE');
    }
  }

  async testConnection() {
    try {
      if (!this.baseUrl.trim()) {
        return { ok: false as const, error: toUserMessage('NO_BASE_URL'), code: 'NO_BASE_URL' as const };
      }
      if (!this.apiKey.trim()) {
        return { ok: false as const, error: toUserMessage('NO_API_KEY'), code: 'NO_API_KEY' as const };
      }
      const models = await this.listModels();
      return {
        ok: true as const,
        detail: `已连接，可用模型 ${models.length} 个`,
      };
    } catch (err) {
      if (err instanceof ProviderError) {
        return { ok: false as const, error: err.message, code: err.code };
      }
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
        code: 'UNKNOWN' as const,
      };
    }
  }
}
