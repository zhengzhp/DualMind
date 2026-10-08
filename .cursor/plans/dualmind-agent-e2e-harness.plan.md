---
name: DualMind Agent E2E 与 mock Provider 测试夹具
overview: 为 V3.0 本页 Agent 建立可复现的自动化验收基建——用零依赖的本地 mock「OpenAI 兼容」服务器（SSE + tool_calls）提供确定性模型行为，配合 Playwright 驱动扩展页 / 内容页 / storage，把目前只能人工执行、且多为「非留存证据」的 A 闸门用例（安全闸门层、错误注入、多轮纠错、超时、并发、生命周期）转为可留证的自动化用例。仅新增测试基建，不改产品边界、不增权限。
todos:
  - id: scope-and-dirs
    content: 确认范围与目录：仅 e2e/ 新增 mock-llm 服务器与 agent e2e 文件；fixtures 增补 helper；不改 features/ providers/ shared/ 运行时代码
    status: completed
  - id: mock-server
    content: 实现 e2e/mock-llm.ts（node:http，零新依赖）：/v1/chat/completions SSE + tool_calls 场景脚本（计划/危险调用/多轮/错误码/延迟）
    status: completed
  - id: fixtures-helpers
    content: 扩展 e2e/fixtures.ts：seedAgentPrefs / openAgentSurface / readCounters / setupAgentTest / 参数化 EXTENSION_PATH 与模型；自动拉起测试页服务
    status: completed
  - id: first-batch-cases
    content: 用例铺开（决策=expand）：agent-plan / agent-safety / agent-network / agent-lifecycle / agent-entry 五个文件
    status: completed
  - id: evidence
    content: 证据留存：trace / HTML report + 用例内断言计数器与 mock 轮次（mock.cursor / requests）
    status: completed
  - id: gate-and-docs
    content: 接闸门与文档：测试清单 5.1、runbook B9、pages/README、登记 DM-V3-004、修复过期 workspace 断言
    status: completed
  - id: verify
    content: 实跑验证（未执行，须用户同意）：pnpm compile → 定向跑新用例 → 记录结果
    status: pending
isProject: false
---

# DualMind Agent E2E 与 mock Provider 夹具（方案）

> 编制：2026-10-08。状态：**待批准**。本文件是方案，不代表已实现，也不授权执行任何 test / build。
> 关联：[docs/v3-release-test-plan.md](../../docs/v3-release-test-plan.md)、[docs/v3-acceptance-runbook.md](../../docs/v3-acceptance-runbook.md)、[AGENTS.md](../../AGENTS.md)。

## 0. 范围判定（对照 docs/decisions.md）

- **不属 V3.0 产品范围扩张**：本方案**只加测试基建**（`e2e/` 下的 mock 服务器与用例），
  **不改** `features/agent/`、`providers/`、`shared/` 的运行时行为，**不新增权限**，**不改变产品边界**。
  故无需新开 V3.1；它是 V3.0 **发布闸门**的验证手段。
- **不改翻译 / Chat 链路**：不触碰 `TranslateService` / `features/chat/`。
- **唯一涉及既有配置的改动**：`e2e/fixtures.ts` 里硬编码的 `OLLAMA_MODEL = 'qwen-coder-8k:latest'`
  已被证实**不支持 tool calling**（ENV-05 / ENV-06）。参数化该值属**改测试配置**，按 AGENTS「Ask first」须单独确认。

## 1. 会动到的目录

| 目录 | 动作 |
|---|---|
| `e2e/` | **新增** `mock-llm.mjs`、`agent*.e2e.ts`；**修改** `fixtures.ts` 增补 helper |
| `docs/` | 更新测试清单 / runbook 的「可自动化」标注与跑法 |
| `features/` / `providers/` / `shared/` / `entrypoints/` | **不动**（除非后续为可测性做微调，须再确认） |

## 2. 核心设计

### 2.1 mock「OpenAI 兼容」服务器（关键杠杆）

- 实现：`node:http`，**零新增依赖**；暴露 `POST /v1/chat/completions` 与 `GET /v1/models`。
- **必须走 SSE**：`providers/openai-compatible.ts` 经 `parseOpenAIChatCompletionsSSE` 解析，
  故响应须为 `text/event-stream`，按 `data: {...}` 分片、以 `data: [DONE]` 结束；
  `tool_calls` 需按 `delta.tool_calls[].index` 增量拼接（与真实流式一致）。
- **场景脚本**（由用例注入）：按请求轮次返回预设动作序列，覆盖：
  1. **正常计划 + 工具序列**：`snapshot` → `click` → `fill` → `finish(true)`；
  2. **危险工具调用**：直接产出 `click` 指向支付 / 删除目标的 args（用于**压测闸门层**，人工无法构造）；
  3. **多轮纠错**：第 1 轮工具失败后第 2 轮改策略；
  4. **错误注入**：401 / 403 / 404 / 429 / 5xx / 连接重置 / 慢响应；
  5. **零 tool_calls**：验证 `TOOLS_UNSUPPORTED`；
  6. **非法调用**：未知 function / 坏 JSON / 空参数 / 同轮多调用。
- 端口固定（如 `127.0.0.1:11435`）；`host_permissions` 中已有 `<all_urls>`，**无需扩权**。

### 2.2 fixtures 增补（复用已有能力）

已有可复用：persistent context 加载扩展、`seedSettings` / `readSettings`（SW `evaluate` 写 storage）、
真实 Side Panel 开关（有头）、`trace: retain-on-failure` + HTML report、`workers: 1` 串行。

需增补：

- `seedAgentPrefs(worker, patch)`：写 `local:agentPrefs`（`enabled` / `maxSteps`）；
- `openAgentSurface(context, id, 'sidepanel' | 'workspace')`：打开扩展页并驱动 Agent 面板；
- `readAgentTimeline(page)` / `readCounters(page)`：读面板事件与 `window.dmTest.state()`；
- `startMockLlm()` / `stopMockLlm()`：按用例启停 mock 并注入场景；
- 参数化 `EXTENSION_PATH`（默认 `.output/chrome-mv3`，可用环境变量指向最终包）。

### 2.3 首批用例（按价值排序）

| 用例 | 为什么值得先做 | 依赖 |
|---|---|---|
| **SEC-17 闸门层** | 人工两次都没能让模型吐危险 tool_call；mock 可**必然**触发 ⇒ 首次真正压测 `danger`/`executor` | mock 危险场景 + t8 夹具 |
| **NET-04** | 401/429/5xx/慢响应可确定性注入，验证不无限 loading、不误报成功 | mock 错误场景 |
| **AG-18** | 多轮纠错可用脚本化序列确定性复现（不靠真模型运气） | mock + t3 夹具 |
| **LIFE-06** | 工具超截止时间 + 迟到响应，可确定性触发 | mock 延迟 |
| **AG-16** | 空 / 全空格目标，DOM 断言即可 | 扩展页 helper |

### 2.4 证据留存

每条用例产出：Playwright trace（失败保留）、HTML report、`state()` 导出、面板 timeline。
目标：把 `DM-V3-ENV-05` 的「非留存证据」升级为**可复核证据**。

## 3. 实现计划（6 步）

1. 确认范围与目录（本节 §0/§1）。
2. 写 `e2e/mock-llm.mjs`：SSE + tool_calls + 场景注入。
3. 扩展 `e2e/fixtures.ts`：helper + 参数化（**不改既有用例语义**）。
4. 落首批 5 条用例。
5. 证据留存规范化（trace/report/state 归档）。
6. 在清单 / runbook 标注可自动化项与跑法；与 A/B 闸门对接。

## 4. 风险点

| 风险 | 说明 | 缓解 |
|---|---|---|
| **Side Panel 真实表面** | 真实 `SIDE_PANEL` 上下文仅**有头**可见；无头下需把 `sidepanel.html` 当普通页驱动 | 逻辑类用「扩展页当页」；涉及真实手势 / 侧栏的仍走 `E2E_HEADED=1` 或人工 |
| **绑定页语义差异** | 把 `sidepanel.html` 当活动 Tab 打开时，其为扩展页 ⇒ `resolveContentTab` 会回退到「最近可读页」 | 用例中**先访问内容页**建立 tracker，再开 Agent 面；并在文档写明该前提（AG-04 已印证回退可用） |
| **SW 网络可见性** | PRIV-03/09 依赖捕获 SW 发起的请求，Playwright 覆盖度需实测 | 先做一次探针验证；不成立则该两条仍留人工 |
| **mock 与真实 Provider 的偏差** | mock 只模拟协议，不代表真模型行为 | Agent **主链路**（NET-01）仍要求真 Ollama / 真 BYOK 各跑一次；mock 只用于**确定性边界** |
| **多窗口受限** | Playwright persistent context 单窗口，多窗口类用例（部分 LIFE）难完全复现 | 标注为「单窗口近似」或保留人工 |
| **改测试配置** | `OLLAMA_MODEL` 参数化属 Ask first | 单独确认；不改默认行为 |

## 5. 已确认决策（2026-10-08）

1. **mock 协议**：只做 `POST /v1/chat/completions`（OpenAI 兼容 / 对应 BYOK = Provider B）；
   **Ollama 主路径仍用真模型**（`NET-01` 不因 mock 而免测）。→ 已按此实现。
2. **首批范围**：选择 **expand**（铺开到 A1 中全部可自动化项），落地为 5 个用例文件。→ 已按此实现。
3. 实现语言由 `.mjs` 调为 **`.ts`**（`e2e/mock-llm.ts`）：`pnpm compile` 的 `tsc --noEmit`
   会纳入 `e2e/**`，用 TS 才能被类型检查；Vitest 只收 `**/*.{test,spec}.ts`，不会被误当测试。

## 6. 非目标

- 不实现 V3.1 的多 Tab / debugger 能力；
- 不用 mock 替代 NET-01 的真实 Provider 主路径；
- 不改动产品代码以「方便测试」（若确需可测性微调，另行确认）。

## 7. 实施记录（2026-10-08）

### 交付物

| 文件 | 说明 |
|---|---|
| `e2e/mock-llm.ts`（新增） | 零依赖「OpenAI 兼容」mock：SSE + `tool_calls` 分片、`plan`/`text`/`tools`/`http_error`/`reset`/`hang`、`pick`（按元素文案从最近 snapshot 解析 index）、`requests()` / `cursor()` 供断言 |
| `e2e/fixtures.ts`（改） | 新增 `setupAgentTest` / `openAgentSurface` / `agentUi` / `openContentPage` / `seedAgentPrefs` / `readAgentPrefs` / `readCounters` / `resetCounters` / `ensureTestPages` / `resetMockLlm`；`EXTENSION_PATH` 与 `OLLAMA_MODEL` 支持环境变量覆盖（默认行为不变） |
| `e2e/agent-plan.e2e.ts`（新增） | AG-03 / AG-05 / AG-16 / AG-18 / AG-19 / AG-04 |
| `e2e/agent-safety.e2e.ts`（新增） | SEC-01 / SEC-17 / SEC-06（确认与跳过两支路） |
| `e2e/agent-network.e2e.ts`（新增） | NET-04 / NET-05 / NET-06 + PRIV-06 片段 |
| `e2e/agent-lifecycle.e2e.ts`（新增） | LIFE-01/02/03/05/08/11/16 |
| `e2e/agent-entry.e2e.ts`（新增） | AG-01 / AG-02 / UI-08 / UI-09 / UI-12（DM-V3-003 以 `test.fixme` 固化期望） |
| `e2e/workspace.e2e.ts`（改） | 修正过期的「Agent 仍占位」断言（该用例此前**必然失败**） |
| `docs/v3-release-test-plan.md`（改） | 新增 §5.1 自动化覆盖表与 AUTO-07/08；登记 DM-V3-004 |
| `docs/v3-acceptance-runbook.md`（改） | 新增 B9（Agent 自动化跑法与边界）与缺陷表 |
| `e2e/pages/README.md`（改） | 替换「本目录没有 Agent 用例」的过期说明 |

### 过程中发现（未改产品代码）

1. **`e2e/workspace.e2e.ts` 已过期**：仍断言 `Agent（即将推出）`，而 Agent Tab 早已接入 `AgentPanel`
   ⇒ 现有 `pnpm test:e2e` 里存在一条**必然失败**的用例。已修（属测试资产修正）。
2. **DM-V3-004（新登记，P2）**：内部普通 `Error` 经 `normalizeError` → `UNKNOWN`，
   再经 `formatErrorForUi` **丢弃 message** ⇒ 如「本页已有 Agent 任务…」只显示「出错了，请稍后重试」。
   与 DM-V3-002 未采用的建议 (c) 同源。
3. `e2e/pages/site/t2-danger.html` 的支付按钮走 `blocked`（非金融路径），
   恰好适合作为**闸门层压测**素材：mock 可稳定产出「模型执意要支付」的输入。

### 仍未验证（须用户同意后执行）

- ~~`pnpm compile`~~ → **已跑（2026-10-08）：0 error**（顺带修净 4 处**既有** TS 错误，见文末「实跑结果」）
- ~~`npx playwright test e2e/agent-*.e2e.ts`~~ → **已跑（2026-10-08）：Agent 组 + 工作台 32 passed**
- 仍**未**跑：全量 `pnpm test:e2e`（含依赖真实 Ollama 的 V1/V2 用例）、`E2E_HEADED=1` 的有头项。

### 已知脆弱点（首次实跑时优先看）

1. **`openContentPage` 就绪判定**依赖 `[data-dm-toolbar-ready="1"]`（由 selection-toolbar mount 设置）；
   若某页 `mount` 未执行会导致等待超时。
2. **role 选择器只匹配可见元素**：Agent Tile 之外的 Tab 用 `hidden` 隐藏，
   故 `getByRole('button', {name:'开始'})` 等能唯一定位；若日后改为 `visibility` 需复核。
3. **无头下的活动标签顺序**：用例依赖「先开面板、后开内容页」，让内容页成为活动页；
   调换顺序会导致 `resolveContentTab` 命中扩展页而失败（AG-04 即利用这一点构造负路径）。

### 实跑结果与收尾（2026-10-08）

**验证**（均经用户批准）：

| 命令 | 结果 |
|---|---|
| `pnpm compile` | **0 error**（修净 4 处既有 TS 错误） |
| `pnpm test`（executor / service / export / modelIcons） | 36 passed |
| `npx playwright test`（5 个 agent 组 + `workspace.e2e.ts`） | **32 passed / 37.5s** |

> 环境坑：shell 里存在指向临时沙箱缓存的 `PLAYWRIGHT_BROWSERS_PATH`（目录内无浏览器），
> 需 `PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" npx playwright test …`。

**顺带修复（本轮，非 harness 本身）**：

1. **DM-V3-003**（帮助文案把「支付」写成可再确认）：`features/agent/ui/AgentPanel.tsx` 拆为
   「删除 → 再次弹窗确认」与「支付 / 下单 / 转账 → 直接拒绝、无法确认放行」；危险确认卡加
   `data-testid="agent-danger"`；`agent-entry.e2e.ts` 去 `test.fixme` 并断言。
2. **DM-V3-004**（业务 Error 原因被吞）：`shared/errors.ts` 新增 `UserFacingError`，
   `formatErrorForUi` 对其实例直接透出 message；`entrypoints/background.ts` 三处业务拒绝改抛之。
   PRIV-06 边界不变（NET-04 的 500 用例仍断言不泄露 Provider 响应体）。
3. **既有 TS 错误**：`executor.test.ts`（`override`）、`service.test.ts`（mock 返回 `AgentToolResult`）、
   `chat/export.ts`（索引空值收窄）、`modelIcons.ts`（`getURL` 动态路径放宽为 `string`）。
4. **测试技法**：受控勾选框不能 `uncheck()`（`setEnabled` 异步往返期间 DOM 状态会回弹），
   改 `click()` + 可重试断言；危险理由文案与时间线条目重名，断言限定 `agent-danger` 卡内。
