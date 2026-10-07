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
- 封板期缺陷候选 DM-V3-001（2026-10-08）：受控表单上 `executor` 的 `fill`/`type` 静默失败（写 `el.value` 不触发框架 onChange）；已登记在 `docs/v3-release-test-plan.md` 第 15 节，待决定是否修
- 人工验收 runbook（2026-10-08）：`docs/v3-acceptance-runbook.md`（8 个批次 + 页面路由 + 记录表）
- 模型前提已解决（2026-10-08）：原两模型不支持 tool calling，已拉取 `qwen3:4b` 并复测通过（结构化 `tool_calls`）；工具段用例（B2/B3/B4/B5/B7）现已可执行
- B1 计划闸门人工验收（2026-10-08）：Chrome + Side Panel，AG-01/02/03/06 PASS、AG-17/NET-05（qwen-coder-8k 负面样本）PASS，计划闸门另在 BYOK 与 qwen3:4b 下重跑通过；**全部无留存证据**，AG-05（P0）保留未勾选待留证复跑。已登记 DM-V3-ENV-05；结论见 `docs/v3-acceptance-runbook.md` 第 3 节
- B2a 执行主路径人工验收（2026-10-08）：Chrome + Side Panel + qwen3:4b，页面 `/t1-static-form`。AG-07 / AG-08 / AG-11 PASS（有计数器 JSON）；AG-10 部分 PASS（「未知选项」分支未测）；AG-15 BLOCKED（该次规划阶段 `EMPTY_RESPONSE`）。**首次证明 Agent 主链路走通**：计划 → 批准 → runChatWithTools → 真实 DOM 写入，工具行为与页面事实一致。观察：qwen3:4b 规划偶发失败，产品可读报错且零写入，但无自动重试
- 下一步：补测 AG-10「未知选项失败」、重跑 AG-15；然后 AG-09（T7，预期命中 DM-V3-001）、AG-12 / AG-13 / AG-14 / AG-19 / AG-04；再进 B3 安全红线

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
