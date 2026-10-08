/**
 * V3 Agent · 入口与 UI 批（`docs/v3-acceptance-runbook.md` **B8**）
 *
 * 覆盖：UI-01（FAB → 真实侧栏 / 切 Agent Tab）、UI-03（关 FAB 后 Agent 仍可用）、
 * UI-04（隐藏 FAB ≠ 整站禁用）、UI-05（多内容页任务互不串）、
 * UI-09（未配模型的可读错误，非无限 loading）、UI-11（与网页助手并发）。
 *
 * 用 `wxt build` 产物 + `e2e/mock-llm.ts`（确定性，不依赖真实模型）。
 * **UI-01a 必须用有头**：无头下 `sidePanel.open()` 不产生真实 SIDE_PANEL 表面，
 * 该用例会自动 skip —— 请用 `pnpm test:e2e:headed`（`E2E_HEADED=1`）。
 */
import type { Page, Worker } from '@playwright/test';
import { mockPlan, mockTools } from './mock-llm';
import {
  E2E_HEADED,
  OLLAMA_HOST,
  OLLAMA_SETTINGS,
  agentUi,
  ensureTestPages,
  expect,
  mockSettings,
  openAgentSurface,
  openContentPage,
  readCounters,
  resetCounters,
  resetMockLlm,
  seedAgentPrefs,
  seedSettings,
  stopMockLlm,
  test,
  testPageUrl,
} from './fixtures';

/** 共享页面悬浮入口（壳默认收起，指针移入停留 150ms 才展开动作面板） */
const FAB_HOST = 'dualmind-page-fab';
const FAB_TRIGGER = `${FAB_HOST} .dm-pf-trigger`;
const AGENT_ITEM = `${FAB_HOST} [data-action="agent-open"]`;
const TOOLBAR_HOST = 'dualmind-toolbar';

const PLAN = mockPlan(['观察页面元素', '按目标操作', '汇报结果']);

/** 一条「填姓名」的确定性工具脚本（复用最多） */
const FILL_NAME = (value: string) =>
  mockTools([{ name: 'fill', pick: { labelIncludes: '姓名' }, args: { value } }]);

/** 点击悬浮入口里的「请 Agent 操作本页」 */
async function clickAgentFab(page: Page): Promise<void> {
  await page.locator(FAB_TRIGGER).hover();
  const item = page.locator(AGENT_ITEM);
  await expect(item).toBeVisible();
  await item.click();
}

/** 真实 Side Panel 上下文数量（用于判定「打开的是侧栏，不是标签页」） */
function sidePanelCount(worker: Worker): Promise<number> {
  return worker.evaluate(async () => {
    const g = globalThis as unknown as {
      chrome: {
        runtime: {
          getContexts?: (f: { contextTypes: string[] }) => Promise<unknown[]>;
        };
      };
    };
    if (!g.chrome.runtime.getContexts) return 0;
    const list = await g.chrome.runtime.getContexts({
      contextTypes: ['SIDE_PANEL'],
    });
    return list.length;
  });
}

/** 回读 FAB 信箱（`local:agentPending`）；被侧栏消费后为 null */
function readAgentPending(worker: Worker): Promise<unknown> {
  return worker.evaluate(async () => {
    const g = globalThis as unknown as {
      chrome: {
        storage: {
          local: { get: (k: string) => Promise<Record<string, unknown>> };
        };
      };
    };
    const stored = await g.chrome.storage.local.get('agentPending');
    return stored.agentPending ?? null;
  });
}

/**
 * 打开一张封板测试页，但**不等待**内容脚本就绪。
 *
 * 为什么不能复用 `openContentPage`：它要等 `[data-dm-toolbar-ready]`，
 * 而 UI-04b（整站停用）的期望恰是内容脚本**早退、什么都不注入** ——
 * 用它会一直等到超时。这里改成「加载完再留一段时间给异步读设置」，
 * 与 `e2e/immersive.e2e.ts`「禁用站点不注入悬浮入口」同款做法。
 */
async function openPageWithoutContentScript(
  page: Page,
  pathname: string,
): Promise<void> {
  await ensureTestPages();
  await page.goto(testPageUrl(pathname));
  await page.waitForLoadState('load');
  await page.waitForTimeout(1_500);
}

test.afterAll(async () => {
  await stopMockLlm();
});

test.describe('Agent · 入口与 UI（B8）', () => {
  /* ------------------------------------------------------------------
   * UI-01a · 真实侧栏（有头）
   * ------------------------------------------------------------------ */
  test('UI-01a · FAB「请 Agent 操作本页」打开的是**真实侧栏**而非标签页', async ({
    context,
    serviceWorker,
  }) => {
    test.skip(!E2E_HEADED, '真实 Side Panel 需要有头窗口：请用 E2E_HEADED=1 运行');

    // 本用例不需要模型：只验证「打开侧栏 + 投递信箱」，不启动任务。
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await seedAgentPrefs(serviceWorker, { enabled: true, maxSteps: 20 });

    const contentPage = await openContentPage(context, '/t1-static-form');
    await contentPage.bringToFront();
    await resetCounters(contentPage);

    const urlsBefore = context.pages().map((p) => p.url());
    await clickAgentFab(contentPage);

    // ① 真实 SIDE_PANEL 表面出现。若打开的是普通标签页，这里恒为 0 ⇒ 判 FAIL。
    await expect
      .poll(() => sidePanelCount(serviceWorker), { timeout: 15_000 })
      .toBe(1);

    // ② 没有任何新标签页被打开 —— 排除「用普通标签页冒充侧栏」。
    const urlsAfter = context.pages().map((p) => p.url());
    expect(urlsAfter.filter((url) => !urlsBefore.includes(url))).toEqual([]);

    // ③ 信箱被消费：证明是**真的面板**加载并处理了 open 动作，
    //    而不是只把 storage 写脏就完事。
    await expect.poll(() => readAgentPending(serviceWorker)).toBeNull();

    // ④ 只刷新绑定、不自动启动：目标页零写入。
    expect((await readCounters(contentPage)).actions).toHaveLength(0);
  });

  /* ------------------------------------------------------------------
   * UI-01b · 信箱承接 / 不自动启动（无头，逻辑层）
   * UI-01a 只能证明「表面是侧栏」，面板内部行为用这条补：侧栏把
   * sidepanel.html 当普通标签页打开时，逻辑与真实侧栏完全同源。
   * ------------------------------------------------------------------ */
  test('UI-01b · 侧栏承接信箱：自动切 Agent Tab、目标框为空、零写入', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    // 用 `hang` 作脚本：整条用例**不应**产生任何模型请求（cursor 保持 0），
    // 一旦有人把「打开即自动规划」加回来，这里会立刻暴露。
    const mock = await resetMockLlm([{ type: 'hang' }]);
    await seedSettings(serviceWorker, mockSettings(mock));
    await seedAgentPrefs(serviceWorker, { enabled: true, maxSteps: 20 });

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    // 面板常驻挂载 Agent（非当前 Tab 时 `hidden`）⇒ 初始应不可见（默认停在翻译 Tab）
    await expect(panel.getByText('本页操作 Agent', { exact: true })).toBeHidden();

    const contentPage = await openContentPage(context, '/t1-static-form');
    await contentPage.bringToFront();
    await resetCounters(contentPage);

    await clickAgentFab(contentPage);

    const ui = agentUi(panel);
    // ① 信箱被消费 → 自动切到 Agent Tab
    await expect(
      panel.getByText('本页操作 Agent', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // ② 只刷新绑定，不自动启动：目标框为空、无计划卡、无批准入口
    await expect(ui.goal).toHaveValue('');
    await expect(panel.getByText('请确认执行计划')).toHaveCount(0);
    await expect(ui.approve).toHaveCount(0);
    // 「开始」存在但**因空目标而禁用**（AG-16 的既有语义）；同时不存在「停止」
    // ⇒ 面板确实空闲，没有被信箱顺带启动任务。
    await expect(ui.start).toBeVisible();
    await expect(ui.start).toBeDisabled();
    await expect(ui.stop).toHaveCount(0);
    await expect(ui.goal).toBeEnabled();

    // ③ 绑定页 = 当前内容页（用 pageLabel 的 title 属性精确定位，避免歧义）
    await expect(panel.locator('p[title*="T1 静态表单"]')).toBeVisible();

    // ④ 零写入 + 模型零调用
    expect((await readCounters(contentPage)).actions).toHaveLength(0);
    expect(mock.cursor()).toBe(0);
  });

  /* ------------------------------------------------------------------
   * UI-03 · 关 FAB 后 Agent 仍可用（入口分离）
   * ------------------------------------------------------------------ */
  test('UI-03 · 关闭悬浮入口后划词与 Agent 都照常（入口级开关）', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const mock = await resetMockLlm([
      PLAN,
      mockTools([{ name: 'snapshot' }]),
      FILL_NAME('张三'),
      mockTools([{ name: 'finish', args: { summary: '已填写', success: true } }]),
    ]);
    // 关键：必须在**内容脚本挂载之前**就写好 pageFabEnabled=false，
    // 否则入口已经建壳，改设置不会把它收回去。
    await seedSettings(serviceWorker, {
      ...mockSettings(mock),
      pageFabEnabled: false,
    });
    await seedAgentPrefs(serviceWorker, { enabled: true, maxSteps: 20 });

    const agentPage = await openAgentSurface(context, extensionId, 'workspace');
    const contentPage = await openContentPage(context, '/t1-static-form');
    await resetCounters(contentPage);

    // 悬浮入口未注入；划词工具栏照旧（两者是**相互独立**的开关）
    await expect(contentPage.locator(FAB_HOST)).toHaveCount(0);
    await expect(contentPage.locator(TOOLBAR_HOST)).toHaveCount(1);

    // Agent 依旧可用：完整跑通一条写入任务
    const ui = agentUi(agentPage);
    await ui.goal.fill('把姓名填成张三');
    await ui.start.click();
    await ui.approve.click();
    await expect(contentPage.locator('#dm-name')).toHaveValue('张三', {
      timeout: 60_000,
    });
    await expect(agentPage.getByText('任务成功完成')).toBeVisible({
      timeout: 60_000,
    });
  });

  /* ------------------------------------------------------------------
   * UI-04a / UI-04b · 隐藏 FAB ≠ 整站禁用
   * ------------------------------------------------------------------ */
  test('UI-04a · 站点隐藏列表只关悬浮入口，划词仍可用', async ({
    context,
    serviceWorker,
  }) => {
    await seedSettings(serviceWorker, {
      ...OLLAMA_SETTINGS,
      pageFabHiddenHosts: ['127.0.0.1'],
    });

    const page = await context.newPage();
    await openPageWithoutContentScript(page, '/t1-static-form');

    await expect(page.locator(FAB_HOST)).toHaveCount(0);
    // 这条是 UI-04 的判据核心：隐藏 FAB **不等于**整站禁用
    await expect(page.locator(TOOLBAR_HOST)).toHaveCount(1);
  });

  test('UI-04b · 整站停用后划词与悬浮入口都不注入', async ({
    context,
    serviceWorker,
  }) => {
    await seedSettings(serviceWorker, {
      ...OLLAMA_SETTINGS,
      disabledHosts: ['127.0.0.1'],
    });

    const page = await context.newPage();
    await openPageWithoutContentScript(page, '/t1-static-form');

    await expect(page.locator(FAB_HOST)).toHaveCount(0);
    await expect(page.locator(TOOLBAR_HOST)).toHaveCount(0);
  });

  /* ------------------------------------------------------------------
   * UI-05 · 两个内容页各自绑定，任务互不串页
   * ------------------------------------------------------------------ */
  test('UI-05 · 两个内容页各起一个任务：只写各自绑定的页', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const mock = await resetMockLlm([
      // ① 两次规划（A、B 各一次，顺序 = 两次 start 的顺序）
      PLAN,
      PLAN,
      // ② 批准 A → A 的 tool 环
      mockTools([{ name: 'snapshot' }]),
      FILL_NAME('张三'),
      mockTools([{ name: 'finish', args: { summary: 'A 完成', success: true } }]),
      // ③ 批准 B → B 的 tool 环
      mockTools([{ name: 'snapshot' }]),
      FILL_NAME('李四'),
      mockTools([{ name: 'finish', args: { summary: 'B 完成', success: true } }]),
    ]);
    await seedSettings(serviceWorker, mockSettings(mock));
    await seedAgentPrefs(serviceWorker, { enabled: true, maxSteps: 20 });

    // 绑定发生在**启动时**（锁定当时的活动内容页），因此必须
    // 「各自 start 完（停在 awaiting_plan）再逐条批准」，否则第二次开页会把 A 的绑定顶掉。
    const panelA = await openAgentSurface(context, extensionId, 'workspace');
    const pageA = await openContentPage(context, '/t1-static-form');
    await resetCounters(pageA);
    const uiA = agentUi(panelA);
    await uiA.goal.fill('把姓名填成张三');
    await uiA.start.click();
    await expect(panelA.getByText('请确认执行计划')).toBeVisible({
      timeout: 60_000,
    });

    const panelB = await openAgentSurface(context, extensionId, 'sidepanel');
    const pageB = await openContentPage(context, '/t1-static-form');
    await resetCounters(pageB);
    const uiB = agentUi(panelB);
    await uiB.goal.fill('把姓名填成李四');
    await uiB.start.click();
    await expect(panelB.getByText('请确认执行计划')).toBeVisible({
      timeout: 60_000,
    });

    // 批准 A → 只写页 A，页 B 保持原样
    await uiA.approve.click();
    await expect(pageA.locator('#dm-name')).toHaveValue('张三', {
      timeout: 60_000,
    });
    await expect(panelA.getByText('任务成功完成')).toBeVisible({
      timeout: 60_000,
    });
    await expect(pageB.locator('#dm-name')).toHaveValue('');

    // 批准 B → 只写页 B，且**不覆盖**页 A 已经写好的值
    await uiB.approve.click();
    await expect(pageB.locator('#dm-name')).toHaveValue('李四', {
      timeout: 60_000,
    });
    await expect(panelB.getByText('任务成功完成')).toBeVisible({
      timeout: 60_000,
    });
    await expect(pageA.locator('#dm-name')).toHaveValue('张三');

    // 写入计数：每页恰好 1 次 ⇒ 没有任何跨页重放 / 重复写入
    expect((await readCounters(pageA)).counts['input:dm-name']).toBe(1);
    expect((await readCounters(pageB)).counts['input:dm-name']).toBe(1);
  });

  /* ------------------------------------------------------------------
   * UI-09 缺口 · 未配模型 → 可读错误，且不无限 loading
   * （其余 UI-09 子项已由 agent-entry / agent-plan / agent-network 覆盖）
   * ------------------------------------------------------------------ */
  test('UI-09 · 未配模型：给出可读错误并回到可重试状态', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    // openai-compatible 但 Key 为空 —— Provider 在**发请求前**就拒绝（零网络）。
    await seedSettings(serviceWorker, {
      providerType: 'openai-compatible',
      targetLanguage: 'zh-CN',
      toolbarTrigger: 'shortcut',
      disabledHosts: [],
      openai: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o-mini',
      },
      ollama: { host: OLLAMA_HOST, model: '' },
    });
    await seedAgentPrefs(serviceWorker, { enabled: true, maxSteps: 20 });

    const agentPage = await openAgentSurface(context, extensionId, 'workspace');
    await openContentPage(context, '/t1-static-form');

    const ui = agentUi(agentPage);
    await ui.goal.fill('把姓名填成张三');
    await ui.start.click();

    // ① 用户可读的原因（不是统一兜底文案，也不是 JS 堆栈）。
    //    选择器必须同时限定「可见」+「红色错误段落」+ 精确文案：
    //    - 翻译 Tab 常驻挂载，同文案在那里还有个 `<span class="text-red-600">`；
    //    - 另有一处提示 `请先在设置中填写 API Key 去设置`（带尾巴的 `<p>`）。
    //    只有面板时间线里的 `<p class="mt-2 text-xs text-red-700">` 是 Agent 的真实报错。
    await expect(
      agentPage.locator('p.text-red-700:visible', {
        hasText: '请先在设置中填写 API Key',
      }),
    ).toBeVisible({ timeout: 60_000 });

    // ② 非无限 loading：输入与「开始」都回到可用态，用户可改配置后重试
    await expect(ui.goal).toBeEnabled();
    await expect(ui.start).toBeEnabled();
  });

  /* ------------------------------------------------------------------
   * UI-11 · 与网页助手并发：互不打断，两边都不写页面
   *
   * 说明（范围收敛）：本条覆盖「Agent + 网页助手」并发。
   * 沉浸译与 Agent 的并发未并入本条 —— 沉浸译按段落逐次调用模型，
   * 与 Agent 共用同一个有序 mock 脚本时步数不可预知（会随分段数漂移），
   * 强行合并只会得到不稳定用例。沉浸译自身由 `e2e/immersive.e2e.ts` 覆盖，
   * 三功能同页并发保留为 runbook B8 Step 3 的人工项。
   * ------------------------------------------------------------------ */
  test('UI-11 · Agent 与网页助手并发：都不被彼此打断，且都不写页面', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const mock = await resetMockLlm([
      // ① 网页摘要：慢响应（6s）。它在途时正好留出窗口让 Agent 完成规划 ——
      //    mock 的 `nextStep()` 在**请求到达时**同步消费，所以「谁先发请求」决定脚本顺序。
      { type: 'text', content: '这是一段由 mock 流式返回的中文摘要。', delayMs: 6_000 },
      // ② Agent 规划
      PLAN,
      // ③ Agent 只读 tool 环
      mockTools([{ name: 'snapshot' }]),
      mockTools([{ name: 'finish', args: { summary: '只读观察完成', success: true } }]),
    ]);
    await seedSettings(serviceWorker, mockSettings(mock));
    await seedAgentPrefs(serviceWorker, { enabled: true, maxSteps: 20 });

    // 先开内容页，工作台才能绑定到它（与 chat.e2e.ts 同序）
    const contentPage = await openContentPage(context, '/t5-long-text');
    await resetCounters(contentPage);

    const chatPage = await context.newPage();
    await chatPage.goto(`chrome-extension://${extensionId}/workspace.html`);
    await chatPage.getByRole('button', { name: '网页助手', exact: true }).click();
    await chatPage.bringToFront();
    await expect(chatPage.getByTestId('chat-bound-page')).toContainText(
      '127.0.0.1',
      { timeout: 20_000 },
    );

    const agentPage = await openAgentSurface(context, extensionId, 'sidepanel');
    const ui = agentUi(agentPage);

    // ① 先发起网页摘要，确认它真的在流式
    await chatPage.getByRole('button', { name: '总结本页' }).click();
    // `.first()`：两个面板都常驻挂载，用 DOM 顺序取「网页助手」那个（翻译/助手在前，Agent 在后）
    const chatStop = chatPage
      .getByRole('button', { name: '停止', exact: true })
      .first();
    await expect(chatStop).toBeVisible({ timeout: 40_000 });

    // ② 摘要仍在流式时启动 Agent —— 两条链路必须能同时在途
    await contentPage.bringToFront();
    await ui.goal.fill('只观察页面，不要修改任何内容');
    await ui.start.click();
    await expect(agentPage.getByText('请确认执行计划')).toBeVisible({
      timeout: 60_000,
    });
    // 并存断言：Agent 走到计划闸门时，摘要**依旧**在流式（未被抢占 / 打断）
    await expect(chatStop).toBeVisible();

    // ③ 批准 Agent 的只读计划 → 正常完成
    await ui.approve.click();
    await expect(agentPage.getByText('任务成功完成')).toBeVisible({
      timeout: 60_000,
    });

    // ④ 摘要最终也正常完成并落盘（没被 Agent 波及）
    const assistant = chatPage.getByTestId('chat-turn-assistant').first();
    await expect(assistant).toContainText(/[\u4e00-\u9fff]/, {
      timeout: 60_000,
    });
    await expect(assistant).not.toContainText('正在生成…');

    // ⑤ 两边都不写页面：Agent 是只读目标，网页助手本身只读
    expect((await readCounters(contentPage)).actions).toHaveLength(0);
  });
});
