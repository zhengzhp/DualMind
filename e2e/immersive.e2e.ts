/**
 * 沉浸式全文双语翻译 E2E（含「翻译后页面布局」验收）
 *
 * 依赖 `wxt build` 产物与真实本地 Ollama（见 fixtures.ts）；不进 CI，本地手动执行。
 *
 * 布局用例的做法：内容脚本注入后，先清空 body（保留扩展的 shadow 宿主），
 * 再塞入一份可控的英文 fixture 页面 —— 这样分段数量、标签类型、文本内容全部可控，
 * 且纯英文内容能让本地小模型稳定产出中文，从而同时校验「译文正确性 + 布局不变形」。
 */
import type { Page } from '@playwright/test';
import { OLLAMA_SETTINGS, expect, seedSettings, test } from './fixtures';

/** 悬浮入口与注入到页面正文里的译文块 */
const FAB = 'dualmind-immersive .dm-fab';
const BLOCK = '.dm-immersive-block';

/** 可控 fixture：覆盖标题 / 段落 / 列表 / 引用 / 代码块 / 表格 / 链接 */
const FIXTURE_HTML = `
  <h1>Artificial intelligence is reshaping how people work</h1>
  <p id="dm-p1">Modern language models can summarize long documents and answer questions about them.</p>
  <p id="dm-p2">However, they also raise important questions about privacy and reliability.</p>
  <ul>
    <li>Tools that run locally are becoming more attractive to users.</li>
    <li>Users increasingly care about where their data is stored.</li>
  </ul>
  <blockquote>Translation quality depends heavily on the model you choose.</blockquote>
  <pre id="dm-pre"><code>const answer = 42; // 代码块不应被翻译</code></pre>
  <table>
    <tr><th>Feature</th><th>Status</th></tr>
    <tr><td>Translation</td><td>Available</td></tr>
  </table>
  <p><a id="dm-link" href="https://example.com/docs">Read the documentation</a></p>
`;

/** 页面侧采集到的布局指标 */
interface LayoutMetrics {
  blockCount: number;
  chineseBlocks: number;
  misplaced: number;
  overlapping: number;
  codeTranslated: number;
  sourceMarkerCount: number;
  htmlClass: string;
  scrollWidth: number;
  clientWidth: number;
  bodyScrollWidth: number;
  p1Width: number;
  bodyHtml: string;
}

/**
 * 装上可控 fixture。
 * 关键：保留 DUALMIND-* 的 shadow 宿主（它们在 body 下），否则会连同内容脚本一起被清掉。
 */
async function installFixture(page: Page): Promise<void> {
  await page.evaluate((html) => {
    const hosts = Array.from(document.body.children).filter((el) =>
      el.tagName.startsWith('DUALMIND'),
    );
    const article = document.createElement('article');
    article.id = 'dm-fixture';
    article.innerHTML = html;
    document.body.innerHTML = '';
    document.body.append(article, ...hosts);
  }, FIXTURE_HTML);
}

/** 采集布局指标（在页面上下文中执行） */
async function collectMetrics(page: Page): Promise<LayoutMetrics> {
  return page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('.dm-immersive-block'));
    let misplaced = 0;
    let overlapping = 0;

    for (const block of blocks) {
      const parent = block.parentElement;
      const inCell =
        parent != null && (parent.tagName === 'TD' || parent.tagName === 'TH');
      // 表格单元格：译文插入到单元格内部；其余：译文紧跟源元素之后
      const source = inCell ? parent : block.previousElementSibling;
      if (!source) {
        misplaced += 1;
        continue;
      }
      if (!inCell && !source.hasAttribute('data-dualmind-source')) misplaced += 1;

      const rb = block.getBoundingClientRect();
      const rs = source.getBoundingClientRect();
      if (inCell) {
        // 单元格内插入：译文应落在单元格范围内（单元格会随之增高）
        if (rb.top < rs.top - 2 || rb.bottom > rs.bottom + 2) overlapping += 1;
      } else if (rb.height > 0 && rb.top < rs.bottom - 2) {
        // 其余标签：译文块不应与源元素在垂直方向重叠（会遮挡原文）
        overlapping += 1;
      }
    }

    const p1 = document.getElementById('dm-p1');
    return {
      blockCount: blocks.length,
      chineseBlocks: blocks.filter((b) =>
        /[\u4e00-\u9fff]/.test(b.textContent ?? ''),
      ).length,
      misplaced,
      overlapping,
      codeTranslated: document.querySelectorAll(
        'pre .dm-immersive-block, code .dm-immersive-block',
      ).length,
      sourceMarkerCount: document.querySelectorAll('[data-dualmind-source]')
        .length,
      htmlClass: document.documentElement.className,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      p1Width: p1?.getBoundingClientRect().width ?? 0,
      bodyHtml: document.body.innerHTML,
    };
  });
}

test.describe('沉浸式全文翻译', () => {
  test('整页翻译：译文正确、布局不变形，还原后 DOM 复原', async ({
    page,
    serviceWorker,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto('https://example.com');
    await expect(page.locator('dualmind-immersive')).toHaveCount(1);

    const fab = page.locator(FAB);
    await expect(fab).toHaveText('沉浸译');

    await installFixture(page);
    const before = await collectMetrics(page);
    expect(before.blockCount).toBe(0);

    await fab.click();
    // 等待整页翻译结束（运行中按钮是「翻译中 x/y」）
    await expect(fab).toHaveText('显示原文', { timeout: 150_000 });

    const after = await collectMetrics(page);

    // ① 译文正确性：至少渲染出多段中文译文，主段落必须被翻译
    expect(after.blockCount).toBeGreaterThanOrEqual(5);
    expect(after.chineseBlocks).toBeGreaterThanOrEqual(4);
    await expect(
      page.locator('#dm-p1 + .dm-immersive-block'),
    ).toContainText(/[\u4e00-\u9fff]/);
    expect(
      await page.locator('dualmind-immersive .dm-fab[data-state="error"]').count(),
    ).toBe(0);

    // ② 结构：每个译文块都紧跟其源元素；表格单元格插入到单元格内部
    expect(after.misplaced).toBe(0);
    // ③ 不遮挡原文（垂直不重叠）
    expect(after.overlapping).toBe(0);
    // ④ 代码块不参与翻译
    expect(after.codeTranslated).toBe(0);

    // ⑤ 布局不变形：不产生横向滚动，原文段落宽度不被挤压
    expect(after.scrollWidth).toBeLessThanOrEqual(after.clientWidth + 1);
    expect(after.bodyScrollWidth).toBeLessThanOrEqual(after.clientWidth + 1);
    expect(Math.abs(after.p1Width - before.p1Width)).toBeLessThanOrEqual(1);

    // ⑥ 原文文本未被改写
    await expect(page.locator('#dm-p1')).toHaveText(
      'Modern language models can summarize long documents and answer questions about them.',
    );
    await expect(page.locator('#dm-pre code')).toHaveText(
      'const answer = 42; // 代码块不应被翻译',
    );

    // ⑦ 还原：译文块清空、源标记移除、DOM 与翻译前一致
    await fab.click();
    await expect(page.locator(BLOCK)).toHaveCount(0);
    const restored = await collectMetrics(page);
    expect(restored.sourceMarkerCount).toBe(0);
    expect(restored.htmlClass).toBe('');
    expect(restored.scrollWidth).toBeLessThanOrEqual(restored.clientWidth + 1);
    expect(restored.bodyHtml).toBe(before.bodyHtml);
  });

  test('禁用站点不注入沉浸译入口', async ({ page, serviceWorker }) => {
    await seedSettings(serviceWorker, {
      ...OLLAMA_SETTINGS,
      disabledHosts: ['example.com'],
    });
    await page.goto('https://example.com');
    await page.waitForLoadState('load');
    // 给内容脚本异步读设置留出时间，确认它确实「没有」注入
    await page.waitForTimeout(1500);

    await expect(page.locator('dualmind-immersive')).toHaveCount(0);
  });

  test('偏好「仅译文」：翻译后隐藏原文、保留译文，偏好仍落 storage', async ({
    page,
    serviceWorker,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    // 预置展示模式偏好：内容脚本挂载时读取，决定本轮翻译的展示模式
    await serviceWorker.evaluate(async () => {
      const g = globalThis as unknown as {
        chrome: {
          storage: {
            local: { set: (items: Record<string, unknown>) => Promise<void> };
          };
        };
      };
      await g.chrome.storage.local.set({
        immersivePrefs: { displayMode: 'translation-only', autoTranslate: false },
      });
    });

    await page.goto('https://example.com');
    await expect(page.locator('dualmind-immersive')).toHaveCount(1);
    await installFixture(page);

    const fab = page.locator(FAB);
    await fab.click();
    await expect(fab).toHaveText('显示原文', { timeout: 150_000 });

    // 「仅译文」：<html> 打类名，源元素被隐藏；译文块仍可见
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.classList.contains(
            'dm-immersive-translation-only',
          ),
        ),
      )
      .toBe(true);
    expect(
      await page
        .locator('#dm-p1')
        .evaluate((el) => getComputedStyle(el).display),
    ).toBe('none');
    await expect(page.locator('#dm-p1 + .dm-immersive-block')).toBeVisible();

    // 偏好未被翻译过程改写
    const prefs = await serviceWorker.evaluate(async () => {
      const g = globalThis as unknown as {
        chrome: {
          storage: {
            local: { get: (k: string) => Promise<Record<string, unknown>> };
          };
        };
      };
      return (await g.chrome.storage.local.get('immersivePrefs')).immersivePrefs;
    });
    expect(prefs).toMatchObject({ displayMode: 'translation-only' });
  });

  test('动态内容：翻译完成后新插入的正文被自动补译', async ({
    page,
    serviceWorker,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto('https://example.com');
    await expect(page.locator('dualmind-immersive')).toHaveCount(1);

    await installFixture(page);
    const fab = page.locator(FAB);
    await fab.click();
    await expect(fab).toHaveText('显示原文', { timeout: 150_000 });

    const before = await page.locator(BLOCK).count();

    // 模拟前端框架异步插入新正文（不应触发对自己注入译文的再翻译）
    await page.evaluate(() => {
      const p = document.createElement('p');
      p.id = 'dm-late';
      p.textContent =
        'A paragraph inserted after the initial pass should be translated automatically.';
      document.getElementById('dm-fixture')?.appendChild(p);
    });

    // MutationObserver 防抖 500ms + 翻译耗时
    await expect(page.locator('#dm-late + .dm-immersive-block')).toContainText(
      /[\u4e00-\u9fff]/,
      { timeout: 90_000 },
    );
    expect(await page.locator(BLOCK).count()).toBeGreaterThan(before);
  });

  test('沉浸译指令：扩展页向内容脚本下发后开始整页翻译', async ({
    context,
    page,
    serviceWorker,
    extensionId,
  }) => {
    // 覆盖 content:immersive-command 这一条入口（右键「翻译整页」/ 侧栏控制区最终都落到它）。
    // 真实右键菜单与 Background 的「当前活动标签页」查找无法在 Playwright 中点击，
    // 故这里从扩展页直接向内容页下发同款消息。
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto('https://example.com');
    await expect(page.locator('dualmind-immersive')).toHaveCount(1);
    await installFixture(page);

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    const contentTabId = await panel.evaluate(async () => {
      const g = globalThis as unknown as {
        browser: {
          tabs: {
            query: (info: Record<string, never>) => Promise<
              { id?: number; url?: string }[]
            >;
          };
        };
      };
      // 直接按 URL 锁定内容页：持久化 context 可能先开一个空白标签，
      // 用「排除自身」会误选到它，导致 sendMessage 报 Receiving end does not exist
      const all = await g.browser.tabs.query({});
      return (
        all.find((tab) => (tab.url ?? '').includes('example.com'))?.id ?? -1
      );
    });
    expect(contentTabId).toBeGreaterThanOrEqual(0);

    await panel.evaluate(
      (tabId) =>
        (
          globalThis as unknown as {
            browser: {
              tabs: {
                sendMessage: (id: number, message: unknown) => Promise<unknown>;
              };
            };
          }
        ).browser.tabs.sendMessage(tabId, {
          type: 'content:immersive-command',
          command: 'start',
        }),
      contentTabId,
    );

    await expect(page.locator(FAB)).toHaveText('显示原文', {
      timeout: 150_000,
    });
  });
});
