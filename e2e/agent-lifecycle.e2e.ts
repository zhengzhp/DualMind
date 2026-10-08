/**
 * V3 Agent · 生命周期与取消（LIFE-01/02/03/05/08/10/11/12/16/19）
 *
 * 关键性质：任务**不落盘**（SW 重启即丢）、停止后旧计划/确认必须失效、
 * 同一内容页同时只允许一个任务、导航/刷新会作废旧计划。
 * 这些以前只能在浏览器里手动点，现在用脚本驱动 + 断言可留证。
 *
 * 记账口径（见 docs/v3-release-test-plan.md §7.1）：LIFE-06（工具超时 + 到期请求
 * 不补执行）以单测记账（`service.test.ts`「工具超时终止整个任务，不尝试同批次
 * 下一个动作」+ `executor.test.ts`「超时请求不执行」），**不在此文件重复**。
 */
import { mockPlan, mockTools } from './mock-llm';
import {
  agentUi,
  expect,
  openAgentSurface,
  openContentPage,
  readCounters,
  resetMockLlm,
  seedSettings,
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

  /**
   * LIFE-08 的补充子项：第二入口被拒后，**第一任务的快照 / 确认 / UI 不能被改变**。
   * 单靠「第二入口报错」证明不了这一点 —— 必须做前后对比，并验证第一任务的
   * 确认仍然有效（能正常批准并执行完成）。
   */
  test('LIFE-08（补）· 第二入口被拒后，第一任务的计划 / 确认 / UI 不被改变', async ({
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
          mockPlan(['任务一：观察', '任务一：填写']),
          mockTools([{ name: 'snapshot' }]),
          mockTools([
            { name: 'fill', pick: { labelIncludes: '姓名' }, args: { value: '王五' } },
          ]),
          mockTools([{ name: 'finish', args: { summary: '第一任务完成', success: true } }]),
        ],
        pagePath: '/t1-static-form',
        surface: 'sidepanel',
      },
    );

    // 任务一停在待批准（此时还没有任何写入）
    await ui.goal.fill('任务一');
    await ui.start.click();
    await expect(agentPage.getByText('状态：awaiting_plan')).toBeVisible();
    await expect(agentPage.getByText('1. 任务一：观察')).toBeVisible();

    // 第二个入口对同一内容页发起 → 被明确拒绝
    const second = await openAgentSurface(context, extensionId, 'workspace');
    const ui2 = agentUi(second);
    await ui2.goal.fill('任务二');
    await ui2.start.click();
    await expect(second.getByText(/本页已有 Agent 任务/)).toBeVisible({ timeout: 60_000 });

    // 第一任务的 UI / 计划 / 确认 **未被改变**
    await expect(agentPage.getByText('状态：awaiting_plan')).toBeVisible();
    await expect(agentPage.getByText('1. 任务一：观察')).toBeVisible();
    await expect(agentPage.getByText('2. 任务一：填写')).toBeVisible();
    await expect(ui.approve).toBeVisible();
    expect((await readCounters(contentPage!)).actions).toHaveLength(0);

    // 且确认仍然有效：批准后第一任务正常执行完成
    await ui.approve.click();
    await expect(agentPage.getByText('任务成功完成')).toBeVisible({ timeout: 60_000 });
    await expect(contentPage!.locator('#dm-name')).toHaveValue('王五');
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

  /**
   * LIFE-10：任务绑定的是**启动时那个内容页**，中途切换活动 Tab / 新开窗口
   * 都不能把工具改发到新页面（与 Chat 的 resolveContentTab 同语义，但绑定更早、更硬）。
   * 断言方式：绑定页确实被写入，而期间成为活动页的另一个页面**零写入**。
   */
  test('LIFE-10 · 运行中切活动 Tab → 工具仍只发往原绑定页', async ({
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
          // 延迟若干毫秒：留出「切换活动 Tab」的窗口，再让写入动作执行
          {
            type: 'tools',
            calls: [{ name: 'fill', pick: { labelIncludes: '姓名' }, args: { value: '张三' } }],
            delayMs: 3_000,
          },
          mockTools([{ name: 'finish', args: { summary: '已填写', success: true } }]),
        ],
        pagePath: '/t1-static-form',
      },
    );

    await ui.goal.fill('把姓名填成张三，不要提交');
    await ui.start.click();
    await ui.approve.click();

    // 任务运行中：新开另一个内容页（自动成为活动页），模拟用户切 Tab
    const otherPage = await openContentPage(context, '/t3-dynamic');
    await otherPage.bringToFront();

    // 关键：工具仍命中**原绑定页** ⇒ 原页被写入
    await expect(contentPage!.locator('#dm-name')).toHaveValue('张三', { timeout: 60_000 });
    await expect(agentPage.getByText('任务成功完成')).toBeVisible({ timeout: 60_000 });

    // 新活动页零写入（没有被误当作执行目标）
    const otherCounters = await readCounters(otherPage);
    expect(otherCounters.actions).toHaveLength(0);
  });

  /**
   * LIFE-12：同文档导航（pushState / hash）也必须让旧计划失效 —— 不能因为
   * 「文档没重载」就沿用旧授权。产品侧有三重保障：tabs.onUpdated(url)、
   * content 的 popstate/hashchange 监听、以及 200ms 轮询比对 location.href。
   */
  test('LIFE-12 · SPA 导航（pushState）使旧计划与确认失效', async ({
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

    // 仅改 URL、不重新加载文档（同文档导航）
    await contentPage!.evaluate(() => history.pushState({}, '', '/t1-static-form?spa=1'));

    await expect(
      agentPage.getByText('目标页已导航、刷新或关闭，旧计划与确认已失效，请重新启动任务'),
    ).toBeVisible({ timeout: 60_000 });
    await expect(ui.approve).toHaveCount(0);
  });

  /**
   * LIFE-19：任务运行中把当前站点加入停用列表 → 后续工具一律被拒，
   * 且**本次**不能有任何页面写入（停用即生效，不需要刷新）。
   */
  test('LIFE-19 · 运行中停用当前站点 → 后续工具被拒且零写入', async ({
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
          // 延迟：给「运行中改设置」留窗口
          {
            type: 'tools',
            calls: [{ name: 'fill', pick: { labelIncludes: '姓名' }, args: { value: '张三' } }],
            delayMs: 3_000,
          },
        ],
        pagePath: '/t1-static-form',
      },
    );

    await ui.goal.fill('把姓名填成张三，不要提交');
    await ui.start.click();
    await ui.approve.click();

    // 运行中把测试页主机（127.0.0.1）列为停用站点
    await seedSettings(serviceWorker, { disabledHosts: ['127.0.0.1'] });

    await expect(agentPage.getByText('当前站点已停用，Agent 任务已停止')).toBeVisible({
      timeout: 60_000,
    });
    // 停用后不得再有写入
    await expect(contentPage!.locator('#dm-name')).toHaveValue('');
    const counters = await readCounters(contentPage!);
    expect(counters.actions).toHaveLength(0);
  });
});
