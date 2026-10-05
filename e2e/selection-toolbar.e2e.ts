/**
 * 划词工具栏 E2E
 * 在真实网页上造选区 + mouseup，验证浮层出现、流式翻译、停止/关闭、站点禁用
 */
import {
  OLLAMA_SETTINGS,
  expect,
  seedSettings,
  selectEnglishText,
  test,
} from './fixtures';

/** 浮层主按钮（Shadow DOM 为 open，Playwright 可自动穿透定位） */
const PRIMARY = 'dualmind-toolbar .dm-btn.primary';
const CLOSE = 'dualmind-toolbar [data-action="close"]';
const ERROR = 'dualmind-toolbar .dm-error';
const BODY = 'dualmind-toolbar .dm-body';

test.describe('划词工具栏', () => {
  test('划词后出现浮层并完成流式翻译', async ({ page, serviceWorker }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto('https://example.com');

    // 内容脚本注入影子宿主
    await expect(page.locator('dualmind-toolbar')).toHaveCount(1);
    // 未划词时浮层隐藏（骨架常驻 DOM，但不可见）
    await expect(page.locator(PRIMARY)).toBeHidden();

    await selectEnglishText(page);

    const primary = page.locator(PRIMARY);
    await expect(primary).toBeVisible();
    await expect(primary).toHaveText('翻译');

    await primary.click();

    // loading 态：主按钮切换为「停止」
    await expect(primary).toHaveText('停止', { timeout: 15_000 });
    // 完成后回到「翻译」
    await expect(primary).toHaveText('翻译', { timeout: 150_000 });

    // 有译文、且没有错误态；译文应含中文（目标语言 zh-CN）
    await expect(page.locator(ERROR)).toHaveCount(0);
    await expect(page.locator(BODY)).toContainText(/[\u4e00-\u9fff]/);
  });

  test('翻译中点「停止」不报错并回到空闲态', async ({ page, serviceWorker }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto('https://example.com');
    await expect(page.locator('dualmind-toolbar')).toHaveCount(1);

    await selectEnglishText(page);

    const primary = page.locator(PRIMARY);
    await expect(primary).toBeVisible();
    await expect(primary).toHaveText('翻译');
    await primary.click();
    await expect(primary).toHaveText('停止', { timeout: 15_000 });

    // 中止请求
    await primary.click();

    // ABORTED 被静默吞掉：不应出现错误提示
    await expect(page.locator(ERROR)).toHaveCount(0);
    await expect(primary).toHaveText('翻译', { timeout: 30_000 });
  });

  test('流式翻译中点「关闭」能立即收起', async ({ page, serviceWorker }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto('https://example.com');
    await expect(page.locator('dualmind-toolbar')).toHaveCount(1);

    await selectEnglishText(page);
    const primary = page.locator(PRIMARY);
    await primary.click();
    await expect(primary).toHaveText('停止', { timeout: 15_000 });

    // 流式进行中关闭：不依赖按钮节点稳定与否，必须生效
    await page.locator(CLOSE).click();
    await expect(primary).toBeHidden();
  });

  test('按 Esc 收起浮层', async ({ page, serviceWorker }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto('https://example.com');
    await expect(page.locator('dualmind-toolbar')).toHaveCount(1);

    await selectEnglishText(page);
    await expect(page.locator(PRIMARY)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator(PRIMARY)).toBeHidden();
  });

  test('点击浮层外部收起浮层', async ({ page, serviceWorker }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto('https://example.com');
    await expect(page.locator('dualmind-toolbar')).toHaveCount(1);

    await selectEnglishText(page);
    await expect(page.locator(PRIMARY)).toBeVisible();

    // 点击页面左上角（远离浮层）
    await page.mouse.click(5, 5);
    await expect(page.locator(PRIMARY)).toBeHidden();
  });

  test('滚动时浮层跟随选区', async ({ page, serviceWorker }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto('https://example.com');
    // 造一个可滚动页面
    await page.evaluate(() => {
      document.body.style.minHeight = '3000px';
    });

    await selectEnglishText(page);
    const primary = page.locator(PRIMARY);
    await expect(primary).toBeVisible();

    const before = await primary.boundingBox();
    await page.mouse.wheel(0, 600);
    // 等 autoUpdate 重算
    await page.waitForTimeout(300);
    const after = await primary.boundingBox();

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    await expect(primary).toBeVisible();
    // 向下滚动后选区在视口中上移，浮层应跟随（y 变小）
    expect(after!.y).toBeLessThan(before!.y);
  });

  test('禁用站点不注入划词工具栏', async ({ page, serviceWorker }) => {
    await seedSettings(serviceWorker, {
      ...OLLAMA_SETTINGS,
      disabledHosts: ['example.com'],
    });
    await page.goto('https://example.com');
    await page.waitForLoadState('load');
    // 给内容脚本异步读设置留出时间，确认它确实「没有」注入
    await page.waitForTimeout(1500);

    await expect(page.locator('dualmind-toolbar')).toHaveCount(0);
  });

  test('shortcut 模式下划词不自动弹层', async ({ page, serviceWorker }) => {
    await seedSettings(serviceWorker, {
      ...OLLAMA_SETTINGS,
      toolbarTrigger: 'shortcut',
    });
    await page.goto('https://example.com');
    await expect(page.locator('dualmind-toolbar')).toHaveCount(1);

    await selectEnglishText(page);
    await page.waitForTimeout(500);

    // shortcut 策略下 mouseup 不应展示浮层
    await expect(page.locator(PRIMARY)).toBeHidden();
  });
});
