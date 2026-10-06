import { useMemo } from 'react';
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
 * 形态：**单行常驻醒目横栏**。位于 header 之下、模块 Tab 之上，翻译 / 聊天 / Agent
 * 各 Tab 共享。刻意不做折叠：模型是「当前正在生效」的关键设置，藏进弹层容易被用户
 * 下意识忽略，因此用独立品牌色色带强化视觉权重。
 *
 * 横栏只留「模型 + 刷新」，把整行宽度让给模型名（窄侧栏也能显示完整）；
 * Provider 切换移入模型下拉面板顶部 —— 它是低频操作，且与模型强相关，
 * 放在一起既省横向空间，也避免了两个 Provider 标签被截断成「本地 Ol… / OpenA…」。
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
   * 面板已限宽为 w-72（288px），两个完整标签「本地 Ollama / OpenAI 兼容」能完整显示，
   * 不会被截断成「本地 Ol… / OpenA…」。
   */
  const providerHeader = (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-brand-700">Provider</span>
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

  return (
    // 纵向容器：默认只有一行；仅在出错 / 未配置时下面多出提示行
    <div className="flex flex-col gap-1.5">
      {/* 单行不换行：模型名占满可用宽度，刷新压成图标 */}
      <div className="flex items-center gap-2">
        {/* 「当前使用」提示：品牌色实心胶囊 + 呼吸点，明确这是正在生效的模型，
            避免用户误以为是普通的下拉设置项 */}
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          当前使用
        </span>

        {/* 模型：占满剩余宽度；窄屏截断，宽屏舒展 */}
        <div className="min-w-0 flex-1">
          {/* settings 未加载完时按默认 Provider（ollama）渲染，避免控件形态闪一下 */}
          {providerType === 'ollama' ? (
            <SearchableSelect
              value={currentModel}
              options={ollamaOptions}
              // 当前值图标：即使用户选的是列表外的模型也能稳定显示
              valueIcon={getModelIconUrl(currentModel) ?? undefined}
              onChange={onOllamaModelChange}
              disabled={!settings || disabled}
              loading={modelsLoading}
              // 强调态：让「当前生效的模型」在横栏里一眼可辨
              emphasis
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
              emphasis
              placeholder="gpt-4o-mini"
              emptyText="暂无候选模型，点右侧「刷新」拉取"
              testId="openai-model-input"
              panelHeader={providerHeader}
              panelClassName="left-auto right-0 w-72"
              className="min-w-0"
            />
          )}
        </div>

        {/* 刷新压成图标，保证单行宽度；title / aria-label 保留无障碍语义 */}
        <button
          type="button"
          title="刷新模型列表"
          aria-label="刷新模型列表"
          disabled={!settings || disabled || modelsLoading}
          onClick={onRefresh}
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-brand-200 bg-white p-1.5 text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        >
          <RefreshIcon
            className={`h-4 w-4 ${modelsLoading ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {/* 提示仅在出错 / 未配置时出现，不占常驻高度 */}
      {(modelsError || modelHint) && (
        <p className="text-[11px] leading-relaxed text-brand-700/70">
          {modelsError ? (
            <span className="text-red-600">{modelsError}</span>
          ) : (
            modelHint
          )}{' '}
          <button
            type="button"
            onClick={onOpenSettings}
            className="font-medium text-brand-600 underline-offset-2 hover:underline"
          >
            去设置
          </button>
        </p>
      )}
    </div>
  );
}
