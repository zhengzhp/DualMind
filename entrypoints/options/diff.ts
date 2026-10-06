/**
 * Options「草稿 → 增量补丁」的纯逻辑（独立成模块以便单测，不依赖 DOM / React）。
 *
 * 为什么不能整对象提交：Options 的草稿在页面加载时快照一次，之后可能长时间
 * 停留。若整对象 `settings:save`，会把快照里陈旧的 `targetLanguage` 等一并写回，
 * 覆盖用户刚在侧栏改过的设置（这正是沉浸译的目标语被写回 `en`、对英文页误报
 * 「没有可翻译的正文内容」的诱因）。嵌套对象只提交变化的子字段，Background 侧
 * `saveSettings` 会做浅合并，语义等价且不会误伤其他入口的修改。
 */
import type {
  AppSettings,
  OllamaConfig,
  OpenAICompatibleConfig,
} from '@/shared/storage/types';

/**
 * 计算「草稿相对已保存值」的增量补丁。
 *
 * @param disabledHosts 站点禁用列表（由独立 textarea 维护，按最终解析结果比对）
 * @param pageFabHiddenHosts 不显示悬浮入口的站点（同样由 textarea 维护）
 */
export function diffSettings(
  baseline: AppSettings,
  draft: AppSettings,
  disabledHosts: string[],
  pageFabHiddenHosts: string[],
): Partial<AppSettings> {
  const patch: Partial<AppSettings> = {};

  if (draft.targetLanguage !== baseline.targetLanguage) {
    patch.targetLanguage = draft.targetLanguage;
  }
  if (draft.toolbarTrigger !== baseline.toolbarTrigger) {
    patch.toolbarTrigger = draft.toolbarTrigger;
  }
  if (draft.providerType !== baseline.providerType) {
    patch.providerType = draft.providerType;
  }
  if (draft.pageFabEnabled !== baseline.pageFabEnabled) {
    patch.pageFabEnabled = draft.pageFabEnabled;
  }
  if (disabledHosts.join('\n') !== baseline.disabledHosts.join('\n')) {
    patch.disabledHosts = disabledHosts;
  }
  if (
    pageFabHiddenHosts.join('\n') !== baseline.pageFabHiddenHosts.join('\n')
  ) {
    patch.pageFabHiddenHosts = pageFabHiddenHosts;
  }

  const openai: Partial<OpenAICompatibleConfig> = {};
  if (draft.openai.baseUrl !== baseline.openai.baseUrl) {
    openai.baseUrl = draft.openai.baseUrl;
  }
  if (draft.openai.apiKey !== baseline.openai.apiKey) {
    openai.apiKey = draft.openai.apiKey;
  }
  if (draft.openai.model !== baseline.openai.model) {
    openai.model = draft.openai.model;
  }
  if (Object.keys(openai).length > 0) {
    // 协议声明为 Partial<AppSettings>，嵌套只带变化字段需收窄一次（运行时由 saveSettings 合并）
    patch.openai = openai as OpenAICompatibleConfig;
  }

  const ollama: Partial<OllamaConfig> = {};
  if (draft.ollama.host !== baseline.ollama.host) {
    ollama.host = draft.ollama.host;
  }
  if (draft.ollama.model !== baseline.ollama.model) {
    ollama.model = draft.ollama.model;
  }
  if (Object.keys(ollama).length > 0) {
    patch.ollama = ollama as OllamaConfig;
  }

  return patch;
}

/** 把禁用站点 textarea 的文本（换行 / 逗号分隔）规整为 hostname 数组 */
export function parseHosts(text: string): string[] {
  return text
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}
