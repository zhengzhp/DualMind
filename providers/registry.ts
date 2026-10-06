import type { AppSettings } from '@/shared/storage/types';
import { ProviderError, toUserMessage } from '@/shared/errors';
import { OpenAICompatibleProvider } from './openai-compatible';
import { OllamaProvider } from './ollama';
import type { ChatProvider } from './types';

/** 根据当前设置实例化对应 Provider */
export function createProviderFromSettings(settings: AppSettings): ChatProvider {
  if (settings.providerType === 'ollama') {
    return new OllamaProvider(settings.ollama.host);
  }
  return new OpenAICompatibleProvider(
    settings.openai.baseUrl,
    settings.openai.apiKey,
  );
}

/** 取当前应使用的模型名 */
export function resolveModel(settings: AppSettings): string {
  if (settings.providerType === 'ollama') {
    const model = settings.ollama.model.trim();
    if (!model) {
      throw new ProviderError(toUserMessage('NO_MODEL'), 'NO_MODEL');
    }
    return model;
  }
  const model = settings.openai.model.trim();
  if (!model) {
    throw new ProviderError(toUserMessage('NO_MODEL'), 'NO_MODEL');
  }
  return model;
}
