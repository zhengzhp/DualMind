/**
 * E2E 共享 fixture
 * - 用 persistent context 加载 `wxt build` 产物（MV3 扩展仅在此模式下可用）
 * - 从 service worker 的 URL 动态解析扩展 ID（未在 manifest 配 key，ID 每次会变）
 * - 提供直接写底层 storage 的 helper，避免测试依赖 Options 页点选
 */
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

const here = path.dirname(fileURLToPath(import.meta.url));

/** 扩展构建产物目录（由 `wxt build` 生成） */
export const EXTENSION_PATH = path.resolve(here, '../.output/chrome-mv3');
/** 独立的浏览器 profile，避免污染真实浏览器数据 */
const USER_DATA_DIR = path.resolve(here, '../.e2e-profile');

/**
 * 是否使用有头窗口。默认**无头**（适合本地批量执行）；
 * 需要观察界面、或运行依赖真实窗口 UI 的用例（如真实 Side Panel）时设 `E2E_HEADED=1`。
 */
export const E2E_HEADED = process.env.E2E_HEADED === '1';

/** 本机 Ollama 配置（本套 E2E 依赖真实本地模型） */
export const OLLAMA_HOST = 'http://127.0.0.1:11434';
export const OLLAMA_MODEL = 'qwen-coder-8k:latest';

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
 */
export async function selectText(page: Page, text: string) {
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
