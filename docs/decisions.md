# DualMind 决策记录 · 当前版本（V3 · 已立项）

> 生效版本：**V3（浏览器 Agent · 本页操作）已立项，实现中**——V2 及更早功能冻结，仅修 bug。  
> V2 归档见 [decisions-v2.md](./decisions-v2.md)；V1 / V1.5 见 [decisions-v1.md](./decisions-v1.md)。  
> 架构见 [architecture-v3.md](./architecture-v3.md)（当前）与 [architecture-v2.md](./architecture-v2.md)（V2 归档）。  
> 代理入口与 Always / Ask / Never 见仓库根目录 [AGENTS.md](../AGENTS.md)。  
> 文档版本化 SOP：[.cursor/plans/dualmind-docs-versioning.plan.md](../.cursor/plans/dualmind-docs-versioning.plan.md)。

## 发布与验证节奏（跨版本 · 当前生效）

沿用自 V1 阶段（2026-10-06 决定），适用于 V2 / V3。

**决定**：**提审发布（Chrome / Edge）、全量验证（`pnpm test:e2e` 全量）、`pnpm compile` 统一推迟到 V3 完成之后**一次性执行，不再作为每个版本的收尾动作。

| 项目 | 何时做 | 说明 |
|------|--------|------|
| 改动所需的最小验证 | 每次改动 | 如本次仅跑 `pnpm test` 单测；不为「顺手跑全量」付出成本 |
| `pnpm compile` | V3 完成后 | 与发布闸门一起跑 |
| `pnpm test:e2e` 全量 | V3 完成后 | 依赖真实 Ollama + `wxt build`，见 [decisions-v1.md](./decisions-v1.md)「本地 E2E 运行须知」 |
| 提审发布 | V3 完成后 | 上架材料 `docs/store-listing.md` 届时按最终权限 / 单一用途复核 |

**理由**：V3 仍会改动消息协议与目录结构，过早提审会产生重复的验证成本与上架材料维护；`docs/store-listing.md` 的权限用途说明必须与最终 `manifest` 一致。

**风险与对策**：推迟期间不做全量回归 → 以 `git` 分支 / 提交粒度隔离，改动保持可独立回滚；发布闸门清单见 [architecture-v3.md](./architecture-v3.md)。

## V3 浏览器 Agent · 范围与决策（2026-10-07 立项）

**定位**：在**当前内容页**用自然语言完成多步页面操作的本地 Agent（BYOK / Ollama）；延续分层入口，禁止 All-in-One。

**范围（V3.0）**：独立 `features/agent/`；Background tool-calling 环 + Content Script DOM 工具（观测 / 点击 / 填写 / 滚动 / 等待 / 抽取）；Side Panel / 工作台 Agent Tab 替换占位；可选 `page-fab`「请 Agent 操作本页」；复用同一 BYOK Provider 与 `resolveContentTab`。

**不做（V3.0）**：`chrome.debugger` / CDP、跨标签页操作、定时任务、CAPTCHA、下载管理、网络抓包、MCP 桥、PDF / 视频、RAG、云同步、搜索增强、邮件、支付/转账类动作放行。

**分期**：V3.1 = 可选 debugger + 有限多 Tab + 步骤日志导出；V3.2 = 工作流配方 / 可选 MCP（须再立项）。扩大 V3.0 范围须先更新本文件。

| 决策 | 结论 |
|------|------|
| Feature 隔离 | 新建 `features/agent/`；独立消息前缀 `agent:*` + Port `dualmind-agent`；**不**复用 `translateSession` / `chat:*`，不混入 `TranslateService` |
| 权限（V3.0） | **不扩大**：仅 Content Script DOM 工具，复用现有 `<all_urls>` 注入；**不引入** `debugger` / `scripting` / `activeTab` / `tabs` 新能力声明（用户已拍板 **1A**） |
| 确认粒度 | **计划批准 + 危险动作再确认**（用户已拍板 **2B**）：先展示步骤计划，用户批准后普通步骤自动执行；提交表单、导航至敏感域、删除类等**危险动作**执行前二次确认；随时可停止 |
| 危险动作 | 内置分类（提交 / 支付相关选择器与文案启发式 / 清空或删除控件 / 离开当前页导航等）；不确定时偏保守，按危险处理 |
| 金融 / 支付域 | 默认**拒绝**自动执行（或整任务阻断并提示人工），不靠「确认」放行 |
| 工具集（V3.0） | `snapshot`（可交互元素索引 / a11y 风格）、`click`、`type`/`fill`、`select`、`scroll`、`wait`、`extract_text`、`finish`；元素以快照 **index** 为主，避免脆弱 CSS |
| Tool-calling 环 | Background 编排：观测 → LLM tools → 执行 → 再观测；默认上限约 **20 轮 / 任务**；单工具超时（如 15s）；Port 支持 abort |
| 模型前提 | 需支持 tool / function calling；Options 与 Agent 空态标明；不支持时明确提示，不静默退化成乱点 |
| 内容页绑定 | 复用 `resolveContentTab`（与 Chat 同语义）；尊重 `disabledHosts`（整站不注入则 Agent 不可用） |
| storage | `local:agentPrefs`（启用开关、最大步数、确认策略只读展示等）；V3.0 会话可先内存，是否持久化跟实现时最小需求再定（不定则写进本表补丁） |
| 入口 | Side Panel / 全页工作台 **Agent** Tab（替换占位）；（可选）`page-fab` 注册「请 Agent 操作本页」→ 开侧栏 + 切 Tab（可复用 pending 信箱模式，前缀独立） |
| 与 Chat 边界 | Chat = 只读摘要 / 问答；Agent = 可写 DOM；禁止把操作工具塞进 `features/chat/` |
| 商店口径 | 提审时表述为「翻译 + 阅读助手 + **可选本页操作 Agent**」；Agent 默认可关；单一用途说明与 [store-listing.md](./store-listing.md) 在发布闸门一并复核 |
| 已知限制（须在 UI 诚实说明） | Shadow DOM / 跨域 iframe / 严格 CSP 下部分操作可能失败；V3.0 不承诺覆盖难站 |

**对标取舍（公开项目，不照搬）**：学 Goby 的「页内 BYOK + tool loop」、WebOperator 的 plan-act-verify、Oloo/Stagehand 的 observe 优先；不学 Monica All-in-One、不学云浏览器 / CAPTCHA / 开发者向 MCP 全家桶。
