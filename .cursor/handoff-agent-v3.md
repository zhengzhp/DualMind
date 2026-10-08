# 交接：V3 本页浏览器 Agent（立项）

> 生成于 2026-10-07，续作更新于 2026-10-08。开新会话只带本文件即可续作。
> **权威**以 `docs/decisions.md` / `docs/features.md` / `docs/architecture-v3.md` 为准。
> 执行证据在流水：[v3-release-test-plan-log.md](../docs/v3-release-test-plan-log.md)、[v3-acceptance-runbook-log.md](../docs/v3-acceptance-runbook-log.md)。
> **过期条件**：V3.0 实机验收 + 发布闸门完成；决策文档与本文矛盾；距生成日超过 14 天且无人续作。

## 目标

- 按已立项的 V3.0 实现本页 Agent（零新增权限 + 计划批准 + 危险动作再确认）。
- 不扩到 V3.1（debugger / 多 Tab）除非再 `/plan-feature`。

## 当前状态

- 代码 / 文档已落地：`features/agent/`（tools / danger / executor / mount）、Background 环 + Port `dualmind-agent`、`AgentPanel` 替换占位、Options Agent 设置区、可选 page-fab 入口。
- A 功能补口 ✓；`TOOLS_UNSUPPORTED` 探测 ✓；运行态仅内存、不持久化已收口。
- 封板测试页 T1–T7（+ `t8-injection`）已建并冒烟，映射见 `e2e/pages/README.md`。
- 模型前提：`qwen3:4b`（Ollama）支持 tools 已通过；旧 `qwen-coder-8k` / `qwen2.5-coder:7b` 留作负面样本。
- **B1 / B2 批次已收口**（AG-04 主路径、AG-05 P0、AG-07/08/09/11/12/13(限)/14/15/17/19、ENV-06 等）；残留判据见流水。
- **B3 安全红线 20/20 全部记账**（13 单测 + 5 人工 + SEC-18 静态 + SEC-20 静态/网络面板）。
- 缺陷：DM-V3-001 已撤回（误报）；DM-V3-002 / 003 / 004 / 005 已修复（DM-V3-002 默认路径复跑经决策跳过）。
- **发布前真机项 T09 / T28 / T30 / T10(P0) / T17(NET-01 双侧 finish) 已 PASS**；store-listing 已按 V3 口径修订。
- ⚠️ 状态一律以两个 `*-log.md` 中的执行记录为准，本文不重抄。

## 下一步及阻塞项

1. **T32（REL-11 提交当日核验）** —— 唯一剩余发布前待办；需真实提交日期与商店后台，Agent 不能代跑（步骤见 runbook B11-3）。
2. 完成 `docs/v3-release-test-plan.md` §16 签收（A 封板 / Chrome 发布 / Edge 延后），签收后再更新架构里程碑与发布状态。
3. 可选补测：AG-04 负路径（无内容页报错）、AG-13「旧 index 复用被拒」人工触发、SEC-20 网络面板补捞；`content.css` 缺失（低危）另评估。
4. 发布闸门 compile / 全量 test / build / e2e / 提审逐项登记证据。

## 勿动清单

- 勿改 V1 / V1.5 / V2 已封板行为（仅 bugfix）
- 勿把 Agent 逻辑塞进 `TranslateService` / `features/chat/`
- 勿在 V3.0 引入 `debugger` / `scripting` / 跨 Tab
- 勿扩大 `host_permissions`

## 验证入口与坑位

- 入口：判据见 `docs/v3-release-test-plan.md` §6–§14；批次步骤与路由见 `docs/v3-acceptance-runbook.md`；证据见两个 `*-log.md`；缺陷模板见测试清单 §15。
- 坑位（模型 / 环境）：
  - 模型必须支持 tools；否则计划或 tool 环失败并提示。
  - 改 Content Script 后必须 Reload 扩展 + 刷新内容页。
  - 受控组件真伪只能由真实扩展判定 —— `snapshot` 读 DOM value，不可用于判定受控写入。
- 坑位（操作 / 复测）：
  - 目标输入框只写「要达成什么」，勿粘操作步骤。
  - **DM-V3-002 复测前必须先 `pnpm build`**，否则测到旧产物。
  - 发布闸门后置到 V3 验收完成；测试 / build / e2e 均须先征得同意。
