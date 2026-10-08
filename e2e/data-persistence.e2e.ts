/**
 * DATA-03 / DATA-04 · 持久化与「关闭浏览器再打开」（runbook **B10 · Step 6**）
 *
 * 与单测的分工：
 * - 迁移**规则**（未迁移+auto / 已迁移 / 已是 shortcut / 空值）已由
 *   `shared/storage/migrations.test.ts` 4 条用例覆盖，这里不重复；
 * - 这里补的是单测做不到的部分：**真实 storage 读写、真实注入前的迁移触发时机、
 *   以及「关掉浏览器再打开」的落盘 / 不恢复语义**。
 *
 * 为什么 DATA-03 必须显式清空 `local:migrations`：`e2e/fixtures.ts` 的 `seedSettings`
 * 会预置全部迁移标记（`APPLIED_MIGRATIONS`），不显式清空的话迁移根本不会触发，
 * 断言会「因为什么都没发生」而假通过 —— 这正是 runbook 里标出的防呆点。
 */
import { MIGRATION_IDS } from '../shared/storage/migrations';
import { mockPlan } from './mock-llm';
import {
  USER_DATA_DIR,
  agentUi,
  expect,
  launchExtensionContext,
  openAgentSurface,
  openContentPage,
  readAgentPrefs,
  readCounters,
  readSettings,
  seedSettings,
  setupAgentTest,
  stopMockLlm,
  test,
} from './fixtures';
import type { Worker } from '@playwright/test';

const PLAN = mockPlan(['观察页面元素', '按目标操作', '汇报结果']);

/** 直接读底层 storage 全量键（用于断言「没有 Agent 运行态残留」） */
function dumpStorage(worker: Worker): Promise<Record<string, unknown>> {
  return worker.evaluate(async () => {
    const g = globalThis as unknown as {
      chrome: {
        storage: {
          local: { get: (k: null) => Promise<Record<string, unknown>> };
        };
      };
    };
    return g.chrome.storage.local.get(null);
  });
}

/**
 * 构造旧状态并**在同一次 evaluate 内**回读校验。
 *
 * 为什么必须合并成一次 evaluate：Background 监听 `storage.onChanged`
 * （`settings` 变化 → `refreshContextMenuEnabled()` → `getSettings()` → `runMigrations()`），
 * 所以「写 auto + 清空标记」后只要让出一轮 CDP 往返，SW 就会抢先把值迁移掉，
 * 前置断言随即随机失败（在整套 E2E 里必现，单独跑该文件时偶尔侥幸通过）。
 * 同一次 evaluate 里紧跟 `set()` 回读，SW 的事件回调没有机会插入，才得到可靠屏障。
 */
async function seedLegacyToolbarAutoChecked(worker: Worker): Promise<{
  toolbarTrigger: unknown;
  migrations: unknown;
}> {
  return worker.evaluate(async () => {
    const g = globalThis as unknown as {
      chrome: {
        storage: {
          local: {
            get: (k: string | string[]) => Promise<Record<string, unknown>>;
            set: (items: Record<string, unknown>) => Promise<void>;
          };
        };
      };
    };
    const stored = await g.chrome.storage.local.get('settings');
    const current = (stored.settings ?? {}) as Record<string, unknown>;
    await g.chrome.storage.local.set({
      settings: { ...current, toolbarTrigger: 'auto' },
      migrations: [],
    });
    const after = await g.chrome.storage.local.get(['settings', 'migrations']);
    const settings = (after.settings ?? {}) as Record<string, unknown>;
    return { toolbarTrigger: settings.toolbarTrigger, migrations: after.migrations };
  });
}

test.afterAll(async () => {
  await stopMockLlm();
});

/** 直接写一条 Chat 会话（等价于「重启前用户聊过」） */
async function seedChatSession(worker: Worker): Promise<void> {
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
          id: 'dmchat-persist-1',
          title: '重启前的会话',
          pageUrl: 'http://127.0.0.1:4173/t5-long-text',
          pageTitle: 'T5 长文页 · DualMind 封板',
          turns: [
            { id: 't1', role: 'user', content: '总结本页', createdAt: now - 2000 },
            {
              id: 't2',
              role: 'assistant',
              content: '这是一段本地留存的回答。',
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

/** 直接改 Agent 偏好（用于验证「偏好持久化」与「运行态不持久化」区分开） */
async function setAgentPrefsMaxSteps(
  worker: Worker,
  maxSteps: number,
): Promise<void> {
  await worker.evaluate(async (steps) => {
    const g = globalThis as unknown as {
      chrome: {
        storage: {
          local: {
            get: (k: string) => Promise<Record<string, unknown>>;
            set: (items: Record<string, unknown>) => Promise<void>;
          };
        };
      };
    };
    const stored = await g.chrome.storage.local.get('agentPrefs');
    await g.chrome.storage.local.set({
      agentPrefs: {
        ...((stored.agentPrefs ?? {}) as Record<string, unknown>),
        enabled: true,
        maxSteps: steps,
      },
    });
  }, maxSteps);
}

test.describe('持久化与升级（B10 · Step 6）', () => {
  /**
   * DATA-03 · 迁移只执行一次，且之后不再覆盖用户的手动选择。
   *
   * 触发路径：内容脚本挂载时会 `settings:get` → Background `getSettings()` → `runMigrations()`。
   * 所以「打开一张内容页」就是真实产品里迁移必然发生的时刻。
   */
  test('DATA-03 · 旧默认 auto 迁移为 shortcut，且不重复覆盖用户改回的值', async ({
    context,
    serviceWorker,
  }) => {
    await seedSettings(serviceWorker, { toolbarTrigger: 'auto' });

    // 前置断言：确认构造生效（标记为空 + 值为 auto），否则后面的 PASS 毫无意义。
    // 必须用「写 + 读同一次 evaluate」的版本，详见 seedLegacyToolbarAutoChecked 注释。
    const legacy = await seedLegacyToolbarAutoChecked(serviceWorker);
    expect(legacy.toolbarTrigger).toBe('auto');
    expect(legacy.migrations).toEqual([]);

    // 打开内容页 → 触发一次真实的 settings:get → 迁移
    await openContentPage(context, '/t1-static-form');

    await expect
      .poll(async () => (await readSettings(serviceWorker)).toolbarTrigger)
      .toBe('shortcut');
    expect(
      await dumpStorage(serviceWorker).then((s) => s.migrations),
    ).toContain(MIGRATION_IDS.toolbarDefaultShortcut);

    // —— 幂等性：用户**主动**改回 auto 后，不能被迁移再次覆盖 ——
    await seedSettings(serviceWorker, { toolbarTrigger: 'auto' });
    expect((await readSettings(serviceWorker)).toolbarTrigger).toBe('auto');

    // 再开一张内容页（再次触发 getSettings → runMigrations）
    await openContentPage(context, '/t3-dynamic');

    // 标记在册 ⇒ shouldMigrateToolbarTrigger 返回 false ⇒ 用户的选择被保留
    await expect
      .poll(async () => (await readSettings(serviceWorker)).toolbarTrigger)
      .toBe('auto');
  });

  /**
   * DATA-04 · 关闭浏览器再打开：设置与 Chat 历史保留；Agent 运行态**不恢复、不重放**。
   *
   * 半自动化说明：Playwright 无法真的「退出 Chrome 进程」，这里用**关闭并重开同一份
   * persistent profile** 逼近 —— 扩展 storage 落在 profile 内，语义等价于浏览器重启；
   * 是否还有别的残留（内存态）本就该在重启后消失，正是本条要证明的。
   */
  test('DATA-04 · 重启后设置与 Chat 历史保留、Agent 运行态不恢复', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    // 制造「重启前有一个停在 awaiting_plan 的在途任务」
    const { agentPage, ui } = await setupAgentTest(
      serviceWorker,
      context,
      extensionId,
      { script: [PLAN], pagePath: '/t1-static-form' },
    );
    await ui.goal.fill('把姓名填成张三');
    await ui.start.click();
    await expect(agentPage.getByText('状态：awaiting_plan')).toBeVisible({
      timeout: 60_000,
    });

    // 备份三份状态：设置、Chat 历史、Agent 偏好
    await seedSettings(serviceWorker, {
      targetLanguage: 'en',
      toolbarTrigger: 'shortcut',
    });
    await seedChatSession(serviceWorker);
    await setAgentPrefsMaxSteps(serviceWorker, 7);
    const before = await readSettings(serviceWorker);
    expect(before.targetLanguage).toBe('en');

    // ---------- 关闭浏览器 ----------
    await context.close();

    // ---------- 用同一 profile 重开 ----------
    const ctx2 = await launchExtensionContext(USER_DATA_DIR);
    try {
      const worker2 =
        ctx2.serviceWorkers()[0] ?? (await ctx2.waitForEvent('serviceworker'));

      // ① 设置保留（存储按扩展 ID 归档，故重开后必须仍能读到同一份）
      const after = await readSettings(worker2);
      expect(after.targetLanguage).toBe('en');
      expect(after.providerType).toBe(before.providerType);
      expect(
        (after.openai as Record<string, unknown> | undefined)?.baseUrl,
      ).toBe((before.openai as Record<string, unknown> | undefined)?.baseUrl);

      // ② Chat 历史保留
      const sessions = (await dumpStorage(worker2)).chatSessions as
        | unknown[]
        | undefined;
      expect(sessions).toHaveLength(1);

      // ③ Agent 偏好保留（启用开关与最大步数是持久化的）
      expect((await readAgentPrefs(worker2)).maxSteps).toBe(7);

      // ④ Agent **运行态**不持久化：storage 里根本没有这类键
      const keys = Object.keys(await dumpStorage(worker2));
      expect(keys.filter((k) => /plan|timeline|task/i.test(k))).toEqual([]);

      // ⑤ UI 不显示虚假在途任务：面板为空闲态
      const extId2 = new URL(worker2.url()).host;
      const panel2 = await openAgentSurface(ctx2, extId2, 'workspace');
      const ui2 = agentUi(panel2);
      await expect(panel2.getByText('请确认执行计划')).toHaveCount(0);
      await expect(panel2.getByText('状态：awaiting_plan')).toHaveCount(0);
      await expect(ui2.approve).toHaveCount(0);
      // 「开始」存在但**因空目标而禁用**（AG-16 语义）；且没有「停止」
      // ⇒ 重启后是干净的空闲态，没有把旧任务当作在途任务恢复出来。
      await expect(ui2.start).toBeVisible();
      await expect(ui2.start).toBeDisabled();
      await expect(ui2.stop).toHaveCount(0);
      await expect(ui2.goal).toBeEnabled();

      // ⑥ 不重放页面操作：新开的内容页零写入
      const page2 = await openContentPage(ctx2, '/t1-static-form');
      await expect
        .poll(async () => (await readCounters(page2)).actions.length)
        .toBe(0);

      // ⑦ 关掉重开的浏览器（见 finally），不留后台进程
    } finally {
      await ctx2.close();
    }
  });
});
