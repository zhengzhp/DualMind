import { useCallback, useEffect, useRef, useState } from 'react';
import { formatErrorForUi } from '@/shared/errors';
import { sendMessage } from '@/shared/messaging/client';
import { streamTranslate } from '@/shared/messaging/stream';
import type { TranslateSession } from '@/shared/storage/settings';
import {
  TARGET_LANGUAGES,
  type AppSettings,
  type ProviderType,
} from '@/shared/storage/types';

type ModuleTab = 'translate' | 'chat' | 'agent';

/** 复制成功提示的展示时长（毫秒） */
const COPY_HINT_MS = 1500;

const PROVIDER_OPTIONS: { id: ProviderType; label: string }[] = [
  { id: 'ollama', label: 'Ollama' },
  { id: 'openai-compatible', label: 'OpenAI Compatible' },
];

export default function App() {
  const [tab, setTab] = useState<ModuleTab>('translate');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [session, setSession] = useState<TranslateSession | null>(null);
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
  /** 刚刚复制成功（复制按钮短暂切换文案） */
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const [s, sess] = await Promise.all([
      sendMessage('settings:get', undefined),
      sendMessage('session:get', undefined),
    ]);
    setSettings(s);
    setOpenaiModelDraft(s.openai.model);
    setTargetLanguage(s.targetLanguage);
    setSession(sess);
    if (sess) {
      setSourceText(sess.sourceText);
      // 本地正在流式时，以本地状态为准，避免 storage 回写打断
      if (!abortRef.current) {
        setTranslatedText(sess.translatedText);
      }
      setTargetLanguage(sess.targetLanguage);
      if (sess.error && !abortRef.current) setError(sess.error);
    }
  }, []);

  /** 按当前已保存 Provider 拉取模型列表 */
  const refreshModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError('');
    try {
      const { models: list } = await sendMessage(
        'provider:listModels',
        undefined,
      );
      setModels(list);
      // Ollama 尚未选模型时自动选第一个
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

  /** 监听 session 变化（划词翻译后 Side Panel 自动更新） */
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
    setCopied(false); // 新一轮翻译，清掉上一轮的「已复制」提示

    try {
      const result = await streamTranslate({
        text,
        targetLanguage,
        signal: controller.signal,
        onChunk: (accumulated) => setTranslatedText(accumulated),
      });
      setTranslatedText(result.translatedText);
      setSourceText(result.sourceText);
      setSession({
        ...result,
        updatedAt: Date.now(),
      });
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
      // 连点复制时重置计时，避免「已复制」提前消失
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

  async function handleOpenaiModelBlur() {
    if (!settings || loading) return;
    const model = openaiModelDraft.trim();
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

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(120%_80%_at_0%_0%,#d9eeff_0%,#f4f7fb_45%,#eef2f7_100%)]">
      <header className="border-b border-brand-100/80 bg-white/70 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-brand-900">
              DualMind
            </h1>
            <p className="text-xs text-brand-700/70">AI 助手 · 翻译工作台</p>
          </div>
          <button
            type="button"
            onClick={() => void openOptionsAndClosePanel()}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
          >
            设置
          </button>
        </div>

        <nav className="mt-3 flex gap-1">
          {(
            [
              ['translate', '翻译'],
              ['chat', '聊天'],
              ['agent', 'Agent'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === id
                  ? 'bg-brand-500 text-white'
                  : 'text-brand-700/80 hover:bg-white/80'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex flex-1 flex-col gap-3 p-4">
        {tab === 'translate' && (
          <>
            {/* 快速切换：Provider / 模型 / 目标语言 */}
            <div className="flex flex-col gap-2 rounded-xl border border-brand-100/80 bg-white/70 p-3">
              <div className="flex items-center gap-2">
                <label className="w-14 shrink-0 text-xs font-medium text-brand-700">
                  Provider
                </label>
                <select
                  value={settings?.providerType ?? 'ollama'}
                  disabled={!settings || controlsDisabled}
                  onChange={(e) =>
                    void handleProviderChange(e.target.value as ProviderType)
                  }
                  className="flex-1 rounded-lg border border-brand-100 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 disabled:opacity-50"
                >
                  {PROVIDER_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="w-14 shrink-0 text-xs font-medium text-brand-700">
                  模型
                </label>
                {settings?.providerType === 'ollama' ? (
                  <select
                    value={currentModel}
                    disabled={!settings || controlsDisabled || modelsLoading}
                    onChange={(e) =>
                      void handleOllamaModelChange(e.target.value)
                    }
                    className="min-w-0 flex-1 rounded-lg border border-brand-100 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 disabled:opacity-50"
                  >
                    <option value="">请选择模型</option>
                    {Array.from(
                      new Set([currentModel, ...models].filter(Boolean)),
                    ).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      value={openaiModelDraft}
                      disabled={!settings || controlsDisabled}
                      onChange={(e) => setOpenaiModelDraft(e.target.value)}
                      onBlur={() => void handleOpenaiModelBlur()}
                      list="sidepanel-openai-models"
                      placeholder="gpt-4o-mini"
                      className="min-w-0 flex-1 rounded-lg border border-brand-100 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 disabled:opacity-50"
                    />
                    <datalist id="sidepanel-openai-models">
                      {models.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </>
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
                <select
                  value={targetLanguage}
                  disabled={controlsDisabled}
                  data-testid="target-language"
                  onChange={(e) => void handleTargetChange(e.target.value)}
                  className="flex-1 rounded-lg border border-brand-100 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 disabled:opacity-50"
                >
                  {TARGET_LANGUAGES.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              {(modelsError || modelHint) && (
                <p className="text-[11px] leading-relaxed text-brand-700/70">
                  {modelsError ? (
                    <span className="text-red-600">{modelsError}</span>
                  ) : (
                    modelHint
                  )}
                  {modelsError || modelHint ? (
                    <>
                      {' '}
                      <a
                        href={browser.runtime.getURL('/options.html')}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-brand-600 underline-offset-2 hover:underline"
                      >
                        去设置
                      </a>
                    </>
                  ) : null}
                </p>
              )}
            </div>

            <label className="block text-xs font-medium text-brand-700">
              原文
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={6}
                placeholder="在网页划词，或在此粘贴文本…"
                className="mt-1 w-full resize-y rounded-xl border border-brand-100 bg-white/90 p-3 text-sm leading-relaxed outline-none focus:border-brand-500"
              />
            </label>

            <div className="flex gap-2">
              {loading ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="flex-1 rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
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

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <label className="block text-xs font-medium text-brand-700">
              译文
              <textarea
                value={translatedText}
                readOnly
                rows={8}
                placeholder={loading ? '正在生成…' : '译文将显示在这里'}
                className="mt-1 w-full resize-y rounded-xl border border-brand-100 bg-white p-3 text-sm leading-relaxed text-brand-900 outline-none"
              />
            </label>
          </>
        )}

        {tab === 'chat' && (
          <Placeholder
            title="聊天（即将推出）"
            desc="后续将复用同一 Provider，在侧边栏进行多轮对话与网页问答。"
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

/**
 * 收起当前侧栏：优先用 sidePanel.close（更可靠），
 * 旧版本无 close 时回退 window.close（main.tsx 的 close-self 路径同款）。
 */
async function closeSelf(): Promise<void> {
  const api = (
    browser as typeof browser & {
      sidePanel?: { close?: (o: { windowId: number }) => Promise<void> };
    }
  ).sidePanel;
  try {
    if (api?.close) {
      await api.close({ windowId: browser.windows.WINDOW_ID_CURRENT });
      return;
    }
  } catch {
    /* 旧版本不支持 close：走 window.close 回退 */
  }
  window.close();
}

/**
 * 打开设置页并收起侧栏。
 * 顺序不能反：关掉面板后本页上下文即销毁，后续代码不会再执行。
 */
async function openOptionsAndClosePanel(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
  await closeSelf();
}

function Placeholder({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-brand-100 bg-white/60 p-6 text-center">
      <h2 className="text-sm font-semibold text-brand-900">{title}</h2>
      <p className="mt-2 text-xs leading-relaxed text-brand-700/70">{desc}</p>
    </div>
  );
}
