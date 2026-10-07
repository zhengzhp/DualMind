# DualMind Feature 契约表 · 当前版本（V3 · 已立项）

> 生效版本：**V3（浏览器 Agent）已立项，实现中**。V2 及更早 Feature 冻结，仅修 bug。  
> V2 契约归档见 [features-v2.md](./features-v2.md)；V1 / V1.5 见 [features-v1.md](./features-v1.md)。  
> 代理入口见 [AGENTS.md](../AGENTS.md)。  
> 决策见 [decisions.md](./decisions.md)；架构见 [architecture-v3.md](./architecture-v3.md)。

## V3 会话边界（Agent）

- **agentPrefs**（`local:agentPrefs`）：启用开关、最大步数等；确认策略按决策固定为「计划批准 + 危险动作再确认」，Options 可只读说明
- **运行态**：单次任务的计划 / 步骤轨迹 / 中止标志以内存为主（是否落 storage 在实现时补决策）
- **禁止**复用 `translateSession` / `chat:*`：Agent 属独立 feature，见下表
- 操作目标页经 `resolveContentTab` 解析；`disabledHosts` 命中则不可用

## V3 Feature 一览

| Feature | 目录 | 入口消息 / Port | 写入 storage | UI 入口 | 状态 |
|---------|------|-----------------|--------------|---------|------|
| agent | `features/agent/` | `agent:prefs:*` / `agent:open-panel`；Port `dualmind-agent`（start / 计划批准 / 危险确认 / abort）；内容脚本 `content:agent-execute` | `local:agentPrefs`；`local:agentPending`（FAB 信箱）；任务轨迹内存 | Side Panel / 工作台 Agent Tab；`page-fab`「请 Agent 操作本页」 | V3.0 主链路已接（计划批准 + tool 环 + 危险确认） |

> 工具执行在内容脚本（DOM）；LLM tool-calling 只在 Background。Provider 永不碰 DOM。

## 既有 Feature（已封板，仅修 bug）

| Feature | 归档契约 | 状态 |
|---------|----------|------|
| chat / page-content / page-fab | [features-v2.md](./features-v2.md) | V2 已封板 |
| translate / selection-toolbar / immersive | [features-v1.md](./features-v1.md) | V1 / V1.5 已封板 |

全页工作台、ModelSelector、模型品牌图标等共享 UI 约定仍适用（见 [features-v2.md](./features-v2.md) 正文说明）；新增 Agent Tab 与之共用 ModelSelector。

## LLM 调用约定

- 仅 Background 调用 `shared/llm/run.ts`（`runChat` / `runChatStream`；Agent 用 `runChatWithTools` / `runChatStreamWithTools`，仍经同一层）
- Feature 不得直接 `createProviderFromSettings`（Background 的 listModels / test 除外）
- Provider 永不碰 DOM；错误经 `shared/errors` 统一码与文案
- Agent 所用模型须支持 tools；不支持时返回可读错误，禁止无工具硬跑

## 新增 Feature 检查清单

1. 是否落在 `features/<name>/`（prompts / service / types）
2. 是否新增独立消息前缀，而非塞进 `translate:*` / `chat:*`
3. 是否误把逻辑放进 `TranslateService`
4. 是否需要扩大 `host_permissions` 或自动化权限（需 Ask first；V3.0 红线见 [decisions.md](./decisions.md)）
5. 是否更新本表与 `docs/decisions.md`
