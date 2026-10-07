# 交接：V3 本页浏览器 Agent（立项）

> 生成于 2026-10-07，续作更新同日。开新会话只带本文件即可续作。  
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

## 下一步

1. ~~tool-calling / agent tools+executor / BG 环+UI~~ ✅
2. 实机验收（见下）后按需修边角：Options 里 Agent 说明、空态文案、模型不支持 tools 的探测提示
3. 发布闸门（compile / 全量 test / e2e / 提审）仍后置

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
| 实机验收 | ⬜ 见下方 |

## 请用户验证

1. Reload 扩展 + **刷新内容页**（CS 变更必须刷新）
2. Side Panel → Agent：输入「填写表单但不要提交」→ 批准计划 → 观察本页操作
3. 故意点到提交类按钮：应出现危险确认；金融域应阻断
4. 停止按钮可中止；悬浮球「请 Agent 操作本页」能切到 Agent Tab
5. 模型须支持 tools（Ollama / BYOK）

## 坑位与假设

- 模型必须支持 tools；否则计划或 tool 环会失败并提示
- Shadow DOM / iframe / CSP 为已知限制
- 改 Content Script 后必须 Reload 扩展 + 刷新页面
- 发布闸门仍后置到 V3 验收完成后
