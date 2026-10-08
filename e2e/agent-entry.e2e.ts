/**
 * V3 Agent · 入口与文案（AG-01/02 · UI-08/09/12）
 *
 * 覆盖：Agent 开关（默认启用 / 关闭后禁用输入）、快捷键发起、
 * 错误态可读（不出现原始堆栈）、能力说明文案与上限展示。
 */
import { mockPlan } from './mock-llm';
import {
  START_SHORTCUT,
  expect,
  readAgentPrefs,
  setupAgentTest,
  stopMockLlm,
  test,
} from './fixtures';

const PLAN = mockPlan(['观察页面元素', '按目标操作', '汇报结果']);
const DISABLED_HINT = 'Agent 已关闭。勾选上方「启用」后再试。';

test.afterAll(async () => {
  await stopMockLlm();
});

test.describe('Agent · 入口与文案', () => {
  test('AG-01/02 · 默认启用；关闭后禁用输入并提示，且确实落盘', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    // prefs: false → 不写 storage，验证默认值（enabled: true / maxSteps: 20）
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      script: [PLAN],
      pagePath: '/t1-static-form',
      prefs: false,
    });

    await expect(ui.enable).toBeChecked();
    await expect(agentPage.getByText(DISABLED_HINT)).toHaveCount(0);

    // 关闭 → 提示出现、输入与「开始」都被禁用。
    // 注意：勾选框是受控组件，`setEnabled` 要等 `agent:prefs:save` 往返完成后
    // 才更新 React state，因此不能用 `uncheck()`（它在点击后立刻断言会撞上这个窗口），
    // 改为 click + 可重试断言。
    await ui.enable.click();
    await expect(ui.enable).not.toBeChecked();
    await expect(agentPage.getByText(DISABLED_HINT)).toBeVisible();
    await expect(ui.goal).toBeDisabled();
    await expect(ui.start).toBeDisabled();

    await expect
      .poll(async () => (await readAgentPrefs(serviceWorker)).enabled)
      .toBe(false);

    // 重新启用 → 提示消失
    await ui.enable.click();
    await expect(ui.enable).toBeChecked();
    await expect(agentPage.getByText(DISABLED_HINT)).toHaveCount(0);
    await expect
      .poll(async () => (await readAgentPrefs(serviceWorker)).enabled)
      .toBe(true);
  });

  test('UI-08 · ⌘/Ctrl + Enter 直接发起任务', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      script: [PLAN],
      pagePath: '/t1-static-form',
    });

    await ui.goal.fill('把姓名填成张三');
    // 面板监听 textarea 的 keydown（metaKey / ctrlKey + Enter）
    await ui.goal.press(START_SHORTCUT);

    await expect(agentPage.getByText('请确认执行计划')).toBeVisible({ timeout: 60_000 });
    await expect(agentPage.getByText('状态：awaiting_plan')).toBeVisible();
  });

  test('UI-09 · 错误态可读：只给用户文案，不暴露堆栈', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      script: [{ type: 'http_error', status: 500 }],
      pagePath: '/t1-static-form',
    });

    await ui.goal.fill('把姓名填成张三');
    await ui.start.click();

    await expect(
      agentPage.getByText(/模型请求失败，请检查 Provider 设置后重试/),
    ).toBeVisible({ timeout: 60_000 });
    // 不出现 JS 堆栈痕迹
    await expect(agentPage.getByText(/at\s+\w+\s+\(/)).toHaveCount(0);
    await expect(agentPage.getByText(/Error:/)).toHaveCount(0);
  });

  test('UI-12 · 能力说明与步数上限可见', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      script: [PLAN],
      pagePath: '/t1-static-form',
      prefs: false,
    });

    // 上限取自 prefs（默认 20）
    await expect(agentPage.getByText('上限 20 步')).toBeVisible();

    // 说明默认折叠 → 展开后可见模型要求与能力边界
    await ui.help.click();
    await expect(agentPage.getByText(/需支持 tool calling 的模型/)).toBeVisible();
    await expect(agentPage.getByText(/不支持 Shadow DOM/)).toBeVisible();
  });

  test('UI-12 · 说明应把「支付 / 转账」写为硬阻断而非「再确认」（DM-V3-003）', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    // 断言文案与 `features/agent/danger.ts` 一致：PAY_RE 命中为 `blocked`（无确认入口），
    // 因此说明必须写「直接拒绝 / 无法确认放行」，而不是与「删除」并列成「再确认」。
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      script: [PLAN],
      pagePath: '/t1-static-form',
      prefs: false,
    });
    await ui.help.click();
    // 硬阻断表述
    await expect(agentPage.getByText(/资金类动作直接拒绝/)).toBeVisible();
    await expect(agentPage.getByText(/无法通过确认放行/)).toBeVisible();
    // 危险（删除）仍保留「再确认」
    await expect(agentPage.getByText(/删除[\s\S]*?再次弹窗确认/)).toBeVisible();
  });
});
