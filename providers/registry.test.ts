/**
 * registry 单测：按设置实例化 Provider 与解析模型名
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type AppSettings } from '@/shared/storage/types';
import { createProviderFromSettings, resolveModel } from './registry';
import { OllamaProvider } from './ollama';
import { OpenAICompatibleProvider } from './openai-compatible';

/** 生成一份设置，允许局部覆盖 */
function makeSettings(patch: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

describe('createProviderFromSettings', () => {
  it('providerType=ollama 时返回 OllamaProvider', () => {
    const provider = createProviderFromSettings(makeSettings({ providerType: 'ollama' }));
    expect(provider).toBeInstanceOf(OllamaProvider);
    expect(provider.id).toBe('ollama');
  });

  it('providerType=openai-compatible 时返回 OpenAICompatibleProvider', () => {
    const provider = createProviderFromSettings(
      makeSettings({ providerType: 'openai-compatible' }),
    );
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.id).toBe('openai-compatible');
  });

  it('默认设置走 Ollama', () => {
    expect(createProviderFromSettings(makeSettings()).id).toBe('ollama');
  });
});

describe('resolveModel', () => {
  it('Ollama 返回已配置模型', () => {
    const settings = makeSettings({
      providerType: 'ollama',
      ollama: { host: 'http://127.0.0.1:11434', model: 'qwen2.5' },
    });
    expect(resolveModel(settings)).toBe('qwen2.5');
  });

  it('OpenAI 返回已配置模型', () => {
    const settings = makeSettings({
      providerType: 'openai-compatible',
      openai: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk', model: 'gpt-4o-mini' },
    });
    expect(resolveModel(settings)).toBe('gpt-4o-mini');
  });

  it.each(['ollama', 'openai-compatible'] as const)(
    'providerType=%s 且模型为空时抛 NO_MODEL',
    (providerType) => {
      const settings = makeSettings(
        providerType === 'ollama'
          ? { providerType, ollama: { host: 'http://127.0.0.1:11434', model: '  ' } }
          : {
              providerType,
              openai: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk', model: '' },
            },
      );
      expect(() => resolveModel(settings)).toThrowError(
        expect.objectContaining({ code: 'NO_MODEL' }),
      );
    },
  );
});
