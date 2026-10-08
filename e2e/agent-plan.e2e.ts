/**
 * V3 Agent · 计划闸门与执行闭环（A 闸门自动化）
 *
 * 覆盖：AG-03（批准前零写入）/ AG-05（批准后执行）/ AG-16（空目标）/
 *       AG-18（工具失败后换策略）/ AG-19（步数上限）/ AG-04（无可读页负路径）
 *
 * 依赖：`e2e/mock-llm.ts` 提供确定性的计划与 tool_calls；
 *       夹具会自动拉起 `e2e/pages/serve.mjs`（可用 `DM_SKIP_PAGES=1` 关闭）。
 * 跑法：`pnpm test:e2e`（默认无头）——无需真实 Ollama，也无需 API Key。
 */
import { mockPlan } from './mock-llm';
import {
  expect,
  readCounters,
  setupAgentTest,
  stopMockLlm,
  test,
} from './fixtures';

/** 所有用例共用的计划（3 步） */
const PLAN = mockPlan(['观察页面可交互元素', '按目标填写表单', '汇报结果']);

test.afterAll(async () => {
  // mock 端口是进程级资源：文件结束必须释放，否则下一个文件 EADDRINUSE
  await stopMockLlm();
});

test.describe('Agent · 计划闸门与执行', () => {
  test('AG-16 · 空目标或全空格时「开始」不可用', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      script: [PLAN],
      pagePath: '/t1-static-form',
    });

    // 空目标：按钮禁用（面板按 goal.trim() 判定）
    await expect(ui.start).toBeDisabled();

    // 全空格：仍然禁用
    await ui.goal.fill('    ');
    await expect(ui.start).toBeDisabled();

    // 有实质内容才可用
    await ui.goal.fill('把姓名填成张三');
    await expect(ui.start).toBeEnabled();
    await expect(agentPage.getByText('⌘/Ctrl + Enter 开始')).toBeVisible();
  });

  test('AG-03 · 计划批准前不产生任何页面写入', async ({
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

    await ui.goal.fill('把姓名填成张三，不要提交');
    await ui.start.click();

    // 进入计划闸门：计划卡 + 批准按钮 + awaiting_plan
    await expect(agentPage.getByText('请确认执行计划')).toBeVisible();
    await expect(agentPage.getByText('1. 观察页面可交互元素')).toBeVisible();
    await expect(agentPage.getByText('状态：awaiting_plan')).toBeVisible();
    await expect(ui.approve).toBeVisible();

    // 关键断言：批准前页面零写入（计数器为空 + 表单值未变）
    const counters = await readCounters(contentPage!);
    expect(counters.actions).toHaveLength(0);
    await expect(contentPage!.locator('#dm-name')).toHaveValue('');

    // 取消计划 → 明确「已取消」，仍无写入
    await ui.rejectPlan.click();
    await expect(
      agentPage.getByText('任务已取消；已发生的页面动作无法撤销'),
    ).toBeVisible();
    await expect(contentPage!.locator('#dm-name')).toHaveValue('');
  });

  test('AG-05 · 批准计划后按工具环执行并成功完成', async ({
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
          { type: 'tools', calls: [{ name: 'snapshot' }] },
          {
            type: 'tools',
            calls: [
              // pick：按元素文案从最近一次 snapshot 解析 index（脚本无法硬编码 index）
              { name: 'fill', pick: { labelIncludes: '姓名' }, args: { value: '张三' } },
            ],
          },
          { type: 'tools', calls: [{ name: 'finish', args: { summary: '已填写姓名', success: true } }] },
        ],
        pagePath: '/t1-static-form',
      },
    );

    await ui.goal.fill('把姓名填成张三，不要提交');
    await ui.start.click();
    await expect(ui.approve).toBeVisible();
    await ui.approve.click();

    await expect(agentPage.getByText('任务成功完成')).toBeVisible({ timeout: 60_000 });
    // 页面真的被写入（以 DOM 值为准，不以模型摘要为准）
    await expect(contentPage!.locator('#dm-name')).toHaveValue('张三');
  });

  test('AG-18 · 工具调用被拒后模型换策略并完成', async ({
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
          // 第 1 轮：非法参数（index 为负）→ 参数校验拒绝，但**不应**中断任务
          { type: 'tools', calls: [{ name: 'click', args: { index: -1 } }] },
          // 第 2 轮：模型改用 snapshot 重新观察
          { type: 'tools', calls: [{ name: 'snapshot' }] },
          // 第 3 轮：改用 fill 完成目标
          { type: 'tools', calls: [{ name: 'fill', pick: { labelIncludes: '姓名' }, args: { value: '李四' } }] },
          { type: 'tools', calls: [{ name: 'finish', args: { summary: '换策略后完成', success: true } }] },
        ],
        pagePath: '/t1-static-form',
      },
    );

    await ui.goal.fill('把姓名填成李四，不要提交');
    await ui.start.click();
    await ui.approve.click();

    // 出现错误条目（被拒）但仍然走到成功
    await expect(agentPage.getByText('click 需要非负整数 index')).toBeVisible({ timeout: 60_000 });
    await expect(agentPage.getByText('任务成功完成')).toBeVisible({ timeout: 60_000 });
    await expect(contentPage!.locator('#dm-name')).toHaveValue('李四');
  });

  test('AG-19 · 达到步数上限时明确停止', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      // 上限压到 2 步，让脚本必然触顶
      prefs: { enabled: true, maxSteps: 2 },
      script: [
        PLAN,
        // 每轮都用非法参数：稳定消耗轮数且不产生页面写入
        { type: 'tools', calls: [{ name: 'click', args: { index: -1 } }] },
      ],
      pagePath: '/t1-static-form',
    });

    // 上限在面板上可见（UI-12 的一部分）
    await expect(agentPage.getByText('上限 2 步')).toBeVisible();

    await ui.goal.fill('随便做点什么');
    await ui.start.click();
    await ui.approve.click();

    await expect(
      agentPage.getByText('已达到最大步数（2），任务停止。可缩小目标后重试。'),
    ).toBeVisible({ timeout: 60_000 });
    await expect(agentPage.getByText('任务未完成，请查看步骤记录后重试')).toBeVisible();
  });

  test('AG-04 · 没有可读内容页时明确失败（负路径）', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    // pagePath: null → 不打开任何 http(s) 页面，活动标签就是扩展页
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      script: [PLAN],
      pagePath: null,
    });

    await expect(
      agentPage.getByText('未绑定可读网页（请先打开 http(s) 页面）'),
    ).toBeVisible();

    await ui.goal.fill('把姓名填成张三');
    await ui.start.click();

    await expect(
      agentPage.getByText('没有可读的内容页。请先打开普通网页再试。'),
    ).toBeVisible();
  });

  test('计划闸门期间「开始」变为「停止」（不可重复提交）', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const { agentPage, ui } = await setupAgentTest(serviceWorker, context, extensionId, {
      // 用 hang 让计划一直不返回，停在 planning
      script: [{ type: 'hang' }],
      pagePath: '/t1-static-form',
    });

    await ui.goal.fill('把姓名填成张三');
    await ui.start.click();

    await expect(agentPage.getByText('状态：planning')).toBeVisible();
    await expect(ui.start).toHaveCount(0);
    await expect(ui.stop).toBeVisible();
  });
});
