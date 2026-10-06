import { useEffect, useState } from 'react';
import { formatErrorForUi } from '@/shared/errors';
import { sendMessage } from '@/shared/messaging/client';
import {
  TARGET_LANGUAGES,
  type AppSettings,
  type ProviderType,
  type ToolbarTrigger,
} from '@/shared/storage/types';
import {
  SearchableSelect,
  SegmentedControl,
  fieldClass,
  type SegmentedControlOption,
} from '@/shared/ui';

/** 划词工具栏触发方式：只有两个互斥选项，用分段控件比下拉更直观 */
const TOOLBAR_OPTIONS: SegmentedControlOption<ToolbarTrigger>[] = [
  { value: 'shortcut', label: '仅快捷键' },
  { value: 'auto', label: '选中后自动显示' },
];

/** Provider 同样二选一 → 分段控件 */
const PROVIDER_OPTIONS: SegmentedControlOption<ProviderType>[] = [
  { value: 'ollama', label: 'Ollama（本地）' },
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
];

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [disabledHostsText, setDisabledHostsText] = useState('');

  useEffect(() => {
    void (async () => {
      const s = await sendMessage('settings:get', undefined);
      setSettings(s);
      setDisabledHostsText(s.disabledHosts.join('\n'));
    })();
  }, []);

  if (!settings) {
    return (
      <div className="p-8 text-sm text-brand-700">加载设置中…</div>
    );
  }

  async function persist(patch: Partial<AppSettings>) {
    setSaving(true);
    setError('');
    try {
      const next = await sendMessage('settings:save', patch);
      setSettings(next);
      setStatus('已保存');
      window.setTimeout(() => setStatus(''), 1500);
    } catch (err) {
      setError(formatErrorForUi(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!settings) return;
    setStatus('检测中…');
    setError('');
    // 先保存当前表单再测
    await persist({
      ...settings,
      disabledHosts: parseHosts(disabledHostsText),
    });
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
    await persist({
      ...snapshot,
      disabledHosts: parseHosts(disabledHostsText),
    });
    try {
      const { models: list } = await sendMessage(
        'provider:listModels',
        undefined,
      );
      setModels(list);
      setStatus(`已获取 ${list.length} 个模型`);
      // Ollama 若尚未选模型，自动选第一个
      if (
        snapshot.providerType === 'ollama' &&
        !snapshot.ollama.model &&
        list[0]
      ) {
        const next = await sendMessage('settings:save', {
          ollama: { ...snapshot.ollama, model: list[0] },
        });
        setSettings(next);
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
          <h1 className="text-2xl font-semibold tracking-tight text-brand-900">
            DualMind 设置
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
            label="禁用站点（每行一个 hostname）"
            hint="例如：mail.google.com"
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

          <Field label="AI Provider">
            <SegmentedControl
              value={settings.providerType}
              options={PROVIDER_OPTIONS}
              onChange={updateProviderType}
              ariaLabel="AI Provider"
            />
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
                    // 合并当前已选与列表，避免刷新前丢失已选值
                    options={Array.from(
                      new Set(
                        [settings.ollama.model, ...models].filter(Boolean),
                      ),
                    )}
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
                    options={models}
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
              onClick={() =>
                void persist({
                  ...settings,
                  disabledHosts: parseHosts(disabledHostsText),
                })
              }
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

function parseHosts(text: string): string[] {
  return text
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}
