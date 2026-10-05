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

function normalizeHost(host: string): string {
  return host.replace(/\/+$/, '');
}

/**
 * Ollama Provider
 * - 模型列表：GET {host}/api/tags
 * - 对话：POST {host}/v1/chat/completions（OpenAI 兼容 + stream）
 */
export class OllamaProvider implements ChatProvider {
  readonly id = 'ollama';
  readonly capabilities: ProviderCapabilities = { streaming: true };

  constructor(private readonly host: string) {}

  private assertHost() {
    if (!this.host.trim()) {
      throw new ProviderError(toUserMessage('NO_HOST'), 'NO_HOST');
    }
  }

  async listModels(): Promise<string[]> {
    this.assertHost();
    const url = `${normalizeHost(this.host)}/api/tags`;
    let res: Response;
    try {
      res = await fetch(url, { method: 'GET' });
    } catch {
      throw new ProviderError(
        toUserMessage('OLLAMA_UNREACHABLE'),
        'OLLAMA_UNREACHABLE',
      );
    }

    if (!res.ok) {
      throw new ProviderError(
        toUserMessage('LIST_MODELS_FAILED', `${res.status}`),
        'LIST_MODELS_FAILED',
      );
    }

    const data = (await res.json()) as {
      models?: Array<{ name: string }>;
    };
    return (data.models ?? []).map((m) => m.name).sort();
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
    this.assertHost();
    if (!input.model.trim()) {
      throw new ProviderError(toUserMessage('NO_MODEL'), 'NO_MODEL');
    }

    const url = `${normalizeHost(this.host)}/v1/chat/completions`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      throw new ProviderError(
        toUserMessage('OLLAMA_UNREACHABLE'),
        'OLLAMA_UNREACHABLE',
      );
    }

    if (!res.ok) {
      const code =
        res.status === 404
          ? 'MODEL_NOT_FOUND'
          : errorCodeFromHttpStatus(res.status);
      throw new ProviderError(
        toUserMessage(
          code,
          code === 'MODEL_NOT_FOUND' ? input.model : `${res.status}`,
        ),
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
      if (!this.host.trim()) {
        return { ok: false as const, error: toUserMessage('NO_HOST'), code: 'NO_HOST' as const };
      }
      const models = await this.listModels();
      if (models.length === 0) {
        return {
          ok: false as const,
          error: '已连接 Ollama，但本地暂无模型。请执行 ollama pull <model>',
          code: 'NO_MODEL' as const,
        };
      }
      return {
        ok: true as const,
        detail: `已连接，本地模型 ${models.length} 个`,
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
