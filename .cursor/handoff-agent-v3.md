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
- B2 剩余待补：AG-05（P0，需留证复跑）、AG-09（T7 受控 textarea / contenteditable）、AG-12（待 DM-V3-002 修复）、AG-04、AG-13、AG-19；以及 Provider A（Ollama）主路径

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
| A 功能补口单测（service tool-calling 判定） | ✅ 2026-10-08：`features/agent` 7 文件 / 53 用例通过（较此前 51 增 2：拆分轮数上限用例 + 新增零 tool_calls 判定用例），用本地 `node node_modules/vitest/vitest.mjs run features/agent`。Options 为 UI 改动，未跑命令，待人工验 |
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
