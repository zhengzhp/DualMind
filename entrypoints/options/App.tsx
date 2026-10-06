import { useEffect, useRef, useState } from 'react';
import { formatErrorForUi } from '@/shared/errors';
import { sendMessage } from '@/shared/messaging/client';
import {
  PROVIDER_HINT,
  PROVIDER_OPTIONS,
  TARGET_LANGUAGES,
  type AppSettings,
  type ImmersiveDisplayMode,
  type ImmersivePrefs,
  type ProviderType,
  type ToolbarTrigger,
} from '@/shared/storage/types';
import {
  SearchableSelect,
  SegmentedControl,
  fieldClass,
  getModelIconUrl,
  toModelOptions,
  type SegmentedControlOption,
} from '@/shared/ui';
import { diffSettings, parseHosts } from './diff';

/**
 * 与工作台相同的字标：`public/wordmark.svg` 底边≈基线，
 * 在 `items-baseline` 行里可直接与「设置」对齐。
 */
const WORDMARK_URL = browser.runtime.getURL('/wordmark.svg');

/** 划词工具栏触发方式：只有两个互斥选项，用分段控件比下拉更直观 */
const TOOLBAR_OPTIONS: SegmentedControlOption<ToolbarTrigger>[] = [
  { value: 'shortcut', label: '仅快捷键' },
  { value: 'auto', label: '选中后自动显示' },
];

/** 沉浸式译文展示模式（互斥二选一） */
const IMMERSIVE_MODE_OPTIONS: SegmentedControlOption<ImmersiveDisplayMode>[] = [
  { value: 'bilingual', label: '双语对照' },
  { value: 'translation-only', label: '仅译文' },
];

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [immersivePrefs, setImmersivePrefs] = useState<ImmersivePrefs | null>(
    null,
  );
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [disabledHostsText, setDisabledHostsText] = useState('');
  /** 不显示悬浮入口的站点（独立于 settings，由 textarea 维护；语义与禁用站点不同） */
  const [pageFabHiddenHostsText, setPageFabHiddenHostsText] = useState('');
  /**
   * 上次「已落盘」的设置快照。
   * Options 是「本地草稿 + 保存按钮」模式，草稿可能停留很久；保存时只提交
   * 相对本快照真正改动过的字段，避免用陈旧草稿整体覆盖用户在其他入口
   * （侧栏切换目标语言 / Provider）刚写入的值。
   */
  const baselineRef = useRef<AppSettings | null>(null);

  useEffect(() => {
    void (async () => {
      const [s, prefs] = await Promise.all([
        sendMessage('settings:get', undefined),
        sendMessage('immersive:prefs:get', undefined),
      ]);
      setSettings(s);
      baselineRef.current = s;
      setDisabledHostsText(s.disabledHosts.join('\n'));
      setPageFabHiddenHostsText(s.pageFabHiddenHosts.join('\n'));
      setImmersivePrefs(prefs);
    })();
  }, []);

  if (!settings || !immersivePrefs) {
    return (
      <div className="p-8 text-sm text-brand-700">加载设置中…</div>
    );
  }

  /**
   * 保存草稿：只把「相对上次已保存值有改动」的字段作为补丁提交。
   * `disabledHosts` / `pageFabHiddenHosts` 独立于 `settings` 状态（由 textarea 维护），
   * 一并参与比对。
   */
  async function persistDraft(draft: AppSettings | null = settings) {
    const baseline = baselineRef.current;
    if (!baseline || !draft) return;
    const patch = diffSettings(
      baseline,
      draft,
      parseHosts(disabledHostsText),
      parseHosts(pageFabHiddenHostsText),
    );

    setSaving(true);
    setError('');
    try {
      if (Object.keys(patch).length > 0) {
        const next = await sendMessage('settings:save', patch);
        baselineRef.current = next;
        setSettings(next);
      }
      setStatus('已保存');
      window.setTimeout(() => setStatus(''), 1500);
    } catch (err) {
      setError(formatErrorForUi(err));
    } finally {
      setSaving(false);
    }
  }

  async function persistImmersive(patch: Partial<ImmersivePrefs>) {
    setError('');
    try {
      const next = await sendMessage('immersive:prefs:save', patch);
      setImmersivePrefs(next);
      setStatus('已保存');
      window.setTimeout(() => setStatus(''), 1500);
    } catch (err) {
      setError(formatErrorForUi(err));
    }
  }

  async function handleTest() {
    if (!settings) return;
    setStatus('检测中…');
    setError('');
    // 先保存当前表单再测
    await persistDraft();
    try {
      const result = await sendMessage('provider:test', undefined);
      if (result.ok) {
        setStatus(result.detail || '连接成功');
      } else {
        setError(result.error || '连接失败');
        setStatus('');
      }
    } catch (err) {
      setError(formatErrorForUi(err));
      setStatus('');
    }
  }

  async function handleRefreshModels() {
    if (!settings) return;
    setStatus('拉取模型列表…');
    setError('');
    const snapshot = settings;
    await persistDraft();
    try {
      const { models: list } = await sendMessage(
        'provider:listModels',
        undefined,
      );
      setModels(list);
      setStatus(`已获取 ${list.length} 个模型`);
      // Ollama 若尚未选模型，自动选第一个（同样只提交增量）
      if (
        snapshot.providerType === 'ollama' &&
        !snapshot.ollama.model &&
        list[0]
      ) {
        const next = {
          ...snapshot,
          ollama: { ...snapshot.ollama, model: list[0] },
        };
        setSettings(next);
        await persistDraft(next);
      }
    } catch (err) {
      setError(formatErrorForUi(err));
      setStatus('');
    }
  }

  function updateProviderType(providerType: ProviderType) {
    if (!settings) return;
    setSettings({ ...settings, providerType });
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(100%_80%_at_10%_0%,#d9eeff_0%,#f4f7fb_50%,#e8eef5_100%)] px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <h1 className="flex items-baseline gap-2.5 text-2xl font-semibold tracking-tight text-brand-900">
            <img
              src={WORDMARK_URL}
              alt="DualMind"
              draggable={false}
              className="h-[22px] w-auto"
            />
            <span>设置</span>
          </h1>
          <p className="mt-1 text-sm text-brand-700/70">
            V1 为 BYOK 模式：请求直连你配置的 API 或本机 Ollama，不经过 DualMind
            服务器。
          </p>
        </header>

        <section className="space-y-5 rounded-2xl border border-brand-100 bg-white/80 p-5 shadow-sm backdrop-blur">
          <Field label="目标语言">
            <SearchableSelect
              value={settings.targetLanguage}
              options={TARGET_LANGUAGES}
              onChange={(targetLanguage) =>
                setSettings({ ...settings, targetLanguage })
              }
              // 固定短列表（10 项），滚动即可，不加搜索框更清爽
              searchable={false}
              testId="target-language"
            />
          </Field>

          <Field
            label="划词工具栏"
            hint="默认仅快捷键（Alt/Option+K）触发，避免选中即弹层打扰；快捷键可在 chrome://extensions/shortcuts 修改"
          >
            <SegmentedControl
              value={settings.toolbarTrigger}
              options={TOOLBAR_OPTIONS}
              onChange={(toolbarTrigger) =>
                setSettings({ ...settings, toolbarTrigger })
              }
              ariaLabel="划词工具栏"
            />
          </Field>

          <Field
            label="沉浸式全文翻译"
            hint="在网页正文中逐段对照展示译文；入口为页面右下角悬浮按钮或右键「翻译整页」"
          >
            <SegmentedControl
              value={immersivePrefs.displayMode}
              options={IMMERSIVE_MODE_OPTIONS}
              onChange={(displayMode) => void persistImmersive({ displayMode })}
              ariaLabel="沉浸式展示模式"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-brand-900">
            <input
              type="checkbox"
              checked={immersivePrefs.autoTranslate}
              onChange={(e) =>
                void persistImmersive({ autoTranslate: e.target.checked })
              }
            />
            打开网页后自动开始整页翻译
          </label>

          <Field
            label="禁用站点（每行一个 hostname）"
            hint="例如：mail.google.com。命中后该站点**整个扩展功能都不注入**（含划词翻译）"
          >
            <textarea
              value={disabledHostsText}
              onChange={(e) => setDisabledHostsText(e.target.value)}
              rows={3}
              className={`${fieldClass} font-mono text-xs`}
              placeholder={'example.com\nmail.google.com'}
            />
          </Field>

          <hr className="border-brand-50" />

          {/* 悬浮入口：与「禁用站点」区分开 —— 这里只关入口，不影响划词翻译 */}
          <label className="flex items-center gap-2 text-sm text-brand-900">
            <input
              type="checkbox"
              checked={settings.pageFabEnabled}
              onChange={(e) =>
                setSettings({ ...settings, pageFabEnabled: e.target.checked })
              }
            />
            显示页面悬浮按钮
          </label>

          <Field
            label="不显示悬浮按钮的站点（每行一个 hostname）"
            hint="例如：mail.google.com。只隐藏悬浮按钮，划词翻译照常可用"
          >
            <textarea
              value={pageFabHiddenHostsText}
              onChange={(e) => setPageFabHiddenHostsText(e.target.value)}
              rows={3}
              className={`${fieldClass} font-mono text-xs`}
              placeholder={'example.com\nmail.google.com'}
            />
          </Field>

          <hr className="border-brand-50" />

          <Field label="AI Provider">
            <SegmentedControl
              value={settings.providerType}
              options={PROVIDER_OPTIONS}
              onChange={updateProviderType}
              ariaLabel="AI Provider"
            />
            {/* 「OpenAI 兼容」不等于官方 API，这里显式说明覆盖范围 */}
            <span className="block pt-1.5 text-xs leading-relaxed text-brand-700/60">
              {PROVIDER_HINT}
            </span>
          </Field>

          {settings.providerType === 'ollama' ? (
            <>
              <Field
                label="Ollama Host"
                hint="默认 http://127.0.0.1:11434，请求由扩展后台发起"
              >
                <input
                  value={settings.ollama.host}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      ollama: { ...settings.ollama, host: e.target.value },
                    })
                  }
                  className={fieldClass}
                  placeholder="http://127.0.0.1:11434"
                />
              </Field>
              <Field label="模型">
                <div className="flex gap-2">
                  <SearchableSelect
                    value={settings.ollama.model}
                    // 合并当前已选与列表，避免刷新前丢失已选值；并补厂商图标便于辨认
                    options={toModelOptions(
                      Array.from(
                        new Set(
                          [settings.ollama.model, ...models].filter(Boolean),
                        ),
                      ),
                    )}
                    valueIcon={
                      getModelIconUrl(settings.ollama.model) ?? undefined
                    }
                    onChange={(model) =>
                      setSettings({
                        ...settings,
                        ollama: { ...settings.ollama, model },
                      })
                    }
                    placeholder="请选择模型"
                    emptyText="模型列表为空，点右侧「刷新列表」拉取"
                    testId="ollama-model-select"
                    className="min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => void handleRefreshModels()}
                    className="rounded-xl border border-brand-100 bg-white px-3 text-sm font-medium text-brand-700 hover:bg-brand-50"
                  >
                    刷新列表
                  </button>
                </div>
              </Field>
            </>
          ) : (
            <>
              <Field label="Base URL" hint="需包含 /v1，例如 https://api.openai.com/v1">
                <input
                  value={settings.openai.baseUrl}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      openai: { ...settings.openai, baseUrl: e.target.value },
                    })
                  }
                  className={fieldClass}
                />
              </Field>
              <Field label="API Key">
                <input
                  type="password"
                  autoComplete="off"
                  value={settings.openai.apiKey}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      openai: { ...settings.openai, apiKey: e.target.value },
                    })
                  }
                  className={fieldClass}
                  placeholder="sk-..."
                />
              </Field>
              <Field label="模型">
                <div className="flex gap-2">
                  <SearchableSelect
                    editable
                    value={settings.openai.model}
                    options={toModelOptions(models)}
                    valueIcon={
                      getModelIconUrl(settings.openai.model) ?? undefined
                    }
                    onChange={(model) =>
                      setSettings({
                        ...settings,
                        openai: { ...settings.openai, model },
                      })
                    }
                    placeholder="gpt-4o-mini"
                    emptyText="暂无候选模型，点右侧「拉取模型」"
                    testId="openai-model-input"
                    className="min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => void handleRefreshModels()}
                    className="rounded-xl border border-brand-100 bg-white px-3 text-sm font-medium text-brand-700 hover:bg-brand-50"
                  >
                    拉取模型
                  </button>
                </div>
              </Field>
            </>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void persistDraft()}
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {saving ? '保存中…' : '保存设置'}
            </button>
            <button
              type="button"
              onClick={() => void handleTest()}
              className="rounded-xl border border-brand-100 bg-white px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              检测连接
            </button>
            {status && (
              <span className="text-xs text-brand-600">{status}</span>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-brand-900">{label}</span>
      {hint && <span className="block text-xs text-brand-700/60">{hint}</span>}
      {children}
    </label>
  );
}

// diffSettings / parseHosts 抽到 ./diff，便于脱离 React / DOM 做单测
