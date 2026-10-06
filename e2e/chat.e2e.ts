/**
 * V2 网页摘要 / 网页问答 E2E
 *
 * 依赖 `wxt build` 产物与真实本地 Ollama（见 fixtures.ts）；不进 CI，本地手动执行。
 *
 * 覆盖分层（对齐 docs/features.md 的 chat 契约）：
 * - UI：聊天 Tab 空态、总结本页、停止中断、会话持久化与历史恢复、右键信箱自动执行
 * - 内容脚本：`content:chat-extract` 整页 / 选区提取（直接发消息，绕开「活动标签页」的不确定性）
 *
 * 说明：真实右键菜单无法在 Playwright 中点击，右键入口改为「直接写 storage 信箱」再打开侧栏，
 * 覆盖的是与真实右键相同的下游链路（Background 写信箱 → WorkbenchApp 消费 → ChatPanel 执行）。
 */
import type { Page, Worker } from '@playwright/test';
import {
  OLLAMA_SETTINGS,
  expect,
  seedSettings,
  selectText,
  test,
} from './fixtures';

/** 从 service worker 回读全局聊天会话（`local:chatSessions`） */
async function readChatSessions(
  worker: Worker,
): Promise<Record<string, unknown>[]> {
  return worker.evaluate(async () => {
    const g = globalThis as unknown as {
      chrome: {
        storage: {
          local: { get: (key: string) => Promise<Record<string, unknown>> };
        };
      };
    };
    const stored = await g.chrome.storage.local.get('chatSessions');
    return (stored.chatSessions ?? []) as Record<string, unknown>[];
  });
}

/** 回读右键信箱（`local:chatPending`），用于断言「消费即清空」 */
async function readChatPending(worker: Worker): Promise<unknown> {
  return worker.evaluate(async () => {
    const g = globalThis as unknown as {
      chrome: {
        storage: {
          local: { get: (key: string) => Promise<Record<string, unknown>> };
        };
      };
    };
    const stored = await g.chrome.storage.local.get('chatPending');
    return stored.chatPending ?? null;
  });
}

/**
 * 直接写入右键菜单信箱，等价于用户在页面上点了「用 DualMind 总结本页」。
 * 与 Background 的 `setChatPending` 写同样的形状（kind + createdAt）。
 */
async function seedChatPending(worker: Worker): Promise<void> {
  await worker.evaluate(async () => {
    const g = globalThis as unknown as {
      chrome: {
        storage: {
          local: { set: (items: Record<string, unknown>) => Promise<void> };
        };
      };
    };
    await g.chrome.storage.local.set({
      chatPending: { kind: 'summarize', createdAt: Date.now() },
    });
  });
}

/** 直接写入一条「来自其他页面」的旧会话，用于验证来源不一致时的确认流程 */
async function seedForeignSession(worker: Worker): Promise<void> {
  await worker.evaluate(async () => {
    const g = globalThis as unknown as {
      chrome: {
        storage: {
          local: { set: (items: Record<string, unknown>) => Promise<void> };
        };
      };
    };
    const now = Date.now();
    await g.chrome.storage.local.set({
      chatSessions: [
        {
          id: 'dmchat-seed-1',
          title: '来自其他页面的旧会话',
          pageUrl: 'https://other.example.com/article',
          pageTitle: 'Other Article',
          turns: [
            { id: 't1', role: 'user', content: '旧问题', createdAt: now - 2000 },
            {
              id: 't2',
              role: 'assistant',
              content: '旧回答',
              createdAt: now - 1000,
            },
          ],
          createdAt: now - 3000,
          updatedAt: now - 1000,
        },
      ],
    });
  });
}

/**
 * 从扩展页按 URL 找到内容页标签 id。
 * 持久化 context 可能先开一个空白标签，用「排除自身」会误选，故直接按 URL 锁定。
 */
async function findContentTabId(page: Page, urlPart: string): Promise<number> {
  return page.evaluate(async (part) => {
    const g = globalThis as unknown as {
      browser: {
        tabs: {
          query: (
            info: Record<string, never>,
          ) => Promise<{ id?: number; url?: string }[]>;
        };
      };
    };
    const all = await g.browser.tabs.query({});
    return all.find((tab) => (tab.url ?? '').includes(part))?.id ?? -1;
  }, urlPart);
}

/** 打开全页工作台并切到「聊天」Tab */
async function openChatWorkspace(
  page: Page,
  extensionId: string,
): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/workspace.html`);
  await page.getByRole('button', { name: '聊天', exact: true }).click();
  // `.first()`：副标题 <p> 与其父容器文本相同，避免严格模式命中多个
  await expect(page.getByText('全页工作台 · 网页问答').first()).toBeVisible();
}

test.describe('V2 网页摘要 / 问答', () => {
  test('聊天 Tab 为空态引导，占位文案已移除', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await openChatWorkspace(page, extensionId);

    // 三态里的「空态」：引导文案 + 上下文范围控件，且不再出现旧占位
    await expect(
      page.getByText(/点「总结本页」快速抓取要点/).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('radiogroup', { name: '上下文范围' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '总结本页' })).toBeVisible();
    await expect(page.getByText('聊天（即将推出）')).toHaveCount(0);
  });

  test('内容脚本：content:chat-extract 提取整页 / 选区上下文', async ({
    context,
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await page.goto('https://example.com');
    // 扩展宿主出现 = 内容脚本已挂载（含 chat 上下文监听）
    await expect(page.locator('dualmind-immersive')).toHaveCount(1);

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/workspace.html`);
    const tabId = await findContentTabId(panel, 'example.com');
    expect(tabId).toBeGreaterThanOrEqual(0);

    const extract = (scope: 'page' | 'selection') =>
      panel.evaluate(
        (args) =>
          (
            globalThis as unknown as {
              browser: {
                tabs: {
                  sendMessage: (
                    id: number,
                    message: unknown,
                  ) => Promise<unknown>;
                };
              };
            }
          ).browser.tabs.sendMessage(args.tabId, {
            type: 'content:chat-extract',
            scope: args.scope,
            maxChars: 12000,
          }),
        { tabId, scope },
      );

    // ① 整页：应回报 page 范围 + 非空段落
    const pageCtx = (await extract('page')) as {
      scope: string;
      url: string;
      segments: { text: string }[];
      totalChars: number;
    };
    expect(pageCtx.scope).toBe('page');
    expect(pageCtx.url).toContain('example.com');
    expect(pageCtx.segments.length).toBeGreaterThan(0);
    expect(pageCtx.totalChars).toBeGreaterThan(0);

    // ② 选区：选中一段文字后，应如实回报 selection 范围
    await selectText(page, 'DualMind selection context probe sentence.');
    const selCtx = (await extract('selection')) as {
      scope: string;
      segments: { text: string }[];
    };
    expect(selCtx.scope).toBe('selection');
    expect(selCtx.segments).toHaveLength(1);
    expect(selCtx.segments[0]?.text).toContain('selection context probe');
  });

  test('总结本页：读取整页上下文、流式返回中文、会话落盘', async ({
    context,
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);

    // 先开内容页（提供网页上下文），再开工作台；工作台点的「总结本页」取的是活动标签页
    await page.goto('https://example.com');
    await expect(page.locator('dualmind-immersive')).toHaveCount(1);

    const panel = await context.newPage();
    await openChatWorkspace(panel, extensionId);

    // 把内容页切回前台，chat:context 才会取到它（而不是扩展页自身）
    await page.bringToFront();
    await panel.getByRole('button', { name: '总结本页' }).click();

    // ① 上下文状态行：整页 + 段落数
    await expect(panel.getByText(/整页 · \d+ 段/).first()).toBeVisible({
      timeout: 40_000,
    });

    // ② 助手回复流式产出中文（用户提问也是中文，故必须锁定助手气泡）
    const assistant = panel.getByTestId('chat-turn-assistant').first();
    await expect(assistant).toContainText(/[\u4e00-\u9fff]/, {
      timeout: 150_000,
    });
    await expect(assistant).not.toContainText('正在生成…');

    // ③ 会话落盘：2 条消息（提问 + 回复），来源页记录正确
    await expect
      .poll(async () => (await readChatSessions(serviceWorker)).length)
      .toBe(1);
    const session = (await readChatSessions(serviceWorker))[0];
    if (!session) throw new Error('会话未落盘');
    expect((session.turns as unknown[]).length).toBe(2);
    expect(String(session.pageUrl)).toContain('example.com');
    expect(String(session.pageTitle).length).toBeGreaterThan(0);
  });

  test('停止：中断在途流式、不标记失败', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await openChatWorkspace(page, extensionId);

    await page.getByRole('button', { name: '总结本页' }).click();
    // 流式开始后按钮切为「停止」
    const stop = page.getByRole('button', { name: '停止' });
    await expect(stop).toBeVisible({ timeout: 40_000 });
    await stop.click();

    // 中断后回到可发送态，且不出现错误横幅（取消不算失败）
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('.text-red-700')).toHaveCount(0);
  });

  test('右键信箱：打开侧栏自动总结，消费即清空，历史可恢复', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    await seedChatPending(serviceWorker);

    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // ① 自动切到聊天 Tab（副标题随之变化）并自动发起提问
    await expect(page.getByText('AI 助手 · 网页问答').first()).toBeVisible();
    await expect(page.getByTestId('chat-turn-user')).toContainText(
      '请总结当前网页',
    );
    const assistant = page.getByTestId('chat-turn-assistant').first();
    await expect(assistant).toContainText(/[\u4e00-\u9fff]/, {
      timeout: 150_000,
    });

    // ② 信箱消费即清空（TTL 内只执行一次）
    expect(await readChatPending(serviceWorker)).toBeNull();

    // ③ 等会话真正落盘后再重开面板（流式未结束时 reload 会打断 persist，
    //    表现为「历史为空」——这是曾经的用例缺陷，不是产品问题）
    await expect
      .poll(async () => (await readChatSessions(serviceWorker)).length)
      .toBe(1);

    // ④ 重开面板：会话仍在「历史」里（按首条提问推导标题）
    await page.reload();
    await page.getByRole('button', { name: '聊天', exact: true }).click();
    await page.getByRole('button', { name: /^历史/ }).click();
    await expect(
      page.getByText('请总结当前网页的核心内容，说明主要观点与结论。'),
    ).toBeVisible();
  });

  test('会话来源不一致：发送前确认，取消则不发送', async ({
    context,
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedSettings(serviceWorker, OLLAMA_SETTINGS);
    // 种一个「来自 other.example.com」的旧会话
    await seedForeignSession(serviceWorker);

    // 关键：真实侧栏不是标签页，`chat:page-info` 取的是**活动标签页**。
    // E2E 把 sidepanel.html 当标签页打开时，活动页会变成扩展页（chrome-extension://，
    // 无 url 可读）→ 无法比较。故这里让一张真实网页占据活动位，面板开在另一张标签页，
    // 与真实「sidebar + 网页」的形态一致。
    await page.goto('https://example.com');
    await expect(page.locator('dualmind-immersive')).toHaveCount(1);

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.getByRole('button', { name: '聊天', exact: true }).click();

    // 打开旧会话：来源页 other.example.com，当前活动页 example.com，必然不一致
    await panel.getByRole('button', { name: /^历史/ }).click();
    // 限定以标题开头的按钮，避免命中「删除会话 …」（aria-label 也含标题）
    await panel
      .getByRole('button', { name: /^来自其他页面的旧会话/ })
      .click();
    // 让 example.com 保持活动标签页
    await page.bringToFront();

    await panel.getByPlaceholder(/就当前网页提问/).fill('这个会话还能继续吗？');
    await panel.getByRole('button', { name: '发送', exact: true }).click();

    // ① 出现确认条，且此刻尚未发出（消息区仍是旧会话的 2 条）
    const confirmBar = panel.getByTestId('chat-mismatch-confirm');
    await expect(confirmBar).toBeVisible();
    await expect(panel.getByTestId('chat-turn-user')).toHaveCount(1);
    await expect(panel.getByTestId('chat-turn-assistant')).toHaveCount(1);

    // ② 取消 → 确认条消失，仍未新增消息
    await panel.getByRole('button', { name: '取消' }).click();
    await expect(confirmBar).toBeHidden();
    await expect(panel.getByTestId('chat-turn-user')).toHaveCount(1);
  });
});
