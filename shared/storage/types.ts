/** 支持的 Provider 类型 */
export type ProviderType = 'openai-compatible' | 'ollama';

/** 划词工具栏显示策略 */
export type ToolbarTrigger = 'auto' | 'shortcut';

/** OpenAI 兼容接口配置 */
export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Ollama 本地配置 */
export interface OllamaConfig {
  /** 例如 http://127.0.0.1:11434 */
  host: string;
  model: string;
}

/** 用户全局设置 */
export interface AppSettings {
  targetLanguage: string;
  toolbarTrigger: ToolbarTrigger;
  /** hostname 黑名单，匹配则不注入划词工具栏 */
  disabledHosts: string[];
  providerType: ProviderType;
  openai: OpenAICompatibleConfig;
  ollama: OllamaConfig;
}

export const DEFAULT_SETTINGS: AppSettings = {
  targetLanguage: 'zh-CN',
  toolbarTrigger: 'auto',
  disabledHosts: [],
  providerType: 'ollama',
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  },
  ollama: {
    host: 'http://127.0.0.1:11434',
    model: '',
  },
};

/** 常用目标语言 */
export const TARGET_LANGUAGES = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'ru', label: 'Русский' },
  { value: 'pt', label: 'Português' },
] as const;
