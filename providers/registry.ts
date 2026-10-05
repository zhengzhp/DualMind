import type { AppSettings } from '@/shared/storage/types';
import { OpenAICompatibleProvider } from './openai-compatible';
import { OllamaProvider } from './ollama';
import type { ChatProvider } from './types';
import { ProviderError } from './types';

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
      throw new ProviderError(
        '请先在设置中选择 Ollama 模型',
        'NO_MODEL',
      );
    }
    return model;
  }
  const model = settings.openai.model.trim();
  if (!model) {
    throw new ProviderError('请先在设置中填写模型名称', 'NO_MODEL');
  }
  return model;
}
