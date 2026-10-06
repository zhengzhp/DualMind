/**
 * Side Panel E2E
 * 说明：真实侧边栏容器需要用户手势才能打开，自动化里改为直接以标签页打开
 * `sidepanel.html` —— 它仍是扩展上下文，消息链路与 storage 监听都是真实的。
 */
import {
  OLLAMA_MODEL,
  OLLAMA_SETTINGS,
  expect,
  seedSettings,
  test,
} from './fixtures';

test.describe('Side Panel 翻译工作台', () => {
  test('载入模型列表并完成一次翻译', async ({ page, serviceWorker, extensionId }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    await expect(page.getByRole('heading', { name: 'DualMind' })).toBeVisible();

    // 初始化会调用 refreshModels；模型在自绘下拉里，需先展开面板才能看到选项
    await page.getByTestId('model-select').click();
    await expect(
      page.getByRole('option', { name: OLLAMA_MODEL, exact: true }),
    ).toBeVisible();
    // Esc 收起面板（顺带守住键盘关闭行为）
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);

    // 原文（第一个 textarea）→ 触发翻译
    // 注意：导航里也有个「翻译」标签页，必须限定在 main 内取操作按钮
    const source = page.locator('textarea').first();
    await source.fill('Hello, world. How are you today?');
    await page
      .getByRole('main')
      .getByRole('button', { name: '翻译', exact: true })
      .click();

    // 译文（第二个 textarea，只读）应填入中文
    const translated = page.locator('textarea').nth(1);
    await expect(translated).toHaveValue(/[\u4e00-\u9fff]/, { timeout: 150_000 });
    await expect(page.locator('.text-red-700')).toHaveCount(0);
  });

  test('切到 OpenAI 兼容但未配 Key 时给出提示', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(page.getByRole('heading', { name: 'DualMind' })).toBeVisible();

    // Provider 改为分段控件（原生 select 已移除）→ 直接点选「OpenAI 兼容」分段
    await page
      .getByRole('radio', { name: 'OpenAI 兼容', exact: true })
      .click();

    await expect(page.getByText(/请先在设置中填写 API Key/)).toBeVisible();
  });
});
