/**
 * 全页工作台（workspace.html）E2E
 *
 * 与 Side Panel 共用 `WorkbenchApp`，只是 `surface='workspace'`（此前零自动化覆盖）。
 * 说明：真实入口是侧栏点「工作台」后开页并收起侧栏；这里直接以标签页打开
 * `workspace.html` —— 它仍是扩展上下文，消息链路与 storage 监听都是真实的。
 */
import {
  OLLAMA_MODEL,
  OLLAMA_SETTINGS,
  expect,
  seedSettings,
  test,
} from './fixtures';

test.describe('全页工作台', () => {
  test('加载模型列表并完成一次翻译', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);

    // 品牌是字标 img（alt=DualMind），全页身份由副标题体现
    await expect(page.getByText('全页工作台 · 翻译')).toBeVisible();

    // 模型横栏常驻可见：直接展开自绘下拉
    await page.getByTestId('model-select').click();
    await expect(
      page.getByRole('option', { name: OLLAMA_MODEL, exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // 复制按钮在译文为空时不可用
    const copyButton = page
      .getByRole('main')
      .getByRole('button', { name: '复制译文', exact: true });
    await expect(copyButton).toBeDisabled();

    const source = page.locator('textarea').first();
    await source.fill('Hello, world. How are you today?');
    // 底部翻译按钮：导航里也有「翻译」Tab，必须限定在 main 内并精确匹配
    await page
      .getByRole('main')
      .getByRole('button', { name: '翻译', exact: true })
      .click();

    const translated = page.locator('textarea').nth(1);
    await expect(translated).toHaveValue(/[\u4e00-\u9fff]/, {
      timeout: 150_000,
    });
    await expect(copyButton).toBeEnabled();
    // 全页错误提示容器不应出现
    await expect(page.locator('.text-red-700')).toHaveCount(0);
  });

  test('Chat 已接入、Agent 仍占位，切回翻译仍可用', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(page.getByText('全页工作台 · 翻译')).toBeVisible();

    // V2：聊天 Tab 由占位替换为可用的 ChatPanel（副标题随之变化）
    await page.getByRole('button', { name: '聊天', exact: true }).click();
    await expect(page.getByText('全页工作台 · 网页问答')).toBeVisible();
    await expect(page.getByRole('button', { name: '总结本页' })).toBeVisible();
    await expect(page.getByText('聊天（即将推出）')).toHaveCount(0);

    // Agent 仍为占位
    await page.getByRole('button', { name: 'Agent', exact: true }).click();
    await expect(page.getByText('Agent（即将推出）')).toBeVisible();

    // 模型横栏位于各 Tab 之上且常驻可见：非翻译 Tab 也应能看到
    await expect(page.getByTestId('model-select')).toBeVisible();

    // 切回翻译页仍可用（模型列表已加载）
    await page.getByRole('button', { name: '翻译', exact: true }).click();
    await expect(page.getByTestId('model-select')).toBeVisible();
  });
});
