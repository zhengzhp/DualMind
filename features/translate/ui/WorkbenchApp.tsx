import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatPanel } from '@/features/chat/ui/ChatPanel';
import { ImmersiveControl } from '@/features/immersive/ui/ImmersiveControl';
import { formatErrorForUi } from '@/shared/errors';
import {
  closeSidePanelSelf,
  openOptionsTab,
  openWorkspaceTab,
} from '@/shared/extensionPages';
import { sendMessage } from '@/shared/messaging/client';
import { streamTranslate } from '@/shared/messaging/stream';
import { consumeChatPending } from '@/shared/storage/settings';
import {
  PROVIDER_HINT,
  PROVIDER_OPTIONS,
  TARGET_LANGUAGES,
  type AppSettings,
  type ChatPendingAction,
  type ProviderType,
} from '@/shared/storage/types';
import {
  SearchableSelect,
  SegmentedControl,
} from '@/shared/ui';
import { Placeholder } from './Placeholder';

type ModuleTab = 'translate' | 'chat' | 'agent';

/**
 * 字标（文字 logo）资源地址：`public/wordmark.svg` 是 `assets/wordmark.svg` 的 UI 副本，
 * 路径与设计稿逐字节相同，仅裁掉上下空白 —— 因此图片底边≈字标基线，
 * 在 `items-baseline` 行里能直接与副标题对齐，不需要负 margin 补偿。
 */
const WORDMARK_URL = browser.runtime.getURL('/wordmark.svg');

/** 复制成功提示的展示时长（毫秒） */
const COPY_HINT_MS = 1500;

/** 顶部模块 Tab（翻译 / 聊天可用；Agent 仅占位） */
const MODULE_TABS: readonly (readonly [ModuleTab, string])[] = [
  ['translate', '翻译'],
  ['chat', '聊天'],
  ['agent', 'Agent'],
];

/** 副标题按当前 Tab 变化，避免在「聊天」页仍显示「翻译」 */
const TAB_SUBTITLE: Record<ModuleTab, string> = {
  translate: '翻译',
  chat: '网页问答',
  agent: 'Agent',
};

export type WorkbenchSurface = 'sidepanel' | 'workspace';

/**
 * 翻译工作台（Side Panel 与全页共用）。
 * 会话仍走 translateSession；Chat 已接入 `features/chat`，Agent 仅占位。
 */
export function WorkbenchApp({ surface }: { surface: WorkbenchSurface }) {
  const isPage = surface === 'workspace';
  const [tab, setTab] = useState<ModuleTab>('translate');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('zh-CN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  /** OpenAI 模型手填草稿，失焦时再持久化 */
  const [openaiModelDraft, setOpenaiModelDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  /** 右键菜单信箱下发的待执行动作（消费后交给 ChatPanel 执行） */
  const [pendingChatAction, setPendingChatAction] =
    useState<ChatPendingAction | null>(null);
  /** 已处理动作的时间戳：初始读取与 storage 监听可能同时命中，靠它去重 */
  const handledPendingRef = useRef(0);

  /**
   * 右键菜单「总结本页」：信箱由**常驻的**工作台统一消费，再下发给 ChatPanel。
   *
   * 为什么不在 ChatPanel 里消费：面板只在「聊天」Tab 激活时挂载，用户停在
   * 「翻译」Tab 点右键时会错过 storage 事件，动作就丢了。
   * 为什么只有 Side Panel 消费：右键菜单打开的就是侧栏；否则全页工作台会把动作抢走。
   */
  useEffect(() => {
    if (surface !== 'sidepanel') return;

    const handle = async () => {
      const action = await consumeChatPending();
      if (!action) return;
      if (handledPendingRef.current === action.createdAt) return;
      handledPendingRef.current = action.createdAt;
      // 必须先切到聊天 Tab，保证 ChatPanel 挂载，否则动作没人执行
      setTab('chat');
      setPendingChatAction(action);
    };

    // 面板刚打开（信箱先写入）：读一次
    void handle();

    // 面板已打开（信箱后写入）：靠 storage 变化即时响应
    const listener = (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ) => {
      if (area !== 'local') return;
      if (!Object.keys(changes).some((key) => key.includes('chatPending'))) return;
      void handle();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [surface]);

  const clearPendingChatAction = useCallback(() => {
    setPendingChatAction(null);
  }, []);

  const refresh = useCallback(async () => {
    const [s, sess] = await Promise.all([
      sendMessage('settings:get', undefined),
      sendMessage('session:get', undefined),
    ]);
    setSettings(s);
    setOpenaiModelDraft(s.openai.model);
    setTargetLanguage(s.targetLanguage);
    if (sess) {
      setSourceText(sess.sourceText);
      // 本地正在流式时，以本地状态为准，避免 storage 回写打断
      if (!abortRef.current) {
        setTranslatedText(sess.translatedText);
      }
      // 刻意不用会话语言覆盖语言选择器：会话里的 targetLanguage 是「上次实际
      // 使用的语言」（划词会按中英互切自动推导），并不等于持久化设置。用它覆盖
      // 显示值会造成「下拉显示简体中文、而 settings.targetLanguage 其实是 en」的
      // 假象；此时用户再选同一个选项不会触发 onChange，设置永远改不回去。
      // 以会话为权威来源同步错误态：有则显示，无则清除。
      // 只「设置、不清除」会把上一次失败的提示永久挂住——例如新一轮翻译由划词
      // 浮层发起并成功（同样写 translateSession），本视图收不到任何清空动作，
      // 面板上仍留着上一轮的报错。
      if (!abortRef.current) setError(sess.error ?? '');
    }
  }, []);

  const refreshModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError('');
    try {
      const { models: list } = await sendMessage(
        'provider:listModels',
        undefined,
      );
      setModels(list);
      const s = await sendMessage('settings:get', undefined);
      if (s.providerType === 'ollama' && !s.ollama.model && list[0]) {
        const next = await sendMessage('settings:save', {
          ollama: { ...s.ollama, model: list[0] },
        });
        setSettings(next);
      }
    } catch (err) {
      setModels([]);
      setModelsError(formatErrorForUi(err));
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
      await refreshModels();
    })();
    const unwatch = storageWatch();
    return () => {
      unwatch();
      abortRef.current?.abort();
      window.clearTimeout(copyTimerRef.current);
    };
  }, [refresh, refreshModels]);

  function storageWatch() {
    const listener = (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      area: string,
    ) => {
      if (area !== 'local') return;
      const keys = Object.keys(changes);
      if (keys.some((k) => k.includes('translateSession'))) {
        void refresh();
      }
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }

  async function handleTranslate() {
    const text = sourceText.trim();
    if (!text) {
      setError('请输入或粘贴要翻译的文本');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');
    setTranslatedText('');
    setCopied(false);

    try {
      const result = await streamTranslate({
        text,
        targetLanguage,
        signal: controller.signal,
        onChunk: (accumulated) => setTranslatedText(accumulated),
      });
      setTranslatedText(result.translatedText);
      setSourceText(result.sourceText);
    } catch (err) {
      const msg = formatErrorForUi(err);
      if (msg !== '已取消') {
        setError(msg);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setLoading(false);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  async function handleCopy() {
    if (!translatedText) return;
    try {
      await navigator.clipboard.writeText(translatedText);
      setCopied(true);
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(
        () => setCopied(false),
        COPY_HINT_MS,
      );
    } catch {
      setError('复制失败，请手动选择译文后复制');
    }
  }

  async function handleTargetChange(next: string) {
    setTargetLanguage(next);
    await sendMessage('settings:save', { targetLanguage: next }).catch(() => {});
  }

  async function handleProviderChange(providerType: ProviderType) {
    if (!settings || loading) return;
    setModelsError('');
    try {
      const next = await sendMessage('settings:save', { providerType });
      setSettings(next);
      setOpenaiModelDraft(next.openai.model);
      setModels([]);
      await refreshModels();
    } catch (err) {
      setModelsError(formatErrorForUi(err));
    }
  }

  async function handleOllamaModelChange(model: string) {
    if (!settings || loading) return;
    setModelsError('');
    try {
      const next = await sendMessage('settings:save', {
        ollama: { ...settings.ollama, model },
      });
      setSettings(next);
    } catch (err) {
      setModelsError(formatErrorForUi(err));
    }
  }

  /** 提交 OpenAI 模型名（可选项或手输，失焦 / 回车时触发） */
  async function handleOpenaiModelCommit(draft: string) {
    if (!settings || loading) return;
    const model = draft.trim();
    if (model === settings.openai.model) return;
    setModelsError('');
    try {
      const next = await sendMessage('settings:save', {
        openai: { ...settings.openai, model },
      });
      setSettings(next);
      setOpenaiModelDraft(next.openai.model);
    } catch (err) {
      setModelsError(formatErrorForUi(err));
    }
  }

  /**
   * 侧栏先打开目标页再关面板（顺序不能反，关栏后本页上下文即销毁）。
   * 全页内点设置只开 Options，不关工作台。
   */
  async function openFromSidePanelThenClose(open: () => Promise<void>) {
    await open();
    if (surface === 'sidepanel') {
      await closeSidePanelSelf();
    }
  }

  async function handleOpenWorkspace() {
    await openFromSidePanelThenClose(openWorkspaceTab);
  }

  async function handleOpenSettings() {
    await openFromSidePanelThenClose(openOptionsTab);
  }

  const controlsDisabled = loading;
  const currentModel =
    settings?.providerType === 'ollama'
      ? settings.ollama.model
      : (settings?.openai.model ?? '');
  const modelHint =
    settings?.providerType === 'openai-compatible' && !settings.openai.apiKey
      ? '尚未配置 API Key，请先到设置页填写后再拉取模型。'
      : settings?.providerType === 'ollama' && !currentModel
        ? '请选择本地模型；若列表为空，确认 Ollama 已启动并已 pull。'
        : '';
  // 侧边栏专用操作行：翻译 + 复制（全页工作台的复制按钮已内联到译文卡片）
  const sidepanelActionRow = (
    <div className="flex gap-2">
      {loading ? (
        <button
          type="button"
          onClick={handleStop}
          className="flex-1 rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          停止
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleTranslate()}
          className="flex-1 rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          翻译
        </button>
      )}
      <button
        type="button"
        disabled={!translatedText}
        onClick={() => void handleCopy()}
        className="min-w-[5.5rem] whitespace-nowrap rounded-xl border border-brand-100 bg-white px-3 py-2 text-center text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
      >
        {copied ? '已复制' : '复制译文'}
      </button>
    </div>
  );

  return (
    // 全页锁定视口高度（h-screen + overflow-hidden），避免文本区撑高把底部按钮挤出屏幕
    <div
      className={`flex flex-col bg-[radial-gradient(120%_80%_at_0%_0%,#d9eeff_0%,#f4f7fb_45%,#eef2f7_100%)] ${
        isPage ? 'h-screen overflow-hidden' : 'min-h-screen'
      }`}
    >
      <header className="border-b border-brand-100/80 bg-white/70 backdrop-blur">
        {/* 全页工作台：内层容器统一 max-w-5xl + px-6，与下方 main 左右严格对齐 */}
        <div className={isPage ? 'mx-auto w-full max-w-5xl px-6 py-3' : 'px-4 py-3'}>
          <div className="flex items-center justify-between gap-2">
            {/* 全页：标题与副标题同行，压缩头部高度、让 Tab 上移 */}
            <div className={isPage ? 'flex items-baseline gap-2.5' : ''}>
              {/* 品牌名用字标呈现；`text-lg` 保留行盒高度，并作为图片加载失败时 alt 文字的兜底样式 */}
              <h1 className="text-lg font-semibold tracking-tight text-brand-900">
                <img
                  src={WORDMARK_URL}
                  alt="DualMind"
                  draggable={false}
                  className="h-[17px] w-auto"
                />
              </h1>
              <p className="text-xs text-brand-700/70">
                {isPage ? `全页工作台 · ${TAB_SUBTITLE[tab]}` : `AI 助手 · ${TAB_SUBTITLE[tab]}`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {surface === 'sidepanel' && (
                <button
                  type="button"
                  data-testid="open-workspace"
                  onClick={() => void handleOpenWorkspace()}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
                >
                  工作台
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleOpenSettings()}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
              >
                设置
              </button>
            </div>
          </div>

          {/* 全页：三个模块 Tab 放大并居中（胶囊分段样式）；侧栏保持紧凑左对齐 */}
          <nav
            className={isPage ? 'mt-3 flex justify-center' : 'mt-3 flex gap-1'}
          >
            <div
              className={
                isPage
                  ? 'inline-flex gap-1 rounded-xl border border-brand-100 bg-brand-50/80 p-1'
                  : 'flex gap-1'
              }
            >
              {MODULE_TABS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`rounded-lg font-semibold transition ${
                    isPage ? 'px-6 py-2 text-sm' : 'px-3 py-1.5 text-xs'
                  } ${
                    tab === id
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-brand-700/80 hover:bg-white/80'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </nav>
        </div>
      </header>

      <main
        className={
          isPage
            ? 'mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-5'
            : 'flex flex-1 flex-col gap-3 p-4'
        }
      >
        {tab === 'translate' && (
          <>
            {/* 沉浸式全文翻译：只在侧栏提供入口（全页工作台自身不是网页标签页，无法承载该指令） */}
            {surface === 'sidepanel' && <ImmersiveControl />}

            <div
              className={`rounded-xl border border-brand-100/80 bg-white/70 p-3 ${
                isPage ? 'grid gap-3 sm:grid-cols-3' : 'flex flex-col gap-2'
              }`}
            >
              <div className="flex items-center gap-2">
                <label className="w-14 shrink-0 text-xs font-medium text-brand-700">
                  Provider
                </label>
                <SegmentedControl
                  value={settings?.providerType ?? 'ollama'}
                  options={PROVIDER_OPTIONS}
                  disabled={!settings || controlsDisabled}
                  onChange={(next) => void handleProviderChange(next)}
                  ariaLabel="Provider"
                  className="min-w-0 flex-1"
                />
              </div>

              {/* 说明「OpenAI 兼容」到底包含什么，消除「只能填官方 OpenAI」的歧义 */}
              <p
                className={`text-[11px] leading-relaxed text-brand-700/60 ${
                  isPage ? 'sm:col-span-3' : ''
                }`}
              >
                {PROVIDER_HINT}
              </p>

              <div className="flex items-center gap-2">
                <label className="w-14 shrink-0 text-xs font-medium text-brand-700">
                  模型
                </label>
                {/* settings 未加载完时按默认 Provider（ollama）渲染，避免控件形态闪一下 */}
                {(settings?.providerType ?? 'ollama') === 'ollama' ? (
                  <SearchableSelect
                    value={currentModel}
                    // 合并当前已选与列表，避免刷新前丢失已选值
                    options={Array.from(
                      new Set([currentModel, ...models].filter(Boolean)),
                    )}
                    onChange={(next) => void handleOllamaModelChange(next)}
                    disabled={!settings || controlsDisabled}
                    loading={modelsLoading}
                    placeholder="请选择模型"
                    emptyText="模型列表为空，确认 Ollama 已启动并已 pull"
                    testId="model-select"
                    className="min-w-0 flex-1"
                  />
                ) : (
                  <SearchableSelect
                    editable
                    value={openaiModelDraft}
                    options={models}
                    onChange={setOpenaiModelDraft}
                    onCommit={(next) => void handleOpenaiModelCommit(next)}
                    disabled={!settings || controlsDisabled}
                    placeholder="gpt-4o-mini"
                    emptyText="暂无候选模型，点右侧「刷新」拉取"
                    testId="openai-model-input"
                    className="min-w-0 flex-1"
                  />
                )}
                <button
                  type="button"
                  disabled={!settings || controlsDisabled || modelsLoading}
                  onClick={() => void refreshModels()}
                  className="shrink-0 rounded-lg border border-brand-100 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                >
                  {modelsLoading ? '拉取中…' : '刷新'}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="w-14 shrink-0 text-xs font-medium text-brand-700">
                  语言
                </label>
                <SearchableSelect
                  value={targetLanguage}
                  options={TARGET_LANGUAGES}
                  onChange={(next) => void handleTargetChange(next)}
                  disabled={controlsDisabled}
                  // 固定短列表（10 项），滚动即可，不加搜索框更清爽
                  searchable={false}
                  testId="target-language"
                  className="min-w-0 flex-1"
                />
              </div>

              {(modelsError || modelHint) && (
                <p
                  className={`text-[11px] leading-relaxed text-brand-700/70 ${isPage ? 'sm:col-span-3' : ''}`}
                >
                  {modelsError ? (
                    <span className="text-red-600">{modelsError}</span>
                  ) : (
                    modelHint
                  )}
                  {modelsError || modelHint ? (
                    <>
                      {' '}
                      <button
                        type="button"
                        onClick={() => void handleOpenSettings()}
                        className="font-medium text-brand-600 underline-offset-2 hover:underline"
                      >
                        去设置
                      </button>
                    </>
                  ) : null}
                </p>
              )}
            </div>

            <div
              className={
                isPage
                  ? 'grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-4 lg:grid-cols-2'
                  : 'flex flex-col gap-3'
              }
            >
              <label className="flex min-h-0 flex-col text-xs font-medium text-brand-700">
                原文
                <textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  rows={isPage ? 18 : 6}
                  placeholder="在网页划词，或在此粘贴文本…"
                  className={`mt-1 w-full flex-1 rounded-xl border border-brand-100 bg-white/90 p-3 text-sm leading-relaxed outline-none focus:border-brand-500 ${
                    isPage ? 'min-h-0 resize-none' : 'min-h-[8rem] resize-y'
                  }`}
                />
              </label>

              {!isPage && sidepanelActionRow}

              {error && !isPage && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex min-h-0 flex-col text-xs font-medium text-brand-700">
                {/* 全页：复制按钮内联到译文卡片右上角，底部只留居中的翻译按钮 */}
                <div className="flex items-center justify-between">
                  <span>译文</span>
                  {isPage && (
                    <button
                      type="button"
                      disabled={!translatedText}
                      onClick={() => void handleCopy()}
                      className="rounded-md px-2 py-0.5 text-[11px] font-medium text-brand-600 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {copied ? '已复制' : '复制译文'}
                    </button>
                  )}
                </div>
                <textarea
                  value={translatedText}
                  readOnly
                  aria-label="译文"
                  rows={isPage ? 18 : 8}
                  placeholder={loading ? '正在生成…' : '译文将显示在这里'}
                  className={`mt-1 w-full flex-1 rounded-xl border border-brand-100 bg-white p-3 text-sm leading-relaxed text-brand-900 outline-none ${
                    isPage ? 'min-h-0 resize-none' : 'min-h-[8rem] resize-y'
                  }`}
                />
              </div>
            </div>

            {isPage && (
              <div className="flex justify-center">
                {loading ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="w-44 rounded-xl border border-brand-100 bg-white px-6 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    停止
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleTranslate()}
                    className="w-44 rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
                  >
                    翻译
                  </button>
                )}
              </div>
            )}

            {isPage && error && (
              <div className="mx-auto w-full max-w-md rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-700">
                {error}
              </div>
            )}
          </>
        )}

        {tab === 'chat' && (
          <ChatPanel
            surface={surface}
            pendingAction={pendingChatAction}
            onPendingHandled={clearPendingChatAction}
          />
        )}
        {tab === 'agent' && (
          <Placeholder
            title="Agent（即将推出）"
            desc="浏览器操作能力将独立于翻译链路，并带强确认。V1 仅占位。"
          />
        )}
      </main>
    </div>
  );
}
