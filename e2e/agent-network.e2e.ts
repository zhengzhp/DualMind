/**
 * V3 Agent · Provider 错误注入（NET-04 / NET-05 / NET-06）
 *
 * 价值：401/429/5xx/连接重置/「模型不支持 tools」这些**概率性**故障，
 * 靠真模型无法稳定复现；mock 可确定性注入，并保证 UI 不卡在 loading、不误报成功。
 * 顺带覆盖 PRIV-06 的一部分：错误响应体（含假 Key）不得出现在 UI。
 */
import { mockPlan, mockTools } from './mock-llm';
import { expect, setupAgentTest, stopMockLlm, test } from './fixtures';

const PLAN = mockPlan(['观察页面元素', '按目标操作', '汇报结果']);
const VALID_GOAL = '把姓名填成张三';

test.afterAll(async () => {
  await stopMockLlm();
});

test.describe('Agent · Provider 错误注入', () => {
  test('NET-04 · 401 → 鉴权失败文案，且可再试', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      script: [{ type: 'http_error', status: 401 }],
      pagePath: '/t1-static-form',
    });

    await ui.goal.fill(VALID_GOAL);
    await ui.start.click();

    await expect(agentPage.getByText('鉴权失败，请检查 API Key 是否正确')).toBeVisible({
      timeout: 60_000,
    });
    // 不卡 loading：回到可再次发起的初始态
    await expect(agentPage.getByText('⌘/Ctrl + Enter 开始')).toBeVisible();
    await expect(ui.start).toBeEnabled();
  });

  test('NET-04 · 429 → 限流文案', async ({ context, serviceWorker, extensionId }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      script: [{ type: 'http_error', status: 429 }],
      pagePath: '/t1-static-form',
    });

    await ui.goal.fill(VALID_GOAL);
    await ui.start.click();

    await expect(agentPage.getByText('请求过于频繁，请稍后再试')).toBeVisible({
      timeout: 60_000,
    });
  });

  test('NET-04 · 500 → 通用失败文案，且不泄露响应体（PRIV-06）', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      // mock 默认在错误体里塞了假 Key 与内网地址
      script: [{ type: 'http_error', status: 500 }],
      pagePath: '/t1-static-form',
    });

    await ui.goal.fill(VALID_GOAL);
    await ui.start.click();

    await expect(
      agentPage.getByText(/模型请求失败，请检查 Provider 设置后重试/),
    ).toBeVisible({ timeout: 60_000 });
    // 响应体里的假 Key / 内网地址不得出现在界面上
    await expect(agentPage.getByText('sk-MOCK-LEAK-SHOULD-NOT-APPEAR')).toHaveCount(0);
    await expect(agentPage.getByText('10.0.0.1')).toHaveCount(0);
  });

  test('NET-04 · 连接被重置 → 网络失败文案', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      script: [{ type: 'reset' }],
      pagePath: '/t1-static-form',
    });

    await ui.goal.fill(VALID_GOAL);
    await ui.start.click();

    await expect(
      agentPage.getByText('网络连接失败，请检查网络或 Base URL'),
    ).toBeVisible({ timeout: 60_000 });
  });

  test('NET-06 · 未知工具名 → 明确报错但不中断任务', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      script: [
        PLAN,
        mockTools([{ name: 'hack_the_page' }]),
        mockTools([{ name: 'finish', args: { summary: '换用合法工具后结束', success: true } }]),
      ],
      pagePath: '/t1-static-form',
    });

    await ui.goal.fill(VALID_GOAL);
    await ui.start.click();
    await ui.approve.click();

    await expect(agentPage.getByText('未知工具：hack_the_page')).toBeVisible({
      timeout: 60_000,
    });
    // 单次非法调用不应终止整个任务
    await expect(agentPage.getByText('任务成功完成')).toBeVisible({ timeout: 60_000 });
  });

  test('NET-06 · 工具参数不是合法 JSON → 明确报错', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      script: [
        PLAN,
        // raw 直接给出坏 JSON
        mockTools([{ name: 'click', raw: '{' }]),
        mockTools([{ name: 'finish', args: { summary: '换用合法参数后结束', success: true } }]),
      ],
      pagePath: '/t1-static-form',
    });

    await ui.goal.fill(VALID_GOAL);
    await ui.start.click();
    await ui.approve.click();

    await expect(agentPage.getByText('工具 click 参数不是合法 JSON')).toBeVisible({
      timeout: 60_000,
    });
    await expect(agentPage.getByText('任务成功完成')).toBeVisible({ timeout: 60_000 });
  });

  test('NET-05 · 模型不返回 tool_calls：容忍一轮后明确判定不支持', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { mock, agentPage, ui } = await setupAgentTest(
      serviceWorker,
      context,
      extensionId,
      {
        script: [PLAN, { type: 'text', content: '我只是一段普通文本。' }, { type: 'text' }],
        pagePath: '/t1-static-form',
      },
    );

    await ui.goal.fill(VALID_GOAL);
    await ui.start.click();
    await ui.approve.click();

    await expect(
      agentPage.getByText(/当前模型未返回任何工具调用，可能不支持 tool calling/),
    ).toBeVisible({ timeout: 60_000 });

    // 1 次计划 + 2 次零 tool_calls 轮（第二轮即判定不支持，不再无意义催促）
    expect(mock.cursor()).toBe(3);
    // 且不是「卡住」而是明确失败
    await expect(agentPage.getByText('⌘/Ctrl + Enter 开始')).toBeVisible();
  });
});
