import {
  ProviderError,
  type ChatInput,
  type ChatProvider,
  type ChatResult,
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

  async listModels(): Promise<string[]> {
    const url = `${normalizeBaseUrl(this.baseUrl)}/models`;
    const res = await fetch(url, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ProviderError(
        `拉取模型列表失败 (${res.status}): ${text || res.statusText}`,
        'LIST_MODELS_FAILED',
      );
    }
    const data = (await res.json()) as {
      data?: Array<{ id: string }>;
    };
    return (data.data ?? []).map((m) => m.id).sort();
  }

  async chat(input: ChatInput): Promise<ChatResult> {
    const url = `${normalizeBaseUrl(this.baseUrl)}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: 0.2,
      }),
      signal: input.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ProviderError(
        `翻译请求失败 (${res.status}): ${text || res.statusText}`,
        'CHAT_FAILED',
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new ProviderError('模型返回空内容', 'EMPTY_RESPONSE');
    }
    return { content };
  }

  async testConnection() {
    try {
      if (!this.baseUrl.trim()) {
        return { ok: false as const, error: '请填写 Base URL' };
      }
      if (!this.apiKey.trim()) {
        return { ok: false as const, error: '请填写 API Key' };
      }
      const models = await this.listModels();
      return {
        ok: true as const,
        detail: `已连接，可用模型 ${models.length} 个`,
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
