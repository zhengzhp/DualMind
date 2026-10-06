/**
 * Side Panel 目标语言 E2E
 * - 划词源语言 → 目标语言自动互切（英文→中文 / 中文→英文 / 混排→中文）
 * - 手动改语言后重译仍按所选语言，不被互切覆盖
 *
 * 说明：本文件以「标签页打开 sidepanel.html」的方式承载扩展上下文（同 sidepanel.e2e.ts），
 * 互切用例直接触发 background 的 `selection:push`（等价于浮层点「侧边栏」），
 * 从而覆盖 real detectLang + session 写入 + Side Panel storage 监听 的完整链路。
 */
import type { Page } from '@playwright/test';
import { TARGET_LANGUAGES } from '../shared/storage/types';
import {
  OLLAMA_SETTINGS,
  expect,
  readSession,
  seedSettings,
  test,
} from './fixtures';

/** 语言 value（如 zh-CN）→ 自绘下拉里展示的 label（如 简体中文） */
function langLabel(value: string): string {
  return TARGET_LANGUAGES.find((lang) => lang.value === value)?.label ?? value;
}

/** 在扩展页面上下文里触发 background 的选区推送（等价于划词浮层点「侧边栏」） */
async function pushSelection(page: Page, text: string): Promise<void> {
  await page.evaluate(async (t) => {
    const b = (
      globalThis as unknown as {
        browser: { runtime: { sendMessage: (m: unknown) => Promise<unknown> } };
      }
    ).browser;
    await b.runtime.sendMessage({ type: 'selection:push', data: { text: t } });
  }, text);
}

test.describe('Side Panel · 目标语言互切', () => {
  test('英文→中文 / 中文→英文 / 混排→中文', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    const lang = page.getByTestId('target-language');
    // 默认目标语为简体中文
    await expect(lang).toHaveText(langLabel('zh-CN'));

    // 纯英文 → 目标简体中文
    await pushSelection(page, 'Hello, how are you today?');
    await expect(lang).toHaveText(langLabel('zh-CN'));
    expect((await readSession(serviceWorker))?.targetLanguage).toBe('zh-CN');

    // 纯中文 → 目标英文
    await pushSelection(page, '今天天气很好');
    await expect(lang).toHaveText(langLabel('en'));
    expect((await readSession(serviceWorker))?.targetLanguage).toBe('en');

    // 中英混排 → 目标简体中文
    await pushSelection(page, 'hello 世界');
    await expect(lang).toHaveText(langLabel('zh-CN'));
    expect((await readSession(serviceWorker))?.targetLanguage).toBe('zh-CN');
  });
});

test.describe('Side Panel · 手动语言覆盖', () => {
  test('手动改语言后重译仍按所选语言（不被互切覆盖）', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    const lang = page.getByTestId('target-language');
    const source = page.locator('textarea').first();
    const translated = page.locator('textarea').nth(1);

    // 先来一次英文划词：互切会把目标语设为 zh-CN
    await pushSelection(page, 'Hello, how are you today?');
    await expect(lang).toHaveText(langLabel('zh-CN'));

    // 用户手动改为日文（自绘下拉：展开面板后点选）
    await lang.click();
    await page.getByRole('option', { name: '日本語', exact: true }).click();
    await expect(lang).toHaveText(langLabel('ja'));

    // 重译：应以手动所选 ja 发起
    await source.fill('Hello, how are you today?');
    await page
      .getByRole('main')
      .getByRole('button', { name: '翻译', exact: true })
      .click();

    // 会话记录的目标语必须是 ja —— 证明请求按手动选择发出，未被互切覆盖
    await expect
      .poll(async () => (await readSession(serviceWorker))?.targetLanguage, {
        timeout: 150_000,
      })
      .toBe('ja');

    // 译文产出后下拉仍保持手动选择
    await expect(translated).not.toHaveValue('', { timeout: 150_000 });
    await expect(lang).toHaveText(langLabel('ja'));
  });
});
