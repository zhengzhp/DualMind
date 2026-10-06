/** 支持的 Provider 类型 */
export type ProviderType = 'openai-compatible' | 'ollama';

/** 划词工具栏显示策略（默认 `shortcut`：仅快捷键触发，不打扰） */
export type ToolbarTrigger = 'auto' | 'shortcut';

/** 沉浸式译文展示模式：双语对照 / 仅译文 */
export type ImmersiveDisplayMode = 'bilingual' | 'translation-only';

/**
 * 沉浸式全文翻译偏好。
 * 独立 storage 键（`local:immersivePrefs`），避免与 AppSettings 变更互相牵连。
 */
export interface ImmersivePrefs {
  displayMode: ImmersiveDisplayMode;
  /** 打开网页后是否自动开始整页翻译；默认关闭，避免打扰与额外费用 */
  autoTranslate: boolean;
}

export const DEFAULT_IMMERSIVE_PREFS: ImmersivePrefs = {
  displayMode: 'bilingual',
  autoTranslate: false,
};

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
  // 默认「仅快捷键」：避免选中即弹层打扰（用户可改为 auto）
  toolbarTrigger: 'shortcut',
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

/**
 * Provider 选择项（Options 与侧栏工作台共用一份，避免两处文案漂移）。
 *
 * 文案刻意避开单说「OpenAI」：`openai-compatible` 覆盖的是**任意**遵循 OpenAI
 * 协议的端点（DeepSeek / Groq / 各类中转 / 自建 vLLM 等），叫「OpenAI」会让
 * 用户以为只能填官方 API——尤其当模型下拉里出现 `deepseek-*` 时字面自相矛盾。
 * 因此标签统一为「OpenAI 兼容」，用 `hint` 补充说明它到底包含什么。
 *
 * 结构上天然满足 `SegmentedControlOption`（UI 层不反向依赖 storage，故此处不引入其类型）。
 */
export const PROVIDER_OPTIONS = [
  {
    value: 'ollama',
    label: '本地 Ollama',
    title: 'Ollama：模型跑在本机，默认端口 11434',
  },
  {
    value: 'openai-compatible',
    label: 'OpenAI 兼容',
    title: 'OpenAI 兼容接口：DeepSeek / Groq / 中转 / 自建 /v1 服务',
  },
] as const satisfies readonly {
  value: ProviderType;
  label: string;
  title: string;
}[];

/** Provider 选择项下方的说明文案（两处 UI 共用，保证口径一致） */
export const PROVIDER_HINT =
  '本地 Ollama 走本机端口；OpenAI 兼容适用于 DeepSeek、Groq、各类中转或自建 /v1 服务等任意兼容端点。';
