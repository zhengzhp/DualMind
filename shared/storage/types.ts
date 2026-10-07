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

/**
 * 页面悬浮入口（`features/page-fab/`）的落点。
 *
 * 只记「贴哪一侧 + 顶边 y」而不记绝对 `x/y`：松手时吸附到最近的左/右边缘，
 * 于是窄窗口、分辨率变化、浏览器缩放都不会把按钮留在视口外（x 由贴边推导）。
 * 全局共享一份（不按站点区分），避免用户在每个站点都要重新摆一次。
 */
export interface PageFabPos {
  side: 'left' | 'right';
  /** 按钮顶边在视口中的 y 坐标（px），读取时会按当前视口高度夹取 */
  y: number;
}

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
  /** hostname 黑名单，匹配则**整个内容脚本不注入**（划词与悬浮入口一起关掉） */
  disabledHosts: string[];
  /**
   * 是否显示页面悬浮入口（`features/page-fab/`）。
   *
   * 与 `disabledHosts` 的区别：这里是**入口级**开关，关掉只影响悬浮入口，
   * 划词翻译照常可用（用户「不想看见悬浮球」和「不想用这个站点的功能」是两件事）。
   */
  pageFabEnabled: boolean;
  /**
   * 不显示悬浮入口的站点（hostname，精确匹配）。
   *
   * 由入口菜单的「本站不再显示」写入，也在 Options 里编辑。
   * **只隐藏入口**，不影响划词 —— 与 `disabledHosts` 不可混用。
   */
  pageFabHiddenHosts: string[];
  providerType: ProviderType;
  openai: OpenAICompatibleConfig;
  ollama: OllamaConfig;
}

export const DEFAULT_SETTINGS: AppSettings = {
  targetLanguage: 'zh-CN',
  // 默认「仅快捷键」：避免选中即弹层打扰（用户可改为 auto）
  toolbarTrigger: 'shortcut',
  disabledHosts: [],
  // 默认显示入口；用户主动关掉后才需要恢复路径（见 Options）
  pageFabEnabled: true,
  pageFabHiddenHosts: [],
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

/* ------------------------------------------------------------------ *
 * V2 摘要 / 聊天 · 持久化形状
 *
 * 放在 `shared/storage/types.ts`（而非 `features/chat/types.ts`）的原因：
 * 这些形状会被 `shared/storage/*` 直接读写，若定义在 feature 内会让
 * shared 反向依赖 feature。域内「不入库」的运行时类型（如上下文载荷）
 * 仍留在 `features/chat/types.ts`。与 `ImmersiveDisplayMode` 的处理一致。
 * ------------------------------------------------------------------ */

/** 聊天上下文范围：仅当前选区 / 当前页正文 */
export type ChatContextScope = 'selection' | 'page';

/**
 * 聊天偏好。
 * 独立 storage 键（`local:chatPrefs`）：切换上下文范围不应触发
 * `chatSessions` 的监听回调。
 */
export interface ChatPrefs {
  /** 送模型的上下文来源；默认整页正文 */
  contextScope: ChatContextScope;
  /** 页面上下文的最大字符预算，超出按段截断；避免长文撑爆上下文与费用 */
  maxContextChars: number;
}

export const DEFAULT_CHAT_PREFS: ChatPrefs = {
  contextScope: 'page',
  maxContextChars: 12000,
};

/**
 * 会话内的一条消息。
 *
 * 刻意不叫 `ChatMessage`：`providers/types.ts` 已有同名类型（入参形状
 * `{ role, content }`），这里是**入库形状**，多出 id / 时间戳 / error。
 */
export interface ChatTurn {
  id: string;
  /**
   * `user` / `assistant`：对话轮次；
   * `system` + `kind: 'page-break'`：跨页确认后的分隔条（仅 UI / 导出，不入模型历史）。
   */
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  /** 该轮失败时的用户可读文案；如实展示，不伪装成成功（沿用沉浸译的教训） */
  error?: string;
  /** 跨页分隔标记；老会话无此字段 */
  kind?: 'page-break';
  /** 分隔所指向的新页面（`kind: 'page-break'` 时有意义） */
  pageUrl?: string;
  pageTitle?: string;
}

/** 一个聊天会话（全局列表，记录来源页面） */
export interface ChatSession {
  id: string;
  title: string;
  pageUrl: string;
  pageTitle: string;
  turns: ChatTurn[];
  createdAt: number;
  updatedAt: number;
  /**
   * 用户已确认「本会话继续用当前页」：置为 true 后不再做来源一致性检查。
   * 可选字段（老会话没有 → undefined → 视为未确认，检查照常执行）。
   */
  allowCrossPage?: boolean;
}

/** 会话列表项：不含 `turns`，避免列表读取时搬运大数组 */
export interface ChatSessionSummary {
  id: string;
  title: string;
  pageUrl: string;
  pageTitle: string;
  turnCount: number;
  updatedAt: number;
}

/**
 * 待执行动作（mailbox）。
 *
 * 用途：右键菜单「总结本页」在 Background 里触发，而真正执行需要 Side Panel 的
 * UI 上下文。`sidebarPanel.open()` 与面板 React 挂载存在竞态，靠 runtime 消息
 * 广播不可靠，故改用 storage 当信箱：Background 写入，面板读取并消费。
 */
export interface ChatPendingAction {
  kind: 'summarize';
  createdAt: number;
}

/** 待执行动作的有效期：超过即视为过期，避免面板很久之后打开突然执行旧指令 */
export const CHAT_PENDING_TTL_MS = 120_000;

/**
 * SPA / 站内路由变化信号（内容脚本 → Background 写入，网页助手 UI 消费）。
 * 只用于提示「上下文可能过期」，不自动重读。
 */
export interface ChatPageNavSignal {
  url: string;
  title: string;
  at: number;
}
