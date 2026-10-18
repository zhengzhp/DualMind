import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatErrorForUi } from '@/shared/errors';
import { sendMessage } from '@/shared/messaging/client';
import {
  PROVIDER_HINT,
  PROVIDER_OPTIONS,
  TARGET_LANGUAGES,
  type AgentPrefs,
  type AppSettings,
  type ImmersiveDisplayMode,
  type ImmersivePrefs,
  type ProviderType,
  type ToolbarTrigger,
} from '@/shared/storage/types';
import {
  SearchableSelect,
  SegmentedControl,
  Wordmark,
  fieldClass,
  getModelIconUrl,
  toModelOptions,
  type SegmentedControlOption,
} from '@/shared/ui';
import { applyTheme } from '@/shared/ui/theme';
import {
  getUiTheme,
  saveUiTheme,
  type UiTheme,
} from '@/shared/storage/uiTheme';
import { diffSettings, parseHosts } from './diff';

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

/** 外观偏好三选一 */
const THEME_OPTIONS: SegmentedControlOption<UiTheme>[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

/** 设置页左侧分区导航（P4） */
const SETTINGS_SECTIONS = [
  { id: 'settings-translate', label: '翻译' },
  { id: 'settings-sites', label: '站点' },
  { id: 'settings-model', label: '模型' },
  { id: 'settings-agent', label: '本页 Agent' },
  { id: 'settings-appearance', label: '外观' },
  { id: 'settings-about', label: '关于' },
] as const;

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [immersivePrefs, setImmersivePrefs] = useState<ImmersivePrefs | null>(
    null,
  );
  /** V3 本页 Agent 偏好：独立 storage 键，改动即时保存（无草稿） */
  const [agentPrefs, setAgentPrefs] = useState<AgentPrefs | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [disabledHostsText, setDisabledHostsText] = useState('');
  /** 不显示悬浮入口的站点（独立于 settings，由 textarea 维护；语义与禁用站点不同） */
  const [pageFabHiddenHostsText, setPageFabHiddenHostsText] = useState('');
  /** 外观偏好：独立 storage 键，切换即时生效 */
  const [uiTheme, setUiTheme] = useState<UiTheme>('system');
  /** 设置页左侧导航的当前分区 */
  const [activeSection, setActiveSection] = useState<string>(
    SETTINGS_SECTIONS[0].id,
  );
  /**
   * 上次「已落盘」的设置快照。
   * Options 是「本地草稿 + 保存按钮」模式，草稿可能停留很久；保存时只提交
   * 相对本快照真正改动过的字段，避免用陈旧草稿整体覆盖用户在其他入口
   * （侧栏切换目标语言 / Provider）刚写入的值。
   */
  const baselineRef = useRef<AppSettings | null>(null);

  useEffect(() => {
    void (async () => {
      const [s, prefs, agent, theme] = await Promise.all([
        sendMessage('settings:get', undefined),
        sendMessage('immersive:prefs:get', undefined),
        sendMessage('agent:prefs:get', undefined),
        getUiTheme(),
      ]);
      setSettings(s);
      baselineRef.current = s;
      setDisabledHostsText(s.disabledHosts.join('\n'));
      setPageFabHiddenHostsText(s.pageFabHiddenHosts.join('\n'));
      setImmersivePrefs(prefs);
      setAgentPrefs(agent);
      setUiTheme(theme);
    })();
  }, []);

  // 左侧导航高亮：滚动时取当前视口内最靠上的分区
  useEffect(() => {
    if (!settings) return undefined;
    const elements = SETTINGS_SECTIONS.map((section) =>
      document.getElementById(section.id),
    ).filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: '-15% 0px -65% 0px', threshold: [0, 0.1, 0.5] },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [settings]);

  if (!settings || !immersivePrefs || !agentPrefs) {
    return (
      <div className="min-h-screen bg-canvas p-8 text-body text-ink-2">
        加载设置中…
      </div>
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

  /** Agent 偏好即时保存（与 immersivePrefs 一致，不走「保存设置」草稿） */
  async function persistAgentPrefs(patch: Partial<AgentPrefs>) {
    setError('');
    try {
      const next = await sendMessage('agent:prefs:save', patch);
      setAgentPrefs(next);
      setStatus('已保存');
      window.setTimeout(() => setStatus(''), 1500);
    } catch (err) {
      setError(formatErrorForUi(err));
    }
  }

  /** 外观偏好即时保存并立即生效 */
  async function handleTheme(next: UiTheme) {
    setUiTheme(next);
    applyTheme(next);
    setError('');
    try {
      await saveUiTheme(next);
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
    <div className="min-h-screen bg-canvas px-4 py-8 text-ink">
      {/* 键盘 / 屏幕阅读器：跳过头部直接到设置分区（与工作台一致） */}
      <a
        href="#settings-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2 focus:text-label focus:font-semibold focus:text-ink focus:shadow-popover"
      >
        跳到主内容
      </a>
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-baseline gap-2.5 text-2xl font-semibold tracking-tight text-ink">
              <Wordmark className="h-[22px] w-auto" />
              <span className="text-ink-2">设置</span>
            </h1>
            <p className="mt-1 text-body text-ink-2">
              BYOK 模式：请求直连你配置的 API 或本机 Ollama，不经过 DualMind
              服务器。
            </p>
          </div>
          <span className="hidden shrink-0 rounded-chip border border-line bg-surface px-2 py-1 text-meta text-ink-2 sm:inline">
            v{browser.runtime.getManifest().version}
          </span>
        </header>

        <main
          id="settings-main"
          tabIndex={-1}
          className="flex gap-6 focus-visible:outline-none"
        >
          <aside className="hidden w-44 shrink-0 md:block">
            <nav aria-label="设置分区" className="sticky top-8 space-y-1">
              <p className="px-3 pb-2 text-meta font-semibold text-ink-2">
                设置分区
              </p>
              {SETTINGS_SECTIONS.map((section) => {
                const active = activeSection === section.id;
                return (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    onClick={() => setActiveSection(section.id)}
                    aria-current={active ? 'location' : undefined}
                    className={
                      'block rounded-control px-3 py-2 text-label font-semibold transition ' +
                      (active
                        ? 'bg-accent-soft text-accent shadow-card'
                        : 'text-ink-2 hover:bg-surface-2 hover:text-ink')
                    }
                  >
                    {section.label}
                  </a>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 flex-1">
            <div className="space-y-4">
          <Section
            id="settings-translate"
            title="翻译"
            desc="默认仅快捷键触发划词；整页翻译由页面右下角悬浮入口或右键菜单发起。"
          >
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

            <CheckboxRow
              checked={immersivePrefs.autoTranslate}
              onChange={(checked) =>
                void persistImmersive({ autoTranslate: checked })
              }
            >
              打开网页后自动开始整页翻译
            </CheckboxRow>
          </Section>

          <Section
            id="settings-sites"
            title="站点"
            desc="禁用站点会关掉整个扩展能力；悬浮按钮的隐藏只影响入口，划词翻译照常可用。"
          >
            <Field
              label="禁用站点（每行一个 hostname）"
              hint="例如：mail.google.com。命中后该站点整个扩展功能都不注入（含划词翻译）"
            >
              <textarea
                value={disabledHostsText}
                onChange={(e) => setDisabledHostsText(e.target.value)}
                rows={3}
                className={fieldClass + ' font-mono text-xs'}
                placeholder={'example.com\nmail.google.com'}
              />
            </Field>

            <CheckboxRow
              checked={settings.pageFabEnabled}
              onChange={(checked) =>
                setSettings({ ...settings, pageFabEnabled: checked })
              }
            >
              显示页面悬浮按钮
            </CheckboxRow>

            <Field
              label="不显示悬浮按钮的站点（每行一个 hostname）"
              hint="例如：mail.google.com。只隐藏悬浮按钮，划词翻译照常可用"
            >
              <textarea
                value={pageFabHiddenHostsText}
                onChange={(e) => setPageFabHiddenHostsText(e.target.value)}
                rows={3}
                className={fieldClass + ' font-mono text-xs'}
                placeholder={'example.com\nmail.google.com'}
              />
            </Field>
          </Section>

          <Section
            id="settings-model"
            title="模型"
            desc="模型请求只由扩展后台发起；内容脚本不持有 API Key。"
          >
            <Field label="AI Provider">
              <SegmentedControl
                value={settings.providerType}
                options={PROVIDER_OPTIONS}
                onChange={updateProviderType}
                ariaLabel="AI Provider"
              />
              {/* 「OpenAI 兼容」不等于官方 API，这里显式说明覆盖范围 */}
              <span className="mt-1 mb-1 block text-meta leading-relaxed text-ink-2">
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
                      className="inline-flex h-10 shrink-0 items-center rounded-control border border-line bg-surface px-3 text-body-strong text-ink-2 transition hover:bg-surface-2 hover:text-ink"
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
                      className="inline-flex h-10 shrink-0 items-center rounded-control border border-line bg-surface px-3 text-body-strong text-ink-2 transition hover:bg-surface-2 hover:text-ink"
                    >
                      拉取模型
                    </button>
                  </div>
                </Field>
              </>
            )}
          </Section>

          <Section
            id="settings-agent"
            title="本页 Agent"
            desc="确认策略固定为「计划批准 + 危险动作再确认」，不提供降级开关。"
          >
            <CheckboxRow
              checked={agentPrefs.enabled}
              onChange={(checked) => void persistAgentPrefs({ enabled: checked })}
            >
              启用本页操作 Agent
            </CheckboxRow>

            <Field
              label="单任务最大步数"
              hint="模型往返轮次上限，1～40；步数越多越可能完成复杂目标，也越慢、越费 token"
            >
              {/* 失焦时落盘；Background 侧会把值夹到 1～40 并回传修正值 */}
              <input
                type="number"
                min={1}
                max={40}
                value={agentPrefs.maxSteps}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  setAgentPrefs({ ...agentPrefs, maxSteps: Math.trunc(n) });
                }}
                onBlur={() =>
                  void persistAgentPrefs({ maxSteps: agentPrefs.maxSteps })
                }
                className={fieldClass}
                data-testid="agent-max-steps"
              />
            </Field>

            <p className="text-meta leading-relaxed text-ink-2">
              需使用<b className="font-semibold text-ink-2">支持 tool calling</b>{' '}
              的模型（Ollama / OpenAI 兼容）。Agent 会先在侧栏展示计划，经你批准后才操作本页；
              提交 / 删除等危险动作执行前会再次确认，支付 / 转账类动作一律拒绝自动执行。不支持
              Shadow DOM 与跨域 iframe。
            </p>
          </Section>

          <Section
            id="settings-appearance"
            title="外观"
            desc="扩展页面与内容脚本共用一套语义 token；深色按 WCAG 重新取色，不靠反色。"
          >
            <Field label="主题">
              <SegmentedControl
                value={uiTheme}
                options={THEME_OPTIONS}
                onChange={(next) => void handleTheme(next)}
                ariaLabel="外观主题"
              />
              <span className="mt-1 block text-meta leading-relaxed text-ink-2">
                内容脚本跟随这里的选择；沉浸译正文另按系统深色适配宿主页面。
              </span>
            </Field>
          </Section>

          <Section id="settings-about" title="关于">
            <p className="text-meta leading-relaxed text-ink-2">
              设置只保存在本机浏览器存储；API Key 仅由扩展后台读取，内容脚本不持有。
              本扩展无自有后端、无遥测。
            </p>
          </Section>
        </div>

        <div className="sticky bottom-0 z-10 mt-4 border-t border-line bg-canvas/95 py-3 backdrop-blur sm:rounded-card sm:border sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void persistDraft()}
              className="inline-flex h-10 items-center rounded-control bg-accent px-4 text-body-strong text-on-accent transition hover:bg-accent-hover disabled:opacity-60"
            >
              {saving ? '保存中…' : '保存设置'}
            </button>
            <button
              type="button"
              onClick={() => void handleTest()}
              className="inline-flex h-10 items-center rounded-control border border-line bg-surface px-4 text-body-strong text-ink-2 transition hover:bg-surface-2 hover:text-ink"
            >
              检测连接
            </button>
            {status && <span className="text-meta text-ink-2">{status}</span>}
          </div>

          {error && (
            <div
              data-testid="options-error"
              className="mt-2 rounded-control border border-danger/20 bg-danger-soft px-3 py-2 text-label text-danger"
            >
              {error}
            </div>
          )}
        </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  desc,
  children,
}: {
  id: string;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 rounded-card border border-line bg-surface p-5 shadow-card"
    >
      <div className="mb-4">
        <h2 className="text-title text-ink">{title}</h2>
        {desc && (
          <p className="mt-0.5 text-meta leading-relaxed text-ink-2">{desc}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-label font-semibold text-ink">{label}</span>
      {hint && (
        <span className="block text-meta leading-relaxed text-ink-2">
          {hint}
        </span>
      )}
      {children}
    </label>
  );
}

function CheckboxRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-body text-ink">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 accent-accent"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

// diffSettings / parseHosts 抽到 ./diff，便于脱离 React / DOM 做单测
