import { useMemo } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  PROVIDER_OPTIONS,
  type AppSettings,
  type ProviderType,
} from '@/shared/storage/types';
import {
  RefreshIcon,
  SearchableSelect,
  SegmentedControl,
  getModelIconUrl,
  toModelOptions,
} from '@/shared/ui';

/**
 * 模型选择器（模型 + 刷新；Provider 收在下拉面板里）。
 *
 * 形态：**白底单行**。位于 header 之下、模块 Tab 之上，翻译 / 阅读助手 / Agent
 * 各 Tab 共享。刻意不做折叠：模型是「当前正在生效」的关键设置，藏进弹层容易被
 * 用户下意识忽略。
 *
 * 视觉（v0.3）：去掉品牌色带与 pulse 胶囊，只保留一处强调 —— 14px 半粗模型名。
 * 左侧 11px「模型」标签降权（ink-2 + 常规字重）；右侧 Provider 用 chip + 状态点表达
 * 「当前是否可用」，刷新压成图标；Provider 切换仍在面板顶部（低频操作）。
 *
 * 纯受控：所有状态与持久化仍由 `WorkbenchApp` 持有（单一数据源），本组件只负责渲染与回调。
 */
export interface ModelSelectorProps {
  /** 设置尚未加载完时为 null，此时按默认 Provider 渲染，避免控件形态闪烁 */
  settings: AppSettings | null;
  /** 已拉取到的候选模型列表 */
  models: string[];
  modelsLoading: boolean;
  /** 拉取 / 保存模型时产生的错误（与 modelHint 互斥展示） */
  modelsError: string;
  /** OpenAI 兼容模型名的手填草稿（失焦 / 回车才持久化） */
  openaiModelDraft: string;
  /** 翻译进行中时禁用，避免改写正在使用的模型 */
  disabled?: boolean;
  onProviderChange: (providerType: ProviderType) => void;
  onOllamaModelChange: (model: string) => void;
  onOpenaiModelDraftChange: (value: string) => void;
  onOpenaiModelCommit: (value: string) => void;
  onRefresh: () => void;
  /** 提示里的「去设置」入口 */
  onOpenSettings: () => void;
}

export function ModelSelector({
  settings,
  models,
  modelsLoading,
  modelsError,
  openaiModelDraft,
  disabled = false,
  onProviderChange,
  onOllamaModelChange,
  onOpenaiModelDraftChange,
  onOpenaiModelCommit,
  onRefresh,
  onOpenSettings,
}: ModelSelectorProps) {
  // settings 未加载完时按默认 Provider（ollama）渲染
  const providerType = settings?.providerType ?? 'ollama';
  const currentModel =
    providerType === 'ollama'
      ? (settings?.ollama.model ?? '')
      : (settings?.openai.model ?? '');

  // 未配置 / 未选模型时给一句可操作提示，避免用户对着空列表发呆
  const modelHint =
    providerType === 'openai-compatible' && !settings?.openai.apiKey
      ? '尚未配置 API Key，请先到设置页填写后再拉取模型。'
      : providerType === 'ollama' && !currentModel
        ? '请选择本地模型；若列表为空，确认 Ollama 已启动并已 pull。'
        : '';

  /** Ollama 候选：合并「当前已选 + 远端列表」，避免刷新前丢失已选值 */
  const ollamaOptions = useMemo(
    () => toModelOptions(Array.from(new Set([currentModel, ...models].filter(Boolean)))),
    [currentModel, models],
  );
  /** OpenAI 兼容候选：仅远端列表（当前值可手输，图标由 valueIcon 单独提供） */
  const openaiOptions = useMemo(() => toModelOptions(models), [models]);

  /**
   * 下拉面板顶部的 Provider 切换区。
   * 面板限宽 w-72（288px），两个完整标签「本地 Ollama / OpenAI 兼容」能完整显示。
   */
  const providerHeader = (
    <div className="flex flex-col gap-1.5">
      <span className="text-meta font-semibold text-ink-2">Provider</span>
      <SegmentedControl
        value={providerType}
        options={PROVIDER_OPTIONS}
        disabled={!settings || disabled}
        onChange={onProviderChange}
        ariaLabel="Provider"
        className="min-w-0"
      />
    </div>
  );

  const providerLabel =
    providerType === 'ollama' ? '本地 · Ollama' : 'OpenAI 兼容';

  /**
   * Provider 状态点：把「当前配置能不能用」压成一个点，避免用户先读文字再判断。
   * - danger：拉取 / 保存模型报错
   * - warn：尚未配置（无 Key / 未选模型）
   * - success：配置完整
   */
  const providerStatus = modelsError
    ? { dot: 'bg-danger', text: '异常' }
    : modelHint || !currentModel
      ? { dot: 'bg-warn', text: '待配置' }
      : { dot: 'bg-success', text: '已配置' };

  return (
    // 纵向容器：默认只有一行；仅在出错 / 未配置时下面多出提示行
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {/* 标签降权：模型名才是这一行的信息主角；用 ink-2 而非 ink-3，保证 11px 文本仍过 AA */}
        <span className="shrink-0 text-meta text-ink-2">模型</span>

        {/* 模型：占满剩余宽度；窄屏截断，宽屏舒展 */}
        <div className="min-w-0 flex-1">
          {providerType === 'ollama' ? (
            <SearchableSelect
              value={currentModel}
              options={ollamaOptions}
              // 当前值图标：即使用户选的是列表外的模型也能稳定显示
              valueIcon={getModelIconUrl(currentModel) ?? undefined}
              onChange={onOllamaModelChange}
              disabled={!settings || disabled}
              loading={modelsLoading}
              // 轻量态：模型名是信息主角，控件本身不画框
              flat
              placeholder="请选择模型"
              emptyText="模型列表为空，确认 Ollama 已启动并已 pull"
              testId="model-select"
              panelHeader={providerHeader}
              // 触发器占满整行（全页可达近千像素），面板限宽 + 右对齐更像正常下拉
              panelClassName="left-auto right-0 w-72"
              className="min-w-0"
            />
          ) : (
            <SearchableSelect
              editable
              value={openaiModelDraft}
              options={openaiOptions}
              // 手输的模型名若命中厂商（如 gpt-4o / deepseek-chat）也显示图标
              valueIcon={getModelIconUrl(openaiModelDraft) ?? undefined}
              onChange={onOpenaiModelDraftChange}
              onCommit={onOpenaiModelCommit}
              disabled={!settings || disabled}
              flat
              placeholder="gpt-4o-mini"
              emptyText="暂无候选模型，点右侧「刷新」拉取"
              testId="openai-model-input"
              panelHeader={providerHeader}
              panelClassName="left-auto right-0 w-72"
              className="min-w-0"
            />
          )}
        </div>

        {/* Provider chip：带状态点，窄屏（<380px）隐藏文字只留状态点会失去含义，故整体隐藏 */}
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-chip border border-line bg-surface-2 px-2 py-[3px] text-meta text-ink-2 max-[380px]:hidden"
          title={`Provider：${providerLabel} · ${providerStatus.text}`}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${providerStatus.dot}`}
          />
          {providerLabel}
        </span>

        {/* 刷新压成图标，保证单行宽度；title / aria-label 保留无障碍语义 */}
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                aria-label="刷新模型列表"
                disabled={!settings || disabled || modelsLoading}
                onClick={onRefresh}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-2 transition hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-40"
              >
                <RefreshIcon
                  className={`h-4 w-4 ${modelsLoading ? 'animate-spin' : ''}`}
                />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="bottom"
                sideOffset={6}
                className="z-50 rounded-chip bg-ink px-2 py-1 text-meta text-surface shadow-popover"
              >
                刷新模型列表
                <Tooltip.Arrow className="fill-ink" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>

      {/* 提示仅在出错 / 未配置时出现，不占常驻高度 */}
      {(modelsError || modelHint) && (
        <p className="pl-8 text-meta leading-relaxed text-ink-2">
          {modelsError ? (
            <span className="text-danger">{modelsError}</span>
          ) : (
            modelHint
          )}{' '}
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-label font-semibold text-accent underline-offset-2 hover:underline"
          >
            去设置
          </button>
        </p>
      )}
    </div>
  );
}
