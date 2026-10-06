/**
 * 划词浮层「侧边栏 / 收起侧栏」开关 E2E
 *
 * 回归背景（2026-10-06）：本用例曾因后台在 open() 前多了一次 `await isSidePanelOpen()`
 * （内含 getContexts 往返）而失败 —— 等它返回时瞬时用户激活已过期，open() 抛
 * `may only be called in response to a user gesture`。
 * 现已改为用同步的 Port 连接态判断开关（见 entrypoints/background.ts `toggleSidePanel`），
 * 使 open() 紧跟手势调用。详见 docs/decisions.md「已知缺陷」。
 */
import {
  E2E_HEADED,
  OLLAMA_SETTINGS,
  expect,
  readSession,
  seedSettings,
  selectText,
  test,
} from './fixtures';
import type { Worker } from '@playwright/test';

const PANEL_BTN = 'dualmind-toolbar [data-action="panel"]';

/** 读取真实 Side Panel 上下文数量（用于确认面板是否真的打开） */
function sidePanelCount(worker: Worker): Promise<number> {
  return worker.evaluate(async () => {
    const g = globalThis as unknown as {
      chrome: {
        runtime: {
          getContexts?: (f: { contextTypes: string[] }) => Promise<unknown[]>;
        };
      };
    };
    if (!g.chrome.runtime.getContexts) return 0;
    const list = await g.chrome.runtime.getContexts({
      contextTypes: ['SIDE_PANEL'],
    });
    return list.length;
  });
}

test.describe('划词浮层 · 侧边栏开关', () => {
  test('点「侧边栏」→ 打开；再点「收起侧栏」→ 关闭', async ({
    page,
    serviceWorker,
  }) => {
    // 真实 Side Panel 是附着在窗口侧边的浏览器 UI 表面：无头下 open() 不产生
    // SIDE_PANEL 上下文，断言必然失败。该用例只在有头模式（E2E_HEADED=1）下运行。
    test.skip(!E2E_HEADED, '真实 Side Panel 需要有头窗口：请用 E2E_HEADED=1 运行');

    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto('https://example.com');
    await expect(page.locator('dualmind-toolbar')).toHaveCount(1);

    await selectText(page, 'Hello, how are you today?');
    const panelBtn = page.locator(PANEL_BTN);
    await expect(panelBtn).toBeVisible();

    // 初始态：面板未开 → 文案「侧边栏」、未按下
    await expect(panelBtn).toHaveText('侧边栏');
    await expect(panelBtn).toHaveAttribute('aria-pressed', 'false');

    // 第一次点击：打开 → 文案切「收起侧栏」并按下
    await panelBtn.click();
    await expect(panelBtn).toHaveText('收起侧栏');
    await expect(panelBtn).toHaveAttribute('aria-pressed', 'true');
    // 面板确实打开（真实 SIDE_PANEL 上下文 +1）
    await expect.poll(() => sidePanelCount(serviceWorker)).toBe(1);

    // 打开时应把当前选区推进 session，Side Panel 才能承接原文
    const session = await readSession(serviceWorker);
    expect(session?.sourceText).toBe('Hello, how are you today?');
    // 英文 → 互切目标语应为简体中文
    expect(session?.targetLanguage).toBe('zh-CN');

    // 第二次点击：关闭 → 回到初始态
    await panelBtn.click();
    await expect(panelBtn).toHaveText('侧边栏');
    await expect(panelBtn).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => sidePanelCount(serviceWorker)).toBe(0);
  });

  test('无选区时浮层不可触发面板开关', async ({ page, serviceWorker }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto('https://example.com');
    await expect(page.locator('dualmind-toolbar')).toHaveCount(1);

    // 未划词 → 浮层整体隐藏，按钮不可见 / 不可点
    await expect(page.locator(PANEL_BTN)).toBeHidden();
  });
});
