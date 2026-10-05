import {
  ProviderError,
  type ChatInput,
  type ChatProvider,
  type ChatResult,
} from './types';

function normalizeHost(host: string): string {
  return host.replace(/\/+$/, '');
}

/**
 * Ollama Provider
 * - 模型列表：GET {host}/api/tags
 * - 对话：POST {host}/v1/chat/completions（OpenAI 兼容）
 */
export class OllamaProvider implements ChatProvider {
  readonly id = 'ollama';

  constructor(private readonly host: string) {}

  async listModels(): Promise<string[]> {
    const url = `${normalizeHost(this.host)}/api/tags`;
    let res: Response;
    try {
      res = await fetch(url, { method: 'GET' });
    } catch {
      throw new ProviderError(
        '无法连接 Ollama。请确认已启动（默认端口 11434），并检查 Host 配置。',
        'OLLAMA_UNREACHABLE',
      );
    }

    if (!res.ok) {
      throw new ProviderError(
        `读取 Ollama 模型失败 (${res.status})`,
        'LIST_MODELS_FAILED',
      );
    }

    const data = (await res.json()) as {
      models?: Array<{ name: string }>;
    };
    return (data.models ?? []).map((m) => m.name).sort();
  }

  async chat(input: ChatInput): Promise<ChatResult> {
    if (!input.model.trim()) {
      throw new ProviderError(
        '尚未选择 Ollama 模型。请在设置页刷新模型列表并选择，或先执行 ollama pull <model>。',
        'NO_MODEL',
      );
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
          stream: false,
        }),
        signal: input.signal,
      });
    } catch {
      throw new ProviderError(
        '无法连接 Ollama。请确认服务已启动。',
        'OLLAMA_UNREACHABLE',
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // 常见：模型未拉取
      if (res.status === 404) {
        throw new ProviderError(
          `模型不存在或未拉取：${input.model}。请执行 ollama pull ${input.model}`,
          'MODEL_NOT_FOUND',
        );
      }
      throw new ProviderError(
        `Ollama 请求失败 (${res.status}): ${text || res.statusText}`,
        'CHAT_FAILED',
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new ProviderError('Ollama 返回空内容', 'EMPTY_RESPONSE');
    }
    return { content };
  }

  async testConnection() {
    try {
      if (!this.host.trim()) {
        return { ok: false as const, error: '请填写 Ollama Host' };
      }
      const models = await this.listModels();
      if (models.length === 0) {
        return {
          ok: false as const,
          error: '已连接 Ollama，但本地暂无模型。请执行 ollama pull <model>',
        };
      }
      return {
        ok: true as const,
        detail: `已连接，本地模型 ${models.length} 个`,
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
