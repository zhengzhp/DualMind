import { useCallback, useEffect, useState } from 'react';
import { sendMessage } from '@/shared/messaging/client';
import type { TranslateSession } from '@/shared/storage/settings';
import {
  TARGET_LANGUAGES,
  type AppSettings,
} from '@/shared/storage/types';

type ModuleTab = 'translate' | 'chat' | 'agent';

export default function App() {
  const [tab, setTab] = useState<ModuleTab>('translate');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [session, setSession] = useState<TranslateSession | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('zh-CN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [s, sess] = await Promise.all([
      sendMessage('settings:get', undefined),
      sendMessage('session:get', undefined),
    ]);
    setSettings(s);
    setTargetLanguage(s.targetLanguage);
    setSession(sess);
    if (sess) {
      setSourceText(sess.sourceText);
      setTranslatedText(sess.translatedText);
      setTargetLanguage(sess.targetLanguage);
      if (sess.error) setError(sess.error);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unwatch = storageWatch();
    return unwatch;
  }, [refresh]);

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
    setLoading(true);
    setError('');
    try {
      const result = await sendMessage('translate:run', {
        text,
        targetLanguage,
      });
      setTranslatedText(result.translatedText);
      setSourceText(result.sourceText);
      setSession({
        ...result,
        updatedAt: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!translatedText) return;
    await navigator.clipboard.writeText(translatedText).catch(() => {});
  }

  async function handleTargetChange(next: string) {
    setTargetLanguage(next);
    await sendMessage('settings:save', { targetLanguage: next }).catch(() => {});
  }

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
          <a
            href={browser.runtime.getURL('/options.html')}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
          >
            设置
          </a>
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
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-brand-700">
                目标语言
              </label>
              <select
                value={targetLanguage}
                onChange={(e) => void handleTargetChange(e.target.value)}
                className="flex-1 rounded-lg border border-brand-100 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              >
                {TARGET_LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
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
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleTranslate()}
                className="flex-1 rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
              >
                {loading ? '翻译中…' : '翻译'}
              </button>
              <button
                type="button"
                disabled={!translatedText}
                onClick={() => void handleCopy()}
                className="rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
              >
                复制译文
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
                placeholder="译文将显示在这里"
                className="mt-1 w-full resize-y rounded-xl border border-brand-100 bg-white p-3 text-sm leading-relaxed text-brand-900 outline-none"
              />
            </label>

            {settings && (
              <p className="text-[11px] text-brand-700/60">
                当前 Provider：
                {settings.providerType === 'ollama'
                  ? `Ollama (${settings.ollama.model || '未选模型'})`
                  : `OpenAI Compatible (${settings.openai.model || '未填模型'})`}
              </p>
            )}
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

function Placeholder({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-brand-100 bg-white/60 p-6 text-center">
      <h2 className="text-sm font-semibold text-brand-900">{title}</h2>
      <p className="mt-2 text-xs leading-relaxed text-brand-700/70">{desc}</p>
    </div>
  );
}
