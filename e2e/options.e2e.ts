/**
 * Options 页 E2E
 * 覆盖「检测连接」与「拉取模型列表」的关键分支（真实 Ollama + 错误配置）
 */
import {
  OLLAMA_MODEL,
  OLLAMA_SETTINGS,
  expect,
  readSettings,
  seedSettings,
  test,
} from './fixtures';

test.describe('Options 设置页', () => {
  test('Ollama 配置下能拉取模型并检测连接成功', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // 标题渲染说明 Options 入口可用
    await expect(page.getByRole('heading', { name: 'DualMind 设置' })).toBeVisible();

    // 拉取模型列表
    // 注意：必须限定 exact —— 自绘下拉里「模型列表为空，点右侧『刷新列表』拉取」
    // 这段提示文案含相同子串，宽松匹配会命中两个按钮触发 strict mode 冲突
    await page
      .getByRole('button', { name: '刷新列表', exact: true })
      .click();
    await expect(page.getByText(/已获取 \d+ 个模型/)).toBeVisible();
    // 已选模型出现在下拉里（合并了当前已选与远端列表）：自绘下拉需先展开面板
    await page.getByTestId('ollama-model-select').click();
    await expect(
      page.getByRole('option', { name: OLLAMA_MODEL, exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // 检测连接
    await page.getByRole('button', { name: '检测连接' }).click();
    await expect(page.getByText(/已连接，本地模型 \d+ 个/)).toBeVisible();
  });

  test('OpenAI 兼容但未填 API Key 时提示补 Key', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, {
      providerType: 'openai-compatible',
      openai: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' },
    });
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // 切到 OpenAI 分支后应看到 Base URL / API Key 字段
    await expect(page.getByText('Base URL')).toBeVisible();

    await page.getByRole('button', { name: '检测连接' }).click();
    await expect(page.locator('.text-red-700')).toContainText('请先在设置中填写 API Key');
  });

  test('Base URL 不通时提示网络错误', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    // 指向一个必然不可达的端口，触发 fetch 的 TypeError → NETWORK
    await seedSettings(serviceWorker, {
      providerType: 'openai-compatible',
      openai: { baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'sk-e2e-test', model: 'gpt-4o-mini' },
    });
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await page.getByRole('button', { name: '检测连接' }).click();
    await expect(page.locator('.text-red-700')).toContainText('网络连接失败');
  });

  test('保存设置后回读一致（含禁用站点解析）', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // 禁用站点：换行/逗号分隔的 hostname 应被规整为数组。
    // 必须按**可访问名**定位到「禁用站点」那个 textarea —— Options 现在有两个
    // textarea（禁用站点 / 不显示悬浮按钮的站点，见 options/App.tsx 的 Field），
    // 光用 locator('textarea') 会撞 strict mode violation。
    const hosts = page.getByRole('textbox', {
      name: '禁用站点（每行一个 hostname）',
    });
    await hosts.fill('mail.google.com\nexample.com, foo.test');
    await page.getByRole('button', { name: '保存设置' }).click();
    await expect(page.getByText('已保存')).toBeVisible();

    // 从 service worker 回读，确认落了 3 个 hostname
    const saved = await readSettings(serviceWorker);
    expect(saved.disabledHosts).toEqual([
      'mail.google.com',
      'example.com',
      'foo.test',
    ]);
  });
});
