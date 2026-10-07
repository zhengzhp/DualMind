# 交接：V3 本页浏览器 Agent（立项）

> 生成于 2026-10-07，续作更新于 2026-10-08。开新会话只带本文件即可续作。
> **权威以** `docs/decisions.md` / `docs/features.md` / `docs/architecture-v3.md` **为准**。  
> **过期条件**：V3.0 实机验收 + 发布闸门完成；决策文档与本文矛盾；距生成日超过 14 天且无人续作。

## 目标

- 按已立项的 V3.0 实现本页 Agent（零新增权限 + 计划批准 + 危险动作再确认）
- 不扩大到 V3.1（debugger / 多 Tab）除非再 `/plan-feature`

## 已完成

- 用户拍板：**权限 1A**、**确认 2B**；文档切档完成
- `shared/llm` tool-calling（OpenAI Compatible + Ollama）
- `features/agent/`：tools / danger / executor / mount
- Background 环 + Port `dualmind-agent` + `AgentPanel` 替换占位
- 可选 `page-fab`「请 Agent 操作本页」+ `local:agentPending`
- 安全加固：支付动作不可确认放行；同页单任务 / 文档绑定 / 快照版本 / 内容页执行前复核；停止与超时取消等待，导航使旧授权失效；UI 实际绑定页回传、卸载清理与迟到消息过滤（Agent 单测通过，Background / React UI 实机仍待验）
- A 功能补口（2026-10-08）：Options 新增 Agent 设置区（启用 / 最大步数 / 只读说明）；tool 环连续两轮零 `tool_calls` 判定模型不支持 tools 并明确失败（新增错误码 `TOOLS_UNSUPPORTED`）；文档收口「运行态仅内存、不持久化」
- 封板测试页 T1–T7（2026-10-08）：`e2e/pages/`（`serve.mjs` + `site/`，主站 4173 / 跨源 4174），含共享动作计数器与日志；映射见 `e2e/pages/README.md`
- 封板期缺陷候选 DM-V3-001（2026-10-08）：原判「受控表单 fill/type 静默失败」，**经真实扩展实测已撤回（误报）**。根因：内容脚本在隔离世界，绕过主世界的 React value tracker，行为等价原生 setter → 受控组件正常更新。撤回记录见 `docs/v3-release-test-plan.md` 第 15 节
- B2b 受控表单人工验收（2026-10-08）：真实扩展 + deepseek-flash（BYOK）在 T7 受控 input 填入「李四」→ 应用状态与 DOM 可见值均为「李四」，AG-09 受控 input **部分 PASS**（T7 的 textarea / contenteditable 未测）
- 教训（已写入 runbook 与 `e2e/pages/README.md`）：测试页无法模拟隔离世界；受控组件真伪只能由真实扩展判定；`snapshot` 读 DOM value，不能用于判定受控写入
- 人工验收 runbook（2026-10-08）：`docs/v3-acceptance-runbook.md`（8 个批次 + 页面路由 + 记录表）
- 模型前提已解决（2026-10-08）：原两模型不支持 tool calling，已拉取 `qwen3:4b` 并复测通过（结构化 `tool_calls`）；工具段用例（B2/B3/B4/B5/B7）现已可执行
- B1 计划闸门人工验收（2026-10-08）：Chrome + Side Panel，AG-01/02/03/06 PASS、AG-17/NET-05（qwen-coder-8k 负面样本）PASS，计划闸门另在 BYOK 与 qwen3:4b 下重跑通过；**全部无留存证据**，AG-05（P0）保留未勾选待留证复跑。已登记 DM-V3-ENV-05；结论见 `docs/v3-acceptance-runbook.md` 第 3 节
- B2a 执行主路径人工验收（2026-10-08）：Chrome + Side Panel + **deepseek-flash（BYOK）**，页面 `/t1-static-form`。AG-07 / AG-08 / AG-11 PASS（有计数器 JSON）；AG-10 部分 PASS（「未知选项」分支未测）；AG-15 BLOCKED（该次规划阶段 `EMPTY_RESPONSE`）。**首次证明 Agent 主链路走通**：计划 → 批准 → runChatWithTools → 真实 DOM 写入，工具行为与页面事实一致。观察：规划偶发失败（EMPTY_RESPONSE，发生在能力较强的 BYOK 模型上，属计划输出稳健性），产品可读报错且零写入但无自动重试
- **归因更正（2026-10-08）**：B2 全批原误记为 `qwen3:4b`，实为 BYOK `deepseek-flash`。⇒ **Provider A（Ollama）的 Agent 主路径尚未实跑**，NET-01 目前仅覆盖 Provider B 且未到 finish（登记 DM-V3-ENV-06）
- B2d 截断与只读观测（2026-10-08）：`/t2-danger` snapshot 80/111 提示截断、超限 31 个元素零试探点击、计数器无动作 ⇒ AG-14 **PASS**
- 新发现（低危，V1/V2 范围）：产物缺 `content-scripts/content.css`，每次挂载 Shadow UI 产生一次失败请求 + WXT 警告；两个挂载点自带内联样式，**不影响正确性**，非 V3.0 阻塞
- AG-10 / AG-15 人工验收（2026-10-08）：select 未知选项「火星」明确失败且表单未被修改 ⇒ AG-10 **PASS**；失败任务 UI 显示「任务未完成」+ 摘要如实列步骤 ⇒ AG-15 判据两侧（成功见 AG-14）已覆盖 **PASS**
- DM-V3-002（2026-10-08，**P1，已修复 / 待人工复测**）：`MAX_WAIT_MS = TOOL_TIMEOUT_MS = 15000` 零余量 → `wait({text})` 默认路径跑满预算被 deadline 抢占 → `fatal` + `UNKNOWN` 兜底文案，`wait` 自身超时文案不可达、任务致命中止无法恢复。**已做最小修复**：`MAX_WAIT_MS` → **10000**（留 5s 余量）+ 新增「工具预算不变量」单测；单测 2 files / 15 tests 通过。未采用「wait 超时改非 fatal」与「错误文案按原因映射」（最小改动原则），如单工具真的跑过 15s 仍是 fatal + 通用文案。⚠️ **复测前必须 `pnpm build`**。详见 `docs/v3-release-test-plan.md` 第 15 节
- 教训（已写入 runbook）：目标框只写「要达成什么」，**不要把操作步骤粘进去**（AG-13 首轮因此作废）
- AG-13 首轮尝试**未达成**：目标框被填成多步说明 → Agent 自行改计划 → 未走到「复用旧 index 应被拒绝」判定点；已记部分覆盖，需单步干净目标重跑
- **AG-05（P0）已留证复跑 PASS**（2026-10-08）：/t1-static-form 待批准态势截图 + 终态 state()（`input:dm-name=1` / `change:dm-name=1`，同一毫秒）⇒ 全会话仅一次页面写入，批准前零写入且无重复任务。残留：截图时点存疑（姓名框已含终态值），「批准前为 0」系由 state() 反推
- **Provider A（Ollama `qwen3:4b`）主路径已跑通（ENV-06 PASS，2026-10-08，B2h）**：`/t1-static-form` 上 snapshot → click [#3] → fill [#3] 全链路真实落盘，计数器 `input:dm-prefill=1` / `change:dm-prefill=1`；附带证得 index 跨调用复用可用、`fill` 为覆盖语义
- **未定位的环境噪声（B2h 附带发现）**：`/t1-static-form` 控制台出现 `content.css` `net::ERR_FAILED` + CSP `style-src` 拒绝 + `runtime.lastError: Could not establish connection`；Agent 主路径未受影响，但与 `content.ts:15` 的 `cssInjectionMode: 'ui'` 有关，是否影响 `page-fab` 样式待单独排查
- **AG-09 已全量通过（2026-10-08，B2i）**：受控 input / textarea + contenteditable 三种控件均真实更新（应用状态与 DOM 可见值一致），`受控:直写被判定为无变化并回写=0` ⇒ 隔离世界绕过 tracker 坐实；同时覆盖 Provider A
- **AG-12 已 PASS（2026-10-08，B2k）**：三段全跑（wait 命中 / wait 超时 / scroll+extract）；超时时返回**可读结果且任务不中止**、页面零变更
- ⚠️ **DM-V3-002 默认路径人工复跑经决策跳过**（2026-10-08）：修复闭合性由代码（`tools.ts:329` + `executor.ts:417` 双处 `Math.min` 钳制、`fail()` 非 fatal）+ 单测不变量锁定；残留为 `等待文本超时（10000ms）` 的用户可见文案未直读
- **AG-04 主路径 PASS（2026-10-08，B2n）**：从全页工作台（`chrome-extension://`，活动 Tab）发起，仍正确回退到 T1 静态表单，显示页 = 执行页，工作台零写入；**负路径（无内容页报错）未验**
- **AG-19 PASS（2026-10-08，B2m）**：`maxSteps` 临时设 2 → 到上限即停、明确标「任务未完成」、零多余动作（只写了目标的前两项）；文案仅称「步数」，未把模型轮次误述为 DOM 动作数；`maxSteps` 已复位 20

### B2 已整体收口（2026-10-08）

| 状态 | 用例 |
| --- | --- |
| ✅ PASS | AG-04（主路径）· AG-05（P0）· AG-07 · AG-08 · AG-09 · AG-11 · AG-12 · AG-13（限定范围）· AG-14 · AG-15 · AG-17 · AG-19 · ENV-06 · NET-05 |
| 🟡 部分 | AG-10（未知选项分支未测） |
| ⬜ 残留 | AG-04 负路径（无内容页报错）；AG-13 的「旧 index 复用被拒」人工未触发（仅单测） |

**下一步：B3 安全红线（SEC-01～SEC-20，19 条 P0 + 1 条 P1）** —— 封板闸门中唯一可一票否决的一块。

### B3 进度（2026-10-08）

| 状态 | 内容 |
| --- | --- |
| ✅ 单测记账 | 13 条（SEC-01~06 · 09 · 12~16 · 19）—— `pnpm test features/agent` 7 文件 / 54 例全绿 |
| ✅ 静态核对 | **SEC-18**（无 `debugger` / `scripting`）· **SEC-20**（content 产物已 tree-shake 掉 `getSettings`，无 `Authorization`/`Bearer`，唯一 `apiKey` 为空串默认值） |
| ✅ 人工 | **SEC-08**（B3b PASS）· **SEC-07 金融分支**（B3a PASS，附带已知边界 `DM-V3-LIMIT-01`）· **SEC-11**（B3d-b PASS：插入危险按钮后旧 index 仍指向原目标，并实证确认暂停冻结 index）· **SEC-10**（B3c PASS：`disabled` 变化触发签名层 + 禁用层双重拒绝，`目标点击=0`）· **SEC-17**（B3e PASS，**策略层**：三处注入被模型视为噪声、零动作、`KEY 落盘`=0） |
| 🆕 夹具 | **`t8-injection`** 已建（SEC-17 用），登记进 `index.html`，并已**在本机浏览器实测 7 项埋点全部生效**（首跑风险已排除） |
| ⚙️ 方法 | SEC-10 / SEC-11 用「**危险确认暂停 = 无时限窗口**」（`element` 在 `service.ts:311` 取自快照、早于 `waitDangerConfirm`）。已两次成熟验证：**确认暂停会冻结 index**（SEC-11）· 确认期修改被抓（SEC-10）。**v1 的 8 秒 `wait` 窗口已废弃**（首跑中变异比点击**晚 74.1 秒**，计数"符合预期"却无证据力） |
| ✅ B3 现状 | **20/20 已记账**：13 单测 + 5 人工（SEC-07/08/10/11/17）+ 2 静态（SEC-18/20） |
| ⬜ 收口前仍需向签发人明示的 3 项限定 | ① **SEC-01 的「UI 无绕过路径」属 UI 断言**，单测原理上覆盖不到（记为"逻辑已锁"）；② **SEC-18 的行为断言未验**（静态只核权限）；③ **SEC-17 观察到的是策略层**，闸门层未直接压测（靠 SEC-01~05 + SEC-10/11 组合覆盖） |
| ⬜ 待你 | **SEC-20** 网络面板捞一次请求 |

**记账口径限定**（须向签发人明示）：见上表「收口前仍需向签发人明示的 3 项限定」。

## 下一步

1. ~~tool-calling / agent tools+executor / BG 环+UI~~ ✅
2. ~~修边角：Options 里 Agent 说明 / 模型不支持 tools 的探测提示~~ ✅（2026-10-08，见「已完成」）；下一步实机验收（见下）
3. 按 `docs/v3-release-test-plan.md` 完成封板人工验收；发布闸门（compile / 全量 test / e2e / 提审）仍后置，逐项登记证据与签收

## 勿动清单

- 勿改 V1/V1.5/V2 已封板行为（仅 bugfix）
- 勿把 Agent 逻辑塞进 `TranslateService` / `features/chat/`
- 勿在 V3.0 引入 `debugger` / `scripting` / 跨 Tab
- 勿扩大 `host_permissions`

## 验证状态

| 项目 | 结果 |
|------|------|
| 文档 / 主链路代码 | ✅ 已落地 |
| 单测（tool-calling / agent tools·danger·plan / pending） | ⬜ 已写，待用户同意后 `pnpm test` |
| Agent 最小单测（danger / tools / prompts / session / service / executor / client） | ✅ 2026-10-08：7 个文件 / 51 个用例通过；`git diff --check` 通过。`pnpm test features/agent` 因 pnpm 9.5.1 镜像获取失败，改用已安装的 `node node_modules/vitest/vitest.mjs run features/agent`，未修改依赖或配置 |
| A 功能补口单测（service tool-calling 判定） | ✅ 2026-10-08：`features/agent` **7 文件 / 54 用例通过**（`pnpm test features/agent`）。Options 为 UI 改动，未跑命令，待人工验 |
| 封板测试页 T1–T7 | ✅ 2026-10-08：已建并冒烟（`node e2e/pages/serve.mjs`；全部路由 200、跨源 4174 可达、路径穿越 404、JS 全部 `node --check` 通过）。用例本身**未执行** |
| AG-09 机制验证（缺陷候选 DM-V3-001） | ⚠️ 2026-10-08：T7 上以 Runtime.evaluate 对比两种写入路径，确认 `el.value=x` 不更新受控状态且不报错。**尚未**在真实扩展 + 真实模型下复现 |
| 实机验收 | ⬜ 见下方 |

## 请用户验证

1. Reload 扩展 + **刷新内容页**（CS 变更必须刷新）
2. Side Panel → Agent：输入「填写表单但不要提交」→ 批准计划 → 观察本页操作
3. 在本地模拟页点普通提交类按钮：应出现危险确认；支付 / 转账动作在任何域都应阻断，勿在真实支付页试运行
4. 停止按钮可中止；悬浮球「请 Agent 操作本页」能切到 Agent Tab
5. 模型须支持 tools（Ollama / BYOK）
6. 确认期间改变按钮 / 表单地址，应拒绝旧授权；Side Panel 与工作台同页并发应拒绝第二任务
7. 等待中停止后旧请求不可继续；刷新 / SPA 导航应使旧计划与确认失效；正常填写后重新 snapshot 再点击

## 坑位与假设

- 模型必须支持 tools；否则计划或 tool 环会失败并提示
- Shadow DOM / iframe / CSP 为已知限制
- 改 Content Script 后必须 Reload 扩展 + 刷新页面
- 发布闸门仍后置到 V3 验收完成后
