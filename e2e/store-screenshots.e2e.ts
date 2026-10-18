/**
 * 上架截图采集（REL-10 / T30）—— 提交材料专用，**不参与常规跑批**。
 *
 * 用法（建议有头，渲染与真实观感一致）：
 *   DM_CAPTURE=1 E2E_HEADED=1 \
 *   PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" \
 *   npx playwright test e2e/store-screenshots.e2e.ts
 *
 * 默认扩展产物 = `wxt build` 的 `.output/chrome-mv3`。若要「用正式包截图」，
 * 先解压归档包再指过去（推荐，避免与 dev 产物混淆）：
 *   unzip -q ~/DualMind-releases/dualmind-1.0.0-chrome.zip -d /tmp/dm-1.0.0
 *   DM_CAPTURE=1 DM_EXTENSION_PATH=/tmp/dm-1.0.0 ... npx playwright test e2e/store-screenshots.e2e.ts
 *
 * 默认**无头**即可出图；需要人工核对外观时加 `E2E_HEADED=1`。
 *
 * 已知边界（写进 docs/store-screenshots.md）：
 * - Playwright 只能截**网页视口**，截不到浏览器窗口 / 真实 Side Panel。
 *   故「翻译工作台 / 阅读助手 / Agent」三张统一在 `workspace.html`（全页工作台）采集 ——
 *   它共用 `WorkbenchApp`、消息与 storage 链路都是真实的，只是 surface 不同。
 * - 内容页截图会走真实本地 Ollama，产出的是真实译文（非占位文本）。
 * - Chrome 商店最多 5 张：Agent 的「计划批准」与「危险动作确认」合并为一张双联图
 *   （两联各 640×800，拼成 1280×800），不再单独输出 06。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Page } from '@playwright/test';
import {
  OLLAMA_SETTINGS,
  expect,
  seedSettings,
  setupAgentTest,
  test,
} from './fixtures';
import { mockPlan, mockTools } from './mock-llm';

const here = path.dirname(fileURLToPath(import.meta.url));
/** 图片落在 docs 下，便于 README / 提交表单引用 */
const OUT_DIR = path.resolve(here, '../docs/assets/store');
/** Chrome 应用商店要求的截图尺寸（1280×800 或 640×400） */
const SHOT = { width: 1280, height: 800 };
/** 双联图的单联尺寸：两联并排正好 1280×800，且每联仍是完整的 16:10 页面 */
const HALF_SHOT = { width: 640, height: 800 };
const CAPTURE = process.env.DM_CAPTURE === '1';

/** 演示文章样式：让截图看起来像真实网页，而不是测试页 */
const DEMO_CSS = `
  * { box-sizing: border-box; }
  /* example.com 自带 body max-width；截图需要铺满 1280 视口 */
  html, body { margin: 0; padding: 0; width: 100%; max-width: none; }
  body {
    background: #f8fafc; color: #0f172a;
    font: 16px/1.75 -apple-system, "PingFang SC", "Segoe UI", Roboto, sans-serif;
  }
  #dm-demo { max-width: 760px; margin: 40px auto 0; padding: 0 28px 40px; text-align: left; }
  #dm-demo h1 { font-size: 30px; line-height: 1.35; margin: 0 0 10px; letter-spacing: -0.4px; }
  #dm-demo .byline { margin: 0 0 28px; color: #64748b; font-size: 13px; }
  #dm-demo h2 { font-size: 19px; margin: 30px 0 10px; }
  #dm-demo p { margin: 0 0 16px; }
  #dm-demo #lead { font-size: 17px; color: #1e293b; }
  #dm-demo ul { margin: 0 0 16px; padding-left: 22px; color: #334155; }
  #dm-demo li { margin: 4px 0; }
  #dm-demo hr { border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0; }
`;

/** 演示文章正文（纯英文，本地小模型可稳定产出中文译文） */
const DEMO_HTML = `
  <h1>How local AI assistants change the way we read the web</h1>
  <p class="byline">Field notes · 6 min read</p>
  <p id="lead">Modern language models can summarize long documents, translate between dozens of languages, and help people understand unfamiliar pages without sending their data to a third party.</p>
  <h2>Why running the model locally matters</h2>
  <p>When the model runs on your own machine, the page you are reading never leaves your computer. That property matters most for internal dashboards, personal notes and anything covered by a confidentiality agreement.</p>
  <p>Local models are smaller than the largest hosted ones, so the quality trade-off is real. Choosing a task-specific model usually closes most of the gap.</p>
  <h2>What a good assistant should do</h2>
  <ul>
    <li>Explain the page in the user's own language, on request.</li>
    <li>Act only after the user approves a concrete plan.</li>
    <li>Refuse actions that move money, and say so clearly.</li>
  </ul>
  <hr />
  <p>Everything above is explained from the perspective of a single tab: the assistant works on the page you are looking at, and nowhere else.</p>
`;

/** 落盘截图并打印相对路径，方便一眼核对产物 */
async function shoot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file });
  console.log(`[截图] ${path.relative(process.cwd(), file)}`);
}

/** 落盘已有 Buffer（双联图用） */
function writeShot(name: string, buffer: Buffer): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, buffer);
  console.log(`[截图] ${path.relative(process.cwd(), file)}`);
}

/**
 * 把两张 HALF_SHOT 状态图拼成一张 1280×800 双联：
 * 左「计划批准」 / 右「危险确认」，中间 2px 品牌蓝分隔，不改变任何 UI 内容。
 */
async function composeDiptych(
  context: BrowserContext,
  left: Buffer,
  right: Buffer,
): Promise<Buffer> {
  const dataUrl = (buffer: Buffer) =>
    `data:image/png;base64,${buffer.toString('base64')}`;
  const page = await context.newPage();
  await page.setViewportSize(SHOT);
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#0A1C2B;display:flex;width:1280px;height:800px">
      <img src="${dataUrl(left)}" width="639" height="800" style="display:block" alt="">
      <div style="width:2px;height:800px;background:#1466AD"></div>
      <img src="${dataUrl(right)}" width="639" height="800" style="display:block" alt="">
    </body></html>`,
  );
  const composed = await page.screenshot();
  await page.close();
  return composed;
}

/**
 * 打开内容页并替换成可控的「演示文章」。
 * 关键：保留 `DUALMIND*` 的 shadow 宿主（内容脚本注入的浮层 / 悬浮入口），
 * 否则会把扩展 UI 一起清掉（与 immersive.e2e.ts 的 installFixture 同一手法）。
 */
async function openDemoArticle(page: Page): Promise<void> {
  await page.goto('https://example.com');
  await expect(page.locator('dualmind-toolbar')).toHaveCount(1);
  await page.setViewportSize(SHOT);
  await page.evaluate(
    ({ html, css }) => {
      const hosts = Array.from(document.body.children).filter((el) =>
        el.tagName.startsWith('DUALMIND'),
      );
      const style = document.createElement('style');
      style.textContent = css;
      const article = document.createElement('article');
      article.id = 'dm-demo';
      article.innerHTML = html;
      document.body.innerHTML = '';
      document.body.append(style, article, ...hosts);
    },
    { html: DEMO_HTML, css: DEMO_CSS },
  );
}

/** 选中演示文章的导语段并派发 mouseup（与 fixtures.selectText 同一坑：先等就绪标记） */
async function selectLead(page: Page): Promise<void> {
  await page.waitForSelector('[data-dm-toolbar-ready="1"]', { timeout: 15_000 });
  await page.evaluate(() => {
    const el = document.getElementById('lead');
    if (!el) throw new Error('演示文章缺少 #lead');
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
  });
}

/** 打开全页工作台并切到指定 Tab */
async function openWorkbench(
  context: BrowserContext,
  extensionId: string,
  tab?: '翻译' | '阅读助手' | 'Agent',
): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize(SHOT);
  await page.goto(`chrome-extension://${extensionId}/workspace.html`);
  await expect(
    page.getByRole('tab', { name: '翻译', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  if (tab && tab !== '翻译') {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(
      page.getByRole('tab', { name: tab, exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
  }
  return page;
}

test.describe('上架截图采集（REL-10 / T30）', () => {
  test.skip(!CAPTURE, '截图专用：仅在 DM_CAPTURE=1 时执行');

  test('01 划词翻译：选中即译的浮层', async ({ page, serviceWorker }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await openDemoArticle(page);
    await selectLead(page);

    const primary = page.locator('dualmind-toolbar .dm-btn.primary');
    await expect(primary).toBeVisible();
    await primary.click();
    // 等真实译文流式结束（回到「翻译」即完成）
    await expect(primary).toHaveText('翻译', { timeout: 150_000 });
    await shoot(page, '01-selection-toolbar.png');
  });

  test('02 沉浸式整页双语翻译', async ({ page, serviceWorker }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await openDemoArticle(page);

    const trigger = page.locator('dualmind-page-fab .dm-pf-trigger');
    await trigger.hover();
    const item = page.locator('dualmind-page-fab [data-action="immersive"]');
    await expect(item).toBeVisible();
    await item.click();
    // 完成后入口标签变为「显示原文」
    await expect(item.locator('.dm-pf-item-label')).toHaveText('显示原文', {
      timeout: 150_000,
    });

    // 回到页首，让标题 + 首段译文同框
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('.dm-immersive-block').first()).toContainText(
      /[\u4e00-\u9fff]/,
    );
    await shoot(page, '02-immersive-fullpage.png');
  });

  test('03 翻译工作台（全页工作台）', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    const wb = await openWorkbench(context, extensionId);

    await wb
      .locator('textarea')
      .first()
      .fill(
        'Local models keep sensitive text on your own machine. ' +
          'They are smaller than hosted ones, but a task-specific model often closes the gap.',
      );
    await wb
      .getByRole('main')
      .getByRole('button', { name: '翻译', exact: true })
      .click();
    await expect(wb.locator('textarea').nth(1)).toHaveValue(/[\u4e00-\u9fff]/, {
      timeout: 150_000,
    });
    // 等到流式结束（按钮从「停止」回到「翻译」），避免截到半截译文
    await expect(
      wb.getByRole('main').getByRole('button', { name: '翻译', exact: true }),
    ).toBeVisible({ timeout: 150_000 });
    await shoot(wb, '03-workbench-translate.png');
  });

  test('04 阅读助手：整页摘要（只读）', async ({
    context,
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    // 先开内容页提供可读上下文，再开工作台；工作台会回退到最近可读内容页
    await openDemoArticle(page);

    const wb = await openWorkbench(context, extensionId, '阅读助手');
    await wb.bringToFront();
    await expect(wb.getByTestId('chat-bound-page')).toContainText('example.com', {
      timeout: 15_000,
    });
    await wb.getByRole('button', { name: '总结本页' }).click();

    const assistant = wb.getByTestId('chat-turn-assistant').first();
    await expect(assistant).toContainText(/[\u4e00-\u9fff]/, {
      timeout: 150_000,
    });
    await expect(assistant).not.toContainText('正在生成…');
    // 等到流式结束（输入区从「停止」回到「发送」），否则会截到半截摘要
    await expect(
      wb.getByRole('button', { name: '发送', exact: true }),
    ).toBeVisible({ timeout: 150_000 });
    await assistant.scrollIntoViewIfNeeded();
    await shoot(wb, '04-reading-assistant.png');
  });

  test('05 Agent：计划批准 + 危险动作二次确认（双联）', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(
      serviceWorker,
      context,
      extensionId,
      {
        script: [
          mockPlan(['观察页面可交互元素', '删除草稿', '汇报结果']),
          mockTools([{ name: 'snapshot' }]),
          mockTools([{ name: 'click', pick: { labelIncludes: '删除草稿' } }]),
          mockTools([
            { name: 'finish', args: { summary: '用户未确认，已跳过', success: false } },
          ]),
        ],
        pagePath: '/t1-static-form',
        surface: 'workspace',
      },
    );
    // 每联 640×800：拼起来正好 1280×800，且单联仍是完整页面（不裁切 UI）
    await agentPage.setViewportSize(HALF_SHOT);

    await ui.goal.fill('把草稿删掉');
    await ui.start.click();
    await expect(ui.approve).toBeVisible({ timeout: 60_000 });
    const planShot = await agentPage.screenshot();

    // 批准后继续执行，直到删除类动作触发二次确认
    await ui.approve.click();
    await expect(ui.dangerCard).toBeVisible({ timeout: 60_000 });
    await ui.dangerCard.scrollIntoViewIfNeeded();
    const dangerShot = await agentPage.screenshot();

    writeShot(
      '05-agent-plan.png',
      await composeDiptych(context, planShot, dangerShot),
    );
  });
});
