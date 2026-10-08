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
| 模型前提 | 需支持 tool / function calling；Options 与 Agent 空态标明。**探测（2026-10-08 落地）**：tool 环中连续两轮零 `tool_calls` 即判定模型不支持并明确失败（错误码 `TOOLS_UNSUPPORTED`），不静默退化成乱点或反复催促到轮数上限 |
| 内容页绑定 | 复用 `resolveContentTab`（与 Chat 同语义）；尊重 `disabledHosts`（整站不注入则 Agent 不可用） |
| 安全加固（2026-10-08） | 同一内容页只允许一个 Agent 任务；启动握手绑定任务 / 文档 / URL，快照携带版本。执行前在内容页复核真实目标与危险等级；支付 / 转账动作在非金融域也拒绝。停止、超时、断连及 URL / 文档变化使旧任务与确认失效；已发生的同步动作不可撤销。UI 使用 Background 回传的实际绑定页，卸载主动取消，丢弃已结束 / 非当前任务消息。 |
| storage | `local:agentPrefs`（启用开关、最大步数；确认策略固定，Options 仅只读说明）；`local:agentPending`（FAB 信箱）。**收口（2026-10-08）**：V3.0 运行态（计划 / 步骤轨迹 / 中止标志）**仅内存、不持久化** —— SW 重启或刷新后不恢复、不重放页面操作，须重新发起并重新批准 |
| 入口 | Side Panel / 全页工作台 **Agent** Tab（替换占位）；（可选）`page-fab` 注册「请 Agent 操作本页」→ 开侧栏 + 切 Tab（可复用 pending 信箱模式，前缀独立） |
| 与 Chat 边界 | Chat = 只读摘要 / 问答；Agent = 可写 DOM；禁止把操作工具塞进 `features/chat/` |
| 商店口径 | 提审时表述为「翻译 + 阅读助手 + **可选本页操作 Agent**」；Agent **默认启用但可关**，且不会自动启动任务（每个任务须显式发起 + 计划批准，见「V3.0 正式版发布范围裁剪」S1）；单一用途说明与 [store-listing.md](./store-listing.md) 在发布闸门一并复核 |
| 已知限制（须在 UI 诚实说明） | Shadow DOM / 跨域 iframe / 严格 CSP 下部分操作可能失败；V3.0 不承诺覆盖难站 |

**对标取舍（公开项目，不照搬）**：学 Goby 的「页内 BYOK + tool loop」、WebOperator 的 plan-act-verify、Oloo/Stagehand 的 observe 优先；不学 Monica All-in-One、不学云浏览器 / CAPTCHA / 开发者向 MCP 全家桶。

## V3.0 正式版发布范围裁剪（2026-10-08 拍板）

**背景**：需要一个**可快速提交上架的正式版**。安全红线 SEC-01～SEC-20 已全部通过，自动化闸门 B1–B5 全绿，故剩余工作量集中在生命周期、隐私复跑与上架材料。为压缩周期，对**发布验证范围**做裁剪并登记如下。

**性质声明**：以下均为**发布范围变更**，不是 P0 豁免。测试清单 [v3-release-test-plan.md](./v3-release-test-plan.md) 第 1 节「P0 全部通过、不得以普通豁免放行」的判据**不变**；被延后的项须以「已声明延后」记入签收表，不得写成「经确认可放行」。

| # | 决定 | 说明 |
|---|------|------|
| **S1** | **Agent 保持默认开**（`agentPrefs.enabled = true`） | 不做 opt-in 化；因此 9 条 LIFE P0 **全部必修、不得豁免**。安装后 Agent 可用，但**不会自动启动任务**，每个任务仍需显式发起 + 计划批准 + 危险动作再确认 |
| **S2** | **首轮只发 Chrome，Edge 延后** | Edge 本机未安装（原为 `BLOCKED`）。本轮对外声明 Chrome-only；Edge 全列延后至下一轮。商店材料须同步「首轮仅 Chrome」口径 |
| **S3** | **V1/V2 回归收敛到被改动的共享面** | 依据近 60 提交改动面：`features/page-fab`、`shared/storage`、`providers`、`entrypoints`、`shared/messaging`、`features/chat`。REG-01～20 收敛为 6～8 条冒烟（page-fab / storage 迁移 / providers 正常路径 / 划词 / 沉浸译 / Chat 各一条） |
| **S4** | **升级与持久化（DATA）收敛** | 保留 DATA-03（toolbar / 设置迁移）+ DATA-04（关闭浏览器重启持久化）；DATA-01/02/05～09 延后 |
| **S5** | **低价值 P1 / P2 延后并披露** | PRIV-07 / PRIV-09、UI-02 / UI-07 / UI-10 / UI-12、ENV-04 / ENV-05 / ENV-07、NET-02 / 03 / 04 未覆盖分支、NET-06～09、LIFE 的 P1 项 |

**与既有决策的关系**：本节只裁剪**验证范围**，不改变 V3.0 功能范围、「零新增权限」「计划批准 + 危险动作再确认」等既有拍板；`## V3 浏览器 Agent · 范围与决策` 中的功能边界仍全部有效。

**落地清单与估时**：[v3-minimal-release-plan.md](./v3-minimal-release-plan.md)（≈3.5～4.5 人日；关键路径 Phase 3 → 4 → 6）。

**已声明延后须披露的已知项**（写进 REL-12 发布说明 / 已知限制）：本轮仅 Chrome；`selection-toolbar` 家族存在既有偶发 flake（单跑 11/11、组合跑随机命中，疑似真实流式 + `pointerdown` 竞态）；`content-scripts/content.css` 缺失（低危，Shadow UI 自带内联样式，仅每页一次失败请求）。
