# 交接：V3 本页浏览器 Agent（立项）

> 生成于 2026-10-07。开新会话只带本文件即可续作，无需回读上一会话全文。  
> **权威以** `docs/decisions.md` / `docs/features.md` / `docs/architecture-v3.md` **为准**；本文件只做导航与坑位。  
> **过期条件**：V3.0 主链路合入并验收完毕；决策文档与本文矛盾；距生成日超过 14 天且无人续作。

## 目标

- 按已立项的 V3.0 实现本页 Agent（零新增权限 + 计划批准 + 危险动作再确认）
- 不扩大到 V3.1（debugger / 多 Tab）除非再 `/plan-feature`

## 已完成

- 用户拍板：**权限 1A**（仅 Content Script DOM）、**确认 2B**（计划批准 + 危险再确认）
- 文档切档：`decisions-v2` / `features-v2` 归档；活文档与 `architecture-v3.md` 重建；指针已同步

## 下一步

1. `shared/llm` 补 tool-calling（OpenAI Compatible + Ollama）
2. `features/agent/`：tools schema + content executor（snapshot/click/fill…）+ danger 分类单测
3. Background 环 + Side Panel `AgentPanel` 替换占位；再接可选 `page-fab`

## 勿动清单

- 勿改 V1/V1.5/V2 已封板行为（仅 bugfix）
- 勿把 Agent 逻辑塞进 `TranslateService` / `features/chat/`
- 勿在 V3.0 引入 `debugger` / `scripting` / 跨 Tab
- 勿扩大 `host_permissions`

## 验证状态

| 项目 | 结果 |
|------|------|
| 文档切档 / 链接 | ✅ 立项时完成；实现阶段再按改动跑最小单测 |
| 实机验收 | ⬜ 实现后见下方 |

## 请用户验证

- 立项阶段：核对 `docs/decisions.md`「V3 浏览器 Agent」决策表是否与拍板一致
- 实现后：Side Panel Agent 计划批准 → 本页填表（勿提交）→ 危险动作确认 → 停止

## 坑位与假设

- 模型必须支持 tools；否则只提示、不硬跑
- Shadow DOM / iframe / CSP 为已知限制，UI 须诚实说明
- 发布闸门（compile / 全量 e2e / 提审）仍后置到 V3 完成
