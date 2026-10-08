/**
 * E2E 共享 fixture
 * - 用 persistent context 加载 `wxt build` 产物（MV3 扩展仅在此模式下可用）
 * - 从 service worker 的 URL 动态解析扩展 ID（未在 manifest 配 key，ID 每次会变）
 * - 提供直接写底层 storage 的 helper，避免测试依赖 Options 页点选
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chromium,
  test as base,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import { MIGRATION_IDS } from '../shared/storage/migrations';
import { createMockLlm, type MockLlm, type MockStep } from './mock-llm';

const here = path.dirname(fileURLToPath(import.meta.url));

/** 扩展构建产物目录（由 `wxt build` 生成）。可用 `DM_EXTENSION_PATH` 指向最终发布包做 REL-04 冒烟；默认不变。 */
export const EXTENSION_PATH = process.env.DM_EXTENSION_PATH
  ? path.resolve(process.env.DM_EXTENSION_PATH)
  : path.resolve(here, '../.output/chrome-mv3');
/** 独立的浏览器 profile，避免污染真实浏览器数据 */
const USER_DATA_DIR = path.resolve(here, '../.e2e-profile');

/**
 * 是否使用有头窗口。默认**无头**（适合本地批量执行）；
 * 需要观察界面、或运行依赖真实窗口 UI 的用例（如真实 Side Panel）时设 `E2E_HEADED=1`。
 */
export const E2E_HEADED = process.env.E2E_HEADED === '1';

/** 本机 Ollama 配置（本套 E2E 依赖真实本地模型） */
export const OLLAMA_HOST = 'http://127.0.0.1:11434';
/**
 * 默认模型保持不变；Agent 相关用例需要**支持 tools** 的模型时可覆盖（ENV-05）。
 * 例：`DM_OLLAMA_MODEL=qwen3:4b pnpm test:e2e`。
 */
export const OLLAMA_MODEL = process.env.DM_OLLAMA_MODEL ?? 'qwen-coder-8k:latest';

/** service worker 上下文里的 chrome.storage 最小类型声明 */
interface ChromeStorageLocal {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
declare const chrome: { storage: { local: ChromeStorageLocal } };

export type ExtensionFixtures = {
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
};

export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    // 每个用例从干净 profile 起，避免 storage / service worker 互相污染
    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      // 默认无头；无头下必须走完整 Chromium 的新无头模式（channel: 'chromium'），
      // 否则 Playwright 默认用的 headless shell 不支持 --load-extension，扩展不会加载。
      headless: !E2E_HEADED,
      ...(E2E_HEADED ? {} : { channel: 'chromium' as const }),
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    // MV3 的 background 是 service worker，加载后需要等它启动
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(worker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

export const expect = test.expect;

/**
 * E2E 种子要一并写入的「已执行迁移」标记。
 *
 * 为什么必须写：种子里会刻意设置 `toolbarTrigger: 'auto'`，而产品迁移
 * （`toolbar-default-shortcut-v1`）会把存储里的 `auto` 改写成 `shortcut`，
 * 于是依赖「选中后自动显示」的用例永远拿不到浮层（回归见 2026-10-06）。
 *
 * 直接从 `MIGRATION_IDS` 派生，**新增迁移时无需再手工同步这里**；
 * 语义上也成立：种子写的是完整、权威的初始状态，不需要任何迁移再加工。
 */
const APPLIED_MIGRATIONS: string[] = Object.values(MIGRATION_IDS);

/**
 * 直接写扩展的底层 storage（等价于在 Options 页保存设置）。
 * WXT 的 `local:settings` 实际存在 `chrome.storage.local` 的 `settings` 键。
 */
export async function seedSettings(
  worker: Worker,
  patch: Record<string, unknown>,
): Promise<void> {
  await worker.evaluate(
    async ({ payload, applied }) => {
      const KEY = 'settings';
      const MIGRATIONS_KEY = 'migrations';

      const stored = await chrome.storage.local.get(KEY);
      const current = (stored[KEY] ?? {}) as Record<string, unknown>;
      // 嵌套的 openai / ollama 需要浅合并，避免覆盖掉未传的字段
      const merge = (a: unknown, b: unknown): Record<string, unknown> => ({
        ...((a ?? {}) as Record<string, unknown>),
        ...((b ?? {}) as Record<string, unknown>),
      });
      await chrome.storage.local.set({
        [KEY]: {
          ...current,
          ...payload,
          openai: merge(current.openai, payload.openai),
          ollama: merge(current.ollama, payload.ollama),
        },
        [MIGRATIONS_KEY]: applied,
      });
    },
    { payload: patch, applied: APPLIED_MIGRATIONS },
  );
}

/** 从 service worker 回读当前设置（用于断言 storage 是否真的落盘） */
export async function readSettings(
  worker: Worker,
): Promise<Record<string, unknown>> {
  return worker.evaluate(async () => {
    const stored = await chrome.storage.local.get('settings');
    return (stored.settings ?? {}) as Record<string, unknown>;
  });
}

/** 从 service worker 回读最近一次划词翻译会话（translateSession） */
export async function readSession(
  worker: Worker,
): Promise<Record<string, unknown> | null> {
  return worker.evaluate(async () => {
    const stored = await chrome.storage.local.get('translateSession');
    return (stored.translateSession ?? null) as Record<string, unknown> | null;
  });
}

/** 一份可用的 Ollama 基础设置 */
export const OLLAMA_SETTINGS: Record<string, unknown> = {
  providerType: 'ollama',
  targetLanguage: 'zh-CN',
  toolbarTrigger: 'auto',
  disabledHosts: [],
  ollama: { host: OLLAMA_HOST, model: OLLAMA_MODEL },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  },
};

/** E2E 用的一长段英文（够长，保证流式分多次到达） */
const LONG_ENGLISH_TEXT =
  'Artificial intelligence is reshaping how people work, learn and communicate. ' +
  'Modern language models can summarize long documents, translate between dozens of ' +
  'languages, and assist developers while they write code. However, these systems also ' +
  'raise important questions about privacy, accuracy and reliability, which is why tools ' +
  'that run locally on a personal computer are becoming increasingly attractive to users ' +
  'who care about where their data goes.';

/**
 * 在页面里造一段文本、选中它，并派发 capture 阶段的 mouseup，
 * 触发内容脚本的划词逻辑（见 features/selection-toolbar/mount.ts）。
 * 支持任意语言文本（英文 / 中文 / 混排）。
 *
 * 必须先等 `data-dm-toolbar-ready`：宿主元素可能早于 mouseup 监听出现，
 * 过早派发会导致「浮层未出现」flake（见 selection-toolbar Esc 用例）。
 */
export async function selectText(page: Page, text: string) {
  await page.waitForSelector('[data-dm-toolbar-ready="1"]', { timeout: 15_000 });

  await page.evaluate((content) => {
    let el = document.getElementById('dm-e2e-source') as HTMLParagraphElement | null;
    if (!el) {
      el = document.createElement('p');
      el.id = 'dm-e2e-source';
      document.body.appendChild(el);
    }
    el.textContent = content;

    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    // 内容脚本在 document 的捕获阶段监听 mouseup
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
  }, text);
}

/** 兼容旧用法：默认选中一段较长英文（保证流式分多次到达） */
export async function selectEnglishText(page: Page, text = LONG_ENGLISH_TEXT) {
  await selectText(page, text);
}

/* ==================================================================
 * V3 Agent 自动化夹具
 * 目标：把「只能人工」的 A 闸门用例（安全闸门层 / 错误注入 / 多轮纠错 /
 * 生命周期）变成可复现、可留证（trace + report）的自动化用例。
 * 详见 .cursor/plans/dualmind-agent-e2e-harness.plan.md
 * ================================================================== */

/** 封板测试页主站端口（与 e2e/pages/serve.mjs 一致） */
export const TEST_PAGES_PORT = Number(process.env.DM_PAGES_PORT ?? 4173);

/** 拼测试页 URL */
export function testPageUrl(pathname: string): string {
  return `http://127.0.0.1:${TEST_PAGES_PORT}${pathname}`;
}

let pagesProc: ChildProcess | null = null;

/**
 * 确保封板测试页静态服务器在跑（`e2e/pages/serve.mjs`）。
 * 只在本进程内起一次；进程退出时回收。`DM_SKIP_PAGES=1` 可跳过（便于外部自管）。
 */
export async function ensureTestPages(): Promise<void> {
  if (process.env.DM_SKIP_PAGES === '1') return;
  if (!pagesProc) {
    const entry = path.resolve(here, 'pages/serve.mjs');
    pagesProc = spawn(process.execPath, [entry], { stdio: 'ignore' });
    pagesProc.on('exit', () => {
      pagesProc = null;
    });
    process.once('exit', () => pagesProc?.kill());
  }
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(testPageUrl('/'));
      if (res.ok) return;
    } catch {
      /* 还没起来，继续轮询 */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('测试页服务器启动超时：请手动执行 `node e2e/pages/serve.mjs`');
}

/* ---------------- mock LLM（BYOK / OpenAI 兼容） ---------------- */

let mockLlm: MockLlm | null = null;

/** 惰性启动 mock 模型服务器（进程内单例，配合 `workers: 1` 串行） */
export async function ensureMockLlm(): Promise<MockLlm> {
  if (!mockLlm) mockLlm = createMockLlm();
  await mockLlm.start();
  return mockLlm;
}

/** 重设 mock 脚本并清空请求记录（每个用例开头调用） */
export async function resetMockLlm(script: MockStep[]): Promise<MockLlm> {
  const mock = await ensureMockLlm();
  mock.reset(script);
  return mock;
}

/** 用例结束后关闭 mock（放 `test.afterAll`） */
export async function stopMockLlm(): Promise<void> {
  await mockLlm?.stop();
}

/**
 * 把 BYOK 指向 mock 的设置。
 * `baseUrl` 必须含 `/v1`：Provider 会自行拼 `/chat/completions`。
 */
export function mockSettings(mock: MockLlm): Record<string, unknown> {
  return {
    providerType: 'openai-compatible',
    targetLanguage: 'zh-CN',
    // 用快捷键触发，避免划词用例相互干扰；Agent 不依赖它
    toolbarTrigger: 'shortcut',
    disabledHosts: [],
    openai: { baseUrl: mock.baseUrl, apiKey: 'mock-key', model: 'mock-tools' },
    ollama: { host: OLLAMA_HOST, model: '' },
  };
}

/* ---------------- Agent 偏好（local:agentPrefs） ---------------- */

/** 直接写 `local:agentPrefs`（等价于在面板勾选「启用」） */
export async function seedAgentPrefs(
  worker: Worker,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await worker.evaluate(async (payload) => {
    const KEY = 'agentPrefs';
    const stored = await chrome.storage.local.get(KEY);
    await chrome.storage.local.set({
      [KEY]: { ...((stored[KEY] ?? {}) as Record<string, unknown>), ...payload },
    });
  }, patch);
}

/** 回读 `local:agentPrefs` */
export async function readAgentPrefs(
  worker: Worker,
): Promise<Record<string, unknown>> {
  return worker.evaluate(async () => {
    const stored = await chrome.storage.local.get('agentPrefs');
    return (stored.agentPrefs ?? {}) as Record<string, unknown>;
  });
}

/* ---------------- Agent 面板驱动 ---------------- */

/**
 * 打开承载 Agent 面板的扩展页并切到 Agent Tab。
 * - `workspace` = 全页工作台；`sidepanel` = 把 sidepanel.html 当普通标签页
 *   （无头下拿不到真实 SIDE_PANEL 表面；逻辑类用例用这种方式即可）
 * 注意：**先开面板、后开内容页**，让内容页成为活动页，
 * `resolveContentTab` 才能直接命中真实网页（见 docs/decisions-v2.md 回退策略）。
 */
export async function openAgentSurface(
  context: BrowserContext,
  extensionId: string,
  surface: 'sidepanel' | 'workspace' = 'workspace',
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${surface}.html`);
  await page.getByRole('button', { name: 'Agent', exact: true }).click();
  await expect(page.getByText('本页操作 Agent', { exact: true })).toBeVisible();
  return page;
}

/** Agent 面板的可交互元素（都限制在可见的 Agent Tab 内，hidden 的其它 Tab 不参与匹配） */
export function agentUi(page: Page) {
  return {
    header: page.getByText('本页操作 Agent', { exact: true }),
    goal: page.getByPlaceholder(/把联系人表单填上/),
    start: page.getByRole('button', { name: '开始', exact: true }),
    approve: page.getByRole('button', { name: '批准并执行' }),
    rejectPlan: page.getByRole('button', { name: '取消', exact: true }),
    stop: page.getByRole('button', { name: '停止', exact: true }),
    confirmDanger: page.getByRole('button', { name: '仍要执行' }),
    skipDanger: page.getByRole('button', { name: '跳过', exact: true }),
    /** 危险确认卡（用于把文案断言限定在卡片内，避免与时间线条目重名冲突） */
    dangerCard: page.getByTestId('agent-danger'),
    enable: page.getByRole('checkbox', { name: '启用' }),
    refresh: page.getByRole('button', { name: '刷新绑定页' }),
    help: page.getByRole('button', { name: /说明/ }),
  } as const;
}

/** 打开一张封板测试页，并等内容脚本就绪（Agent 才能绑定） */
export async function openContentPage(
  context: BrowserContext,
  pathname: string,
): Promise<Page> {
  await ensureTestPages();
  const page = await context.newPage();
  await page.goto(testPageUrl(pathname));
  await page.waitForFunction(
    () => !!document.querySelector('[data-dm-toolbar-ready="1"], dualmind-toolbar'),
    undefined,
    { timeout: 15_000 },
  );
  return page;
}

/* ---------------- 测试页计数器（判定以计数器为准） ---------------- */

export interface DmTestAction {
  name: string;
  detail: string;
  at: number;
}
export interface DmTestState {
  counts: Record<string, number>;
  actions: DmTestAction[];
}

/** 读测试页的 `window.dmTest.state()`（动作计数 + 日志） */
export async function readCounters(page: Page): Promise<DmTestState> {
  return page.evaluate(() => {
    const w = window as unknown as { dmTest?: { state(): DmTestState } };
    return w.dmTest ? w.dmTest.state() : { counts: {}, actions: [] };
  });
}

/** 归零测试页计数器（每条用例开始前调用） */
export async function resetCounters(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { dmTest?: { reset(): void } };
    w.dmTest?.reset();
  });
}

/* ---------------- 一站式 Agent 用例装配 ---------------- */

/** 跨平台「开始」快捷键（面板监听 metaKey / ctrlKey） */
export const START_SHORTCUT = process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter';

export interface AgentTestSetup {
  mock: MockLlm;
  /** 承载 Agent 面板的扩展页（通常在后台，Playwright 可正常驱动） */
  agentPage: Page;
  /** 被 Agent 操作的内容页（作为活动页，让 resolveContentTab 直接命中） */
  contentPage: Page | null;
  ui: ReturnType<typeof agentUi>;
}

/**
 * 装配一条 Agent 用例：mock 脚本 → 设置 → 面板 → 内容页。
 *
 * 顺序**不可颠倒**：内容页最后打开才会成为活动页，
 * `resolveContentTab` 才能拿到真实网页（否则会回退到扩展页而失败）。
 */
export async function setupAgentTest(
  worker: Worker,
  context: BrowserContext,
  extensionId: string,
  options: {
    /** mock 脚本（按 HTTP 请求顺序消费） */
    script: MockStep[];
    /** 内容页路径；传 null 用于「无可读页」负路径（AG-04） */
    pagePath?: string | null;
    surface?: 'sidepanel' | 'workspace';
    /** Agent 偏好；传 false 表示不写（用于 AG-01 默认值断言） */
    prefs?: Record<string, unknown> | false;
  },
): Promise<AgentTestSetup> {
  const mock = await resetMockLlm(options.script);
  await seedSettings(worker, mockSettings(mock));
  if (options.prefs !== false) {
    await seedAgentPrefs(worker, {
      enabled: true,
      maxSteps: 20,
      ...(options.prefs ?? {}),
    });
  }
  const agentPage = await openAgentSurface(context, extensionId, options.surface ?? 'workspace');
  const contentPage = options.pagePath ? await openContentPage(context, options.pagePath) : null;
  if (contentPage) await resetCounters(contentPage);
  return { mock, agentPage, contentPage, ui: agentUi(agentPage) };
}
