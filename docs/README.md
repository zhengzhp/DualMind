# docs 文档地图

> 用途：说明每份文档的**入口 / 使用时机 / 权威性**，避免整读大文档。
> 约定：**活文档** = 当前规则来源；**归档** = 仅历史背景，**不作为当前规则来源**；**发布材料** = 按需检索。
> 阅读纪律：「不得整体阅读」只针对**大型**文档（如 `v3-*`）；短文档或精准片段可正常读取。大文档一律先 `rg` 定位再局部读取。
> 代理入口与 Always / Ask first / Never 见 [../AGENTS.md](../AGENTS.md)。

## 活文档（当前权威）

| 文档 | 入口 | 使用时机 | 权威性 |
|------|------|----------|--------|
| [decisions.md](decisions.md) | 当前决策（V3 已立项） | 改产品边界 / 范围 / 权限前 | **权威**：产品与技术决策 |
| [architecture-v3.md](architecture-v3.md) | 当前架构（V3） | 改分层 / 数据流 / 目录前 | **权威**：架构 |
| [features.md](features.md) | 当前 Feature 契约表（消息 / storage / UI） | 加 / 改 feature 与消息协议前 | **权威**：契约 |
| [cursor-cheatsheet.md](cursor-cheatsheet.md) | Cursor 快捷键与 `/` 命令 | 查命令与快捷键 | 参考 |

## 归档（历史背景，仅按需检索，非当前规则来源）

| 文档 | 说明 |
|------|------|
| [decisions-v2.md](decisions-v2.md) · [architecture-v2.md](architecture-v2.md) · [features-v2.md](features-v2.md) | V2 归档（已封板） |
| [decisions-v1.md](decisions-v1.md) · [architecture-v1.md](architecture-v1.md) · [features-v1.md](features-v1.md) | V1 / V1.5 归档（已封板） |

> 归档文档**内容冻结、不再更新**；需要历史背景时按关键词检索，勿作为当前规则依据。

## 发布材料（V3 封板 / 上架，按需检索）

| 文档 | 入口 | 使用时机 | 权威性 |
|------|------|----------|--------|
| [v3-release-test-plan.md](v3-release-test-plan.md) | 用例正文：纪律 / 判据 / 用例 / 签收 | 执行与登记验收前 | **权威**：用例与通过标准 |
| [v3-release-test-plan-log.md](v3-release-test-plan-log.md) | 闸门证据索引、缺陷登记与复测结论 | 复核证据 / 缺陷时 | 证据流水（append-only） |
| [v3-acceptance-runbook.md](v3-acceptance-runbook.md) | 人工验收步骤与记录表模板 | 跑人工批次时 | **权威**：操作步骤 |
| [v3-acceptance-runbook-log.md](v3-acceptance-runbook-log.md) | 批次执行过程与原始证据 | 复核批次结果时 | 证据流水（append-only） |
| [v3-minimal-release-plan.md](v3-minimal-release-plan.md) | 本次发布最小任务清单与估时 | 规划发版剩余项 | 计划 |
| [release-notes-v1.0.0.md](release-notes-v1.0.0.md) | 发布说明与已知限制 | 提审 / 归档 | 发布材料 |
| [store-listing.md](store-listing.md) | 商店文案与权限用途说明 | 提审前复核 | 发布材料 |
| [store-screenshots.md](store-screenshots.md) | 上架截图采集说明与清单 | 采集 / 复核截图 | 发布材料 |
| [review-risk-report.md](review-risk-report.md) · [reviewer-reproduction.md](reviewer-reproduction.md) | 审核风险评估与复现步骤 | 提审准备 | 发布材料 |

> 两份 `*-log.md` 为**追加型证据流水**：新记录追加到指定位置；更正旧结论时**追加更正记录并引用原记录，不静默覆盖**。

## 资产（按需查看）

- `docs/assets/store/`：6 张上架截图（PNG，约 580K）。该目录已在 `.cursorindexingignore` 中排除出**语义索引**（仍可按路径读取）。
  需要查看时按文件名直接读取（清单见 [store-screenshots.md](store-screenshots.md)），勿全目录扫描。
