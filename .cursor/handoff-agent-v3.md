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
