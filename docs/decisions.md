# DualMind 决策记录 · 当前版本（V2）

> 生效版本：**V2（摘要 / 聊天，进行中）**。  
> V1 / V1.5 历史决策（已封板）见 [decisions-v1.md](./decisions-v1.md)。  
> 架构见 [architecture-v2.md](./architecture-v2.md)（V2）与 [architecture-v1.md](./architecture-v1.md)（V1 / V1.5）。  
> 代理入口与 Always / Ask / Never 见仓库根目录 [AGENTS.md](../AGENTS.md)。

## 发布与验证节奏（跨版本 · 当前生效）

沿用自 V1 阶段（2026-10-06 决定），适用于 V2 / V3。

**决定**：**提审发布（Chrome / Edge）、全量验证（`pnpm test:e2e` 全量）、`pnpm compile` 统一推迟到 V3 完成之后**一次性执行，不再作为每个版本的收尾动作。

| 项目 | 何时做 | 说明 |
|------|--------|------|
| 改动所需的最小验证 | 每次改动 | 如本次仅跑 `pnpm test` 单测；不为「顺手跑全量」付出成本 |
| `pnpm compile` | V3 完成后 | 与发布闸门一起跑 |
| `pnpm test:e2e` 全量 | V3 完成后 | 依赖真实 Ollama + `wxt build`，见 [decisions-v1.md](./decisions-v1.md)「本地 E2E 运行须知」 |
| 提审发布 | V3 完成后 | 上架材料 `docs/store-listing.md` 届时按最终权限 / 单一用途复核 |

**理由**：V2 / V3 仍会改动消息协议、权限与目录结构，过早提审会产生重复的验证成本与上架材料维护；`docs/store-listing.md` 的权限用途说明必须与最终 `manifest` 一致，早提交即早返工。

**风险与对策**：推迟期间不做全量回归，可能积累隐性问题 → 以 `git` 分支 / 提交粒度隔离，V2 / V3 各阶段改动保持可独立回滚；发布闸门清单见 [architecture-v2.md](./architecture-v2.md)。

## V2 摘要 / 聊天 · 范围与决策（2026-10-07）

**范围**：网页摘要（一键）+ 单页网页问答（多轮、流式、可中止）；上下文可在「选区 / 当前页正文」间切换；复用同一 BYOK Provider，不新增模型接入。

**不做**：PDF / 视频、RAG 向量检索、跨标签页知识库、云同步、搜索增强、邮件回复、Agent 自动化（后置 V2.5+ / V3）。

| 决策 | 结论 |
|------|------|
| Feature 隔离 | 新建 `features/chat/`；独立消息前缀 `chat:*` + Port `dualmind-chat`；**不复用** `translateSession` / `translate:*` |
| 共享提取层 | 新建 `features/page-content/`，从 `immersive/segmenter.ts` 抽出「语义正文提取 + 标题/段落分块 + 截断预算 + 选区上下文」，沉浸译改为引用该模块（**先做等价重构，既有单测作护栏**） |
| storage | 新增 `local:chatPrefs`（上下文范围等）与 `local:chatSessions`（**全局**会话列表，每条含 `pageUrl` / `pageTitle` / `messages` / `updatedAt`） |
| 会话容量 | 上限 **50 会话 / 每会话 200 条消息**，超限**淘汰最旧**（`chrome.storage.local` 有配额，必须先定清理策略） |
| 正文不落 storage | 页面正文只在会话内保存已发送的上下文片段 / 引用，不作为独立快照持久化 |
| 权限 | **不扩大**：复用现有 `<all_urls>` content script，不引入 `scripting` / `activeTab` |
| 入口 | Side Panel / 全页工作台「聊天」Tab；右键菜单「总结本页」；（可选）快捷键 |
| 与既有 Feature 关系 | 复用同一 BYOK Provider（`shared/llm`）与 Side Panel；**不新增模型接入**，不改动 `translate` / `immersive` 行为（`page-content` 抽取为等价重构） |
