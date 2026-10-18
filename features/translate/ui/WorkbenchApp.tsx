import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentPanel } from '@/features/agent/ui/AgentPanel';
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
import {
  consumeAgentPending,
  consumeChatPending,
} from '@/shared/storage/settings';
import {
  TARGET_LANGUAGES,
  type AgentPendingAction,
  type AppSettings,
  type ChatPendingAction,
  type ProviderType,
} from '@/shared/storage/types';
import {
  SearchableSelect,
  SettingsIcon,
  Wordmark,
  WorkspaceIcon,
  controlHeight,
} from '@/shared/ui';
import { ModelSelector } from './ModelSelector';

type ModuleTab = 'translate' | 'chat' | 'agent';

/** 复制成功提示的展示时长（毫秒） */
const COPY_HINT_MS = 1500;

/** 顶部模块 Tab（翻译 / 阅读助手 / Agent） */
const MODULE_TABS: readonly (readonly [ModuleTab, string])[] = [
  ['translate', '翻译'],
  ['chat', '阅读助手'],
  ['agent', 'Agent'],
];

/** 副标题按当前 Tab 变化，避免在「阅读助手」页仍显示「翻译」 */
const TAB_SUBTITLE: Record<ModuleTab, string> = {
  translate: '翻译',
  chat: '摘要与问答',
  agent: '本页操作',
};

export type WorkbenchSurface = 'sidepanel' | 'workspace';

/**
 * 翻译工作台（Side Panel 与全页共用）。
 * 会话仍走 translateSession；Chat / Agent 分别接入独立 feature。
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
  /** FAB「请 Agent 操作本页」信箱 */
  const [pendingAgentAction, setPendingAgentAction] =
    useState<AgentPendingAction | null>(null);
  /** 信箱过期提示（TTL 内未打开侧栏） */
  const [pendingExpiredHint, setPendingExpiredHint] = useState('');
  /** 已处理动作的时间戳：初始读取与 storage 监听可能同时命中，靠它去重 */
  const handledPendingRef = useRef(0);
  const handledAgentPendingRef = useRef(0);

  /**
   * 右键菜单「总结本页」：信箱由**常驻的**工作台统一消费，再下发给 ChatPanel。
   *
   * 为什么仍由 WorkbenchApp 消费：要先 `setTab('chat')` 切到阅读助手，用户才看得到
   * 自动发起的总结；ChatPanel 虽已常驻挂载（避免切 Tab 丢会话），但默认可能藏在
   * 翻译 Tab 后面。
   * 为什么只有 Side Panel 消费：右键菜单打开的就是侧栏；否则全页工作台会把动作抢走。
   */
  useEffect(() => {
    if (surface !== 'sidepanel') return;

    const handle = async () => {
      const result = await consumeChatPending();
      if (result.status === 'empty') return;
      if (result.status === 'expired') {
        setPendingExpiredHint('总结请求已过期，请再试一次（右键或悬浮按钮）');
        return;
      }
      const action = result.action;
      if (handledPendingRef.current === action.createdAt) return;
      handledPendingRef.current = action.createdAt;
      setPendingExpiredHint('');
      // 先切到阅读助手，保证用户看见自动发起的总结（ChatPanel 本身常驻）
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

  /**
   * FAB「请 Agent 操作本页」：信箱由侧栏消费并切到 Agent Tab。
   */
  useEffect(() => {
    if (surface !== 'sidepanel') return;

    const handle = async () => {
      const result = await consumeAgentPending();
      if (result.status === 'empty') return;
      if (result.status === 'expired') {
        setPendingExpiredHint('Agent 打开请求已过期，请再点一次悬浮入口');
        return;
      }
      const action = result.action;
      if (handledAgentPendingRef.current === action.createdAt) return;
      handledAgentPendingRef.current = action.createdAt;
      setPendingExpiredHint('');
      setTab('agent');
      setPendingAgentAction(action);
    };

    void handle();

    const listener = (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ) => {
      if (area !== 'local') return;
      if (!Object.keys(changes).some((key) => key.includes('agentPending'))) {
        return;
      }
      void handle();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [surface]);

  useEffect(() => {
    if (!pendingExpiredHint) return;
    const timer = window.setTimeout(() => setPendingExpiredHint(''), 6_000);
    return () => window.clearTimeout(timer);
  }, [pendingExpiredHint]);

  const clearPendingChatAction = useCallback(() => {
    setPendingChatAction(null);
  }, []);

  const clearPendingAgentAction = useCallback(() => {
    setPendingAgentAction(null);
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

  /** 空态「粘贴文本」入口：读剪贴板失败时退回手填，不静默 */
  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setError('剪贴板为空，请先复制一段文本');
        return;
      }
      setSourceText(text);
      setError('');
    } catch {
      setError('无法读取剪贴板，请直接粘贴到原文框');
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
  /** 动作按钮高度：侧栏 32px / 全页工作台 40px（P1.13） */
  const actionHeight = controlHeight(surface);

  return (
    // 侧栏与全页均锁视口高度，保证阅读助手输入区钉底、翻译区内部滚动
    <div className="flex h-screen flex-col overflow-hidden bg-canvas text-ink">
      {/* 键盘 / 屏幕阅读器：跳过头部与模型横栏，直达内容区（P0.6） */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2 focus:text-label focus:font-semibold focus:text-ink focus:shadow-popover"
      >
        跳到主内容
      </a>
      <header className="shrink-0 border-b border-line bg-surface/90 backdrop-blur">
        {/* 全页工作台：内层容器统一 max-w-5xl + px-6，与下方 main 左右严格对齐 */}
        <div
          className={
            isPage
              ? 'mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-6'
              : 'flex h-14 items-center justify-between gap-2 px-4'
          }
        >
          <div className="flex min-w-0 items-baseline gap-2.5">
            {/* 品牌名用字标呈现；18px 与 56px 头部高度对齐（墨色/品牌色走 token） */}
            <h1 className="shrink-0 text-title font-semibold tracking-tight text-ink">
              <Wordmark className="h-[18px] w-auto" />
            </h1>
            <p className="dm-meta-line truncate text-meta text-ink-2">
              {isPage ? '全页工作台' : 'AI 助手'}{' '}
              <span className="dm-separator" aria-hidden="true">
                ·
              </span>{' '}
              {TAB_SUBTITLE[tab]}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {surface === 'sidepanel' && (
              <button
                type="button"
                data-testid="open-workspace"
                onClick={() => void handleOpenWorkspace()}
                className="inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-xs font-semibold text-ink-2 transition hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                <WorkspaceIcon className="h-3.5 w-3.5" />
                工作台
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleOpenSettings()}
              className="inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-xs font-semibold text-ink-2 transition hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              设置
            </button>
          </div>
        </div>
      </header>

      {/* 模型横栏：白底 + 底线，只保留一处强调（模型名）。
          relative + z-10：保证栏内模型下拉展开时盖住下方 main */}
      <div className="relative z-10 shrink-0 border-b border-line bg-surface">
        <div
          className={isPage ? 'mx-auto w-full max-w-5xl px-6 py-2' : 'px-4 py-2'}
        >
          <ModelSelector
            settings={settings}
            models={models}
            modelsLoading={modelsLoading}
            modelsError={modelsError}
            openaiModelDraft={openaiModelDraft}
            disabled={controlsDisabled}
            onProviderChange={(next) => void handleProviderChange(next)}
            onOllamaModelChange={(next) => void handleOllamaModelChange(next)}
            onOpenaiModelDraftChange={setOpenaiModelDraft}
            onOpenaiModelCommit={(next) => void handleOpenaiModelCommit(next)}
            onRefresh={() => void refreshModels()}
            onOpenSettings={() => void handleOpenSettings()}
          />
        </div>
      </div>

      {/* 全页用下划线 Tab；侧栏用紧凑 segmented（surface-2 底 + 活动项白底） */}
      <nav
        className={
          isPage
            ? 'mx-auto w-full max-w-5xl shrink-0 px-6'
            : 'shrink-0 px-4 pt-3'
        }
      >
        {isPage ? (
          <div
            className="flex gap-6 border-b border-line"
            role="tablist"
            aria-label="模块"
          >
            {MODULE_TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`-mb-px border-b-2 px-0.5 pb-2.5 pt-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
                  tab === id
                    ? 'border-accent text-ink'
                    : 'border-transparent text-ink-2 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div
            className="flex gap-1 rounded-control bg-surface-2 p-1"
            role="tablist"
            aria-label="模块"
          >
            {MODULE_TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex-1 rounded-[7px] px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
                  tab === id
                    ? 'bg-surface text-ink shadow-card'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </nav>

      <main
        id="main-content"
        tabIndex={-1}
        className={
          (isPage
            ? 'mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-5'
            : 'flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4') +
          ' focus-visible:outline-none'
        }
      >
        {pendingExpiredHint && surface === 'sidepanel' && (
          <div
            role="status"
            className="shrink-0 rounded-control border border-warn/20 bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn"
          >
            {pendingExpiredHint}
          </div>
        )}

        {tab === 'translate' && (
          <div
            className={
              isPage
                ? 'flex min-h-0 flex-1 flex-col gap-4'
                : 'flex min-h-0 flex-1 flex-col gap-3 overflow-hidden'
            }
          >
            {/* 沉浸式全文翻译：只在侧栏提供入口（全页工作台自身不是网页标签页，无法承载该指令） */}
            {surface === 'sidepanel' && <ImmersiveControl />}

            {/* 语言 / 原文 / 译文合并为一张卡：内部用 1px 发丝线分隔 */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition focus-within:ring-2 focus-within:ring-accent/15">
              <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
                <span className="w-8 shrink-0 text-label font-semibold text-ink-2">
                  语言
                </span>
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

              <div
                className={
                  isPage
                    ? 'grid min-h-0 flex-1 grid-rows-2 divide-y divide-line lg:grid-cols-2 lg:grid-rows-1 lg:divide-x lg:divide-y-0'
                    : 'flex min-h-0 flex-1 flex-col divide-y divide-line overflow-y-auto'
                }
              >
                <div
                  className={
                    isPage
                      ? 'flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3'
                      : 'flex shrink-0 flex-col px-3 pb-3 pt-3'
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="translate-source"
                      className="text-label font-semibold text-ink-2"
                    >
                      原文
                    </label>
                    <span className="text-meta tabular-nums text-ink-2">
                      {sourceText.length > 0 ? `${sourceText.length} 字符` : ''}
                    </span>
                  </div>
                  <textarea
                    id="translate-source"
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    placeholder="在网页划词，或在此粘贴文本…"
                    className={
                      'mt-1 w-full resize-none border-0 bg-transparent p-0 text-body leading-[22px] text-ink outline-none placeholder:text-ink-2 focus-visible:outline-none ' +
                      (isPage
                        ? 'min-h-[6rem] flex-1'
                        : 'h-[7rem] flex-none')
                    }
                  />
                  {!sourceText && !loading && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-meta text-ink-2">
                      <button
                        type="button"
                        onClick={() => void handlePaste()}
                        className="inline-flex h-7 items-center rounded-chip border border-line bg-surface-2 px-2 text-label font-semibold text-ink-2 transition hover:text-ink"
                      >
                        粘贴文本
                      </button>
                      <span>
                        或按{' '}
                        <kbd className="rounded border border-line bg-surface-2 px-1 font-sans text-[10px] text-ink-2">
                          Alt
                        </kbd>{' '}
                        +{' '}
                        <kbd className="rounded border border-line bg-surface-2 px-1 font-sans text-[10px] text-ink-2">
                          K
                        </kbd>{' '}
                        划词
                      </span>
                    </div>
                  )}
                </div>

                <div
                  className={
                    isPage
                      ? 'flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3'
                      : 'flex min-h-[7rem] flex-1 flex-col px-3 pb-3 pt-3'
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="translate-result"
                      className="text-label font-semibold text-ink-2"
                    >
                      译文
                    </label>
                    <button
                      type="button"
                      disabled={!translatedText}
                      onClick={() => void handleCopy()}
                      className="rounded-chip px-2 py-1 text-label font-semibold text-ink-2 transition hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {copied ? '已复制' : '复制译文'}
                    </button>
                  </div>
                  <textarea
                    id="translate-result"
                    value={translatedText}
                    readOnly
                    aria-label="译文"
                    placeholder={loading ? '正在生成…' : '译文将显示在这里'}
                    className={
                      'mt-1 w-full resize-none border-0 bg-transparent p-0 text-reading text-ink outline-none placeholder:text-ink-2 focus-visible:outline-none ' +
                      (isPage ? 'min-h-[6rem] flex-1' : 'min-h-[7rem] flex-1')
                    }
                  />
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  data-testid="translate-error"
                  className="mx-3 mb-2 shrink-0 rounded-chip border border-danger/20 bg-danger-soft px-2.5 py-1.5 text-label leading-relaxed text-danger"
                >
                  {error}
                </div>
              )}

              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-3 py-2">
                <p className="min-w-0 truncate text-meta text-ink-2">
                  {loading
                    ? '正在生成…'
                    : translatedText
                      ? '译文可复制'
                      : '在网页中划词，或按 Alt+K 快速翻译'}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  {loading ? (
                    <button
                      type="button"
                      onClick={handleStop}
                      className={`inline-flex ${actionHeight} items-center justify-center rounded-control border border-line bg-surface px-4 text-body-strong text-ink-2 transition hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30`}
                    >
                      停止
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleTranslate()}
                      className={`inline-flex ${actionHeight} items-center justify-center rounded-control bg-accent px-4 text-body-strong text-on-accent transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50`}
                    >
                      翻译
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 常驻挂载、非当前 Tab 时 hidden：切走再回来不丢内存态 */}
        <div
          className={
            tab === 'chat' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'
          }
        >
          <ChatPanel
            surface={surface}
            pendingAction={pendingChatAction}
            onPendingHandled={clearPendingChatAction}
          />
        </div>
        <div
          className={
            tab === 'agent' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'
          }
        >
          <AgentPanel
            surface={surface}
            pendingAction={pendingAgentAction}
            onPendingHandled={clearPendingAgentAction}
          />
        </div>
      </main>
    </div>
  );
}
