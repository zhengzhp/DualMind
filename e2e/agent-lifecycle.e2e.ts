/**
 * V3 Agent · 生命周期与取消（LIFE-01/02/03/05/08/11/16）
 *
 * 关键性质：任务**不落盘**（SW 重启即丢）、停止后旧计划/确认必须失效、
 * 同一内容页同时只允许一个任务、导航/刷新会作废旧计划。
 * 这些以前只能在浏览器里手动点，现在用脚本驱动 + 断言可留证。
 */
import { mockPlan, mockTools } from './mock-llm';
import {
  agentUi,
  expect,
  openAgentSurface,
  readCounters,
  resetMockLlm,
  setupAgentTest,
  stopMockLlm,
  test,
  testPageUrl,
} from './fixtures';

const PLAN = mockPlan(['观察页面元素', '按目标操作', '汇报结果']);
const CANCELLED = '任务已取消；已发生的页面动作无法撤销';

test.afterAll(async () => {
  await stopMockLlm();
});

test.describe('Agent · 生命周期与取消', () => {
  test('LIFE-01 · 规划阶段点「停止」→ 立即取消，不残留 loading', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      // hang：计划永不返回，任务停在 planning
      script: [{ type: 'hang' }],
      pagePath: '/t1-static-form',
    });

    await ui.goal.fill('把姓名填成张三');
    await ui.start.click();
    await expect(agentPage.getByText('状态：planning')).toBeVisible();

    await ui.stop.click();

    await expect(agentPage.getByText(CANCELLED)).toBeVisible();
    await expect(agentPage.getByText('⌘/Ctrl + Enter 开始')).toBeVisible();
    await expect(ui.start).toBeEnabled();
  });

  test('LIFE-02 · 等待批准时停止 → 计划卡消失且无写入', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, contentPage, ui } = await setupAgentTest(
      serviceWorker,
      context,
      extensionId,
      { script: [PLAN], pagePath: '/t1-static-form' },
    );

    await ui.goal.fill('把姓名填成张三');
    await ui.start.click();
    await expect(ui.approve).toBeVisible();

    await ui.stop.click();

    await expect(agentPage.getByText(CANCELLED)).toBeVisible();
    // 旧计划与批准入口必须消失，避免「停止后仍能批准」的悬空状态
    await expect(agentPage.getByText('请确认执行计划')).toHaveCount(0);
    await expect(ui.approve).toHaveCount(0);

    const counters = await readCounters(contentPage!);
    expect(counters.actions).toHaveLength(0);
  });

  test('LIFE-03 · 危险确认阶段停止 → 不执行该动作', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, contentPage, ui } = await setupAgentTest(
      serviceWorker,
      context,
      extensionId,
      {
        script: [
          PLAN,
          mockTools([{ name: 'snapshot' }]),
          mockTools([{ name: 'click', pick: { labelIncludes: '删除草稿' } }]),
        ],
        pagePath: '/t1-static-form',
      },
    );

    await ui.goal.fill('把草稿删掉');
    await ui.start.click();
    await ui.approve.click();

    await expect(agentPage.getByText('危险动作待确认')).toBeVisible({ timeout: 60_000 });
    await ui.stop.click();

    await expect(agentPage.getByText(CANCELLED)).toBeVisible();
    await expect(agentPage.getByText('危险动作待确认')).toHaveCount(0);

    const counters = await readCounters(contentPage!);
    expect(counters.counts['删除草稿'] ?? 0).toBe(0);
  });

  test('LIFE-05 · 停止后可以重新发起新任务（旧结果被清空）', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      script: [{ type: 'hang' }],
      pagePath: '/t1-static-form',
    });

    await ui.goal.fill('任务一');
    await ui.start.click();
    await expect(agentPage.getByText('状态：planning')).toBeVisible();
    await ui.stop.click();
    await expect(agentPage.getByText(CANCELLED)).toBeVisible();

    // 换脚本：新任务必须能重新走到计划闸门
    await resetMockLlm([mockPlan(['新计划第一步', '新计划第二步'])]);

    await ui.goal.fill('任务二');
    await ui.start.click();

    await expect(agentPage.getByText('1. 新计划第一步')).toBeVisible({ timeout: 60_000 });
    await expect(agentPage.getByText('2. 新计划第二步')).toBeVisible();
    // 上一次的取消横幅不应残留
    await expect(agentPage.getByText(CANCELLED)).toHaveCount(0);
  });

  test('LIFE-08 · 同一内容页已有任务时，第二个入口被拒绝', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      script: [{ type: 'hang' }],
      pagePath: '/t1-static-form',
      surface: 'sidepanel',
    });

    // 任务一：占住内容页（hang 让它停在 planning）
    await ui.goal.fill('任务一');
    await ui.start.click();
    await expect(agentPage.getByText('状态：planning')).toBeVisible();

    // 第二个入口（全页工作台）对同一内容页发起
    const second = await openAgentSurface(context, extensionId, 'workspace');
    const ui2 = agentUi(second);
    await ui2.goal.fill('任务二');
    await ui2.start.click();

    // DM-V3-004 已修复：业务拒绝文案应直接透出，便于用户判断原因
    await expect(second.getByText(/本页已有 Agent 任务/)).toBeVisible({ timeout: 60_000 });
  });

  test('LIFE-11 · 目标页导航 → 旧计划与确认失效', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, contentPage, ui } = await setupAgentTest(
      serviceWorker,
      context,
      extensionId,
      { script: [PLAN], pagePath: '/t1-static-form' },
    );

    await ui.goal.fill('把姓名填成张三');
    await ui.start.click();
    await expect(ui.approve).toBeVisible();

    // 目标页整页导航（后台 tabs.onUpdated → invalidate）
    await contentPage!.goto(testPageUrl('/t3-dynamic'));

    await expect(
      agentPage.getByText('目标页已导航、刷新或关闭，旧计划与确认已失效，请重新启动任务'),
    ).toBeVisible({ timeout: 60_000 });
    await expect(ui.approve).toHaveCount(0);
  });

  test('LIFE-16 · 连点「停止」不产生重复结果或错误', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      script: [{ type: 'hang' }],
      pagePath: '/t1-static-form',
    });

    await ui.goal.fill('把姓名填成张三');
    await ui.start.click();
    await expect(agentPage.getByText('状态：planning')).toBeVisible();

    await ui.stop.click();
    // 第二次点击：按钮此时可能已变回「开始」→ 超时即忽略，模拟「手快连点」
    await ui.stop.click({ timeout: 1_000 }).catch(() => undefined);

    await expect(agentPage.getByText(CANCELLED)).toHaveCount(1);
    await expect(agentPage.getByText('出错了，请稍后重试')).toHaveCount(0);
    await expect(agentPage.getByText('⌘/Ctrl + Enter 开始')).toBeVisible();
  });
});
