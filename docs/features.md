# DualMind Feature 契约表 · 当前版本（V2）

> 生效版本：**V2（摘要 / 聊天，进行中）**。  
> V1 / V1.5 契约（已封板）见 [features-v1.md](./features-v1.md)。  
> 代理入口见 [AGENTS.md](../AGENTS.md)。

## V2 会话边界（摘要 / 聊天）

- **chatSessions**（`local:chatSessions`）：**全局**会话列表，每条含 `pageUrl` / `pageTitle` / `messages` / `updatedAt` / 可选 `allowCrossPage`（用户已确认本会话继续用当前页，不再做来源一致性检查）；上限 **50 会话 / 每会话 200 条**，超限淘汰最旧
- **chatPrefs**（`local:chatPrefs`）：上下文范围（选区 / 当前页正文）等偏好
- 页面正文**不写 storage**：仅随已发送消息保存上下文片段 / 引用
- **禁止**复用 `translateSession` / `translate:*`：聊天属独立 feature，见下表

## V2 Feature 一览

| Feature | 目录 | 入口消息 / Port | 写入 storage | UI 入口 | 状态 |
|---------|------|-----------------|--------------|---------|------|
| chat | `features/chat/` | `chat:*`：`chat:prefs:get/save`、`chat:sessions:list/get/upsert/delete/clear`、`chat:context`（BG 转发内容脚本提取正文 / 选区）、`chat:page-info`（BG 取活动页地址 / 标题，用于会话来源一致性确认）；Port `dualmind-chat`（`start` / `abort`，流式） | `local:chatSessions`（全局会话，上限 50 会话 / 200 条，超限淘汰最旧）、`local:chatPrefs`（`contextScope` / `maxContextChars`）、`local:chatPending`（右键菜单信箱，消费即清空，TTL 30s）；正文不落 storage | Side Panel / 全页工作台「聊天」Tab（`ChatPanel` + `SessionList`）、「总结本页」按钮、右键菜单「用 DualMind 总结本页」（仅 `contexts: ['page']`，`disabledHosts` 站点置灰） | V2 可用 |

> 共享提取层 `features/page-content/` **不是独立 Feature**：无消息前缀、不写 storage，被 `chat` 与 `immersive` 共同引用（`segmenter` 语义采集 / `budget` 字符预算截断）。

V1 / V1.5 既有 Feature（`translate` / `selection-toolbar` / `immersive`）见 [features-v1.md](./features-v1.md)。
全页工作台（`entrypoints/workspace/`）不是独立 Feature：无新消息前缀，UI 复用 `features/translate/ui`，与 Side Panel 共用 `translateSession`。

## LLM 调用约定

- 仅 Background 调用 `shared/llm/run.ts`（`runChat` / `runChatStream`）
- Feature 不得直接 `createProviderFromSettings`（Background 的 listModels / test 除外）
- Provider 永不碰 DOM；错误经 `shared/errors` 统一码与文案

## 新增 Feature 检查清单

1. 是否落在 `features/<name>/`（prompts / service / types）
2. 是否新增独立消息前缀，而非塞进 `translate:*`
3. 是否误把逻辑放进 `TranslateService`
4. 是否需要扩大 `host_permissions`（需 Ask first）
5. 是否更新本表与 `docs/decisions.md`
