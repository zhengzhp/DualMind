---
name: DualMind 文档版本化切换 SOP
overview: 在版本切换（V2 → V3 → …）时，把已封板版本的决策 / 架构 / 契约文档归档，并重建当前版本活文档；含指针同步清单、校验命令与踩坑记录。方法来源于 2026-10-07 的 V1 → V2 拆分实践。
todos:
  - id: freeze-old
    content: 确认旧版本已封板（功能冻结，无在途改动），确定新版本号 N+1
    status: pending
  - id: archive-decisions-features
    content: 把活文档 decisions.md / features.md 内容切分，旧版本部分归档为 decisions-vN.md / features-vN.md
    status: pending
  - id: archive-architecture
    content: 当前架构 architecture-vN.md 加「已封板」头并去时序漂移；冻结内容不再改动
    status: pending
  - id: rebuild-living
    content: 重建 decisions.md / features.md 为 vN+1 活文档（含跨版本策略 + 新版本边界与契约）
    status: pending
  - id: new-architecture
    content: 新建 architecture-v{N+1}.md（定位 / 目录增量 / 数据流 / 里程碑 / 发布闸门）
    status: pending
  - id: sync-pointers
    content: 同步指针：AGENTS.md、.cursor/rules/*、README.md、docs/cursor-cheatsheet.md、docs/store-listing.md、跨文档互链、源码注释
    status: pending
  - id: verify
    content: 校验链接与文件存在（rg 全仓引用检查），并按仓库节奏跑最小验证
    status: pending
isProject: false
---

# DualMind 文档版本化切换 SOP

> 适用：版本切换（V2 → V3 → V4 …）时的文档整理。
> 方法来源：2026-10-07 的 **V1 → V2** 拆分实践（方案代号 L1），可直接照做。

## 0. 命名与结构约定（L1）

- **归档文档**：`-v{N}` 后缀，内容冻结、不再更新。
  - `docs/decisions-v{N}.md`、`docs/features-v{N}.md`、`docs/architecture-v{N}.md`
- **活文档**：**沿用不带版本后缀的旧名**，始终指向「当前版本」，避免大量引用改动。
  - `docs/decisions.md` → 当前版本（含跨版本策略）
  - `docs/features.md` → 当前版本
  - `docs/architecture-v{N}.md` → 当前版本（架构本就按版本命名）
- **跨版本策略**（如「发布与验证节奏」）**只留在活文档**，归档文档用相对链接指向它，避免两份各写一遍造成漂移。

> 为什么归档用后缀、活文档沿用旧名：`decisions.md` / `features.md` 被 AGENTS / rules / README / 源码注释广泛引用，
> 保留旧名可让**旧引用零改动**；新归档名只增不改。

## 1. 触发时机

- 旧版本（V{N}）**功能已封板**且无在途改动（无未提交的功能代码挂在工作区）。
- 新版本（V{N+1}）范围已在 `docs/decisions.md` 立项（范围 / 不做 / 权限 / 契约先定）。

## 2. 步骤清单（复制即用）

### 2.1 归档旧版本

1. 从 `docs/decisions.md` 中切出**属于 V{N} 的历史内容**（产品/技术/交互/运行时/权限决策 + 缺陷记录 + 封板快照），落到 `docs/decisions-v{N}.md`。
2. 从 `docs/features.md` 中切出**V{N} 的会话边界与 Feature 表**，落到 `docs/features-v{N}.md`。
3. `docs/architecture-v{N}.md`：加「已封板」抬头 + 指向当前版本架构的链接；删除已迁走的时序性内容，只留该版本自身的架构事实。
4. 每个归档文件头部统一写：**状态（已封板 / 不再更新）+ 当前版本活文档的链接 + 代理入口链接**。

### 2.2 重建活文档

5. `docs/decisions.md` 重建为 V{N+1} 活文档：**跨版本策略**（发布与验证节奏等）+ 新版本范围与决策表；头部链接到旧版归档。
6. `docs/features.md` 重建为 V{N+1} 活文档：新版本会话边界 + Feature 表 + **共享约定**（LLM 调用约定、新增 Feature 检查清单）。共享约定留在活文档，归档只链接、不复制。
7. 新建 `docs/architecture-v{N+1}.md`：定位 / 不做项 / 目录增量（相对上一版）/ 核心原则 / 数据流（mermaid）/ 里程碑 + 发布闸门。

### 2.3 同步指针（易漏，逐项打勾）

8. `AGENTS.md`：
   - 首段「当前阶段」改为新版本
   - 规则优先级里的「当前版本」链接
   - Always 里「改架构前先读」的链接
   - `## 细节文档` 表：当前版 + 归档行
9. `.cursor/rules/dualmind-core.mdc`：`## 文档` 小节的更新目标列表
10. `README.md`：`## 项目文档` 表 + 架构要点段 + 权限说明段落的决策文件链接
11. `docs/cursor-cheatsheet.md`：「决策 / 架构」入口行
12. `docs/store-listing.md`：与权限决策的引用行（指向权威那份）
13. **跨文档互链**：归档 ↔ 活文档双向、架构 ↔ 决策 ↔ 契约互链
14. **源码 / 测试注释**：把指向已归档内容的 `docs/decisions.md` 改为 `docs/decisions-v{N}.md`
    （典型：沉浸译缺陷、侧边栏手势窗口等历史背景注释）

## 3. 校验命令

```bash
cd /Users/zhengzp/ai/DualMind

# 3.1 文档清单与行数
ls -1 docs/ && wc -l docs/*.md

# 3.2 全仓引用统计（确认所有被引用文件都存在）
rg -n --no-heading -o '(decisions(-v[0-9]+)?\.md|architecture-v[0-9]+\.md|features(-v[0-9]+)?\.md)' \
  --glob '*.md' --glob '*.mdc' --glob '*.ts' --glob '*.tsx' | sort | uniq -c | sort -rn

# 3.3 找出仍指向「非归档名」的可疑位置（人工确认是否为 V{N} 历史引用）
rg -n 'docs/(decisions|architecture-v[0-9]+|features)\.md' \
  --glob '!node_modules' -g '*.md' -g '*.mdc' -g '*.ts' -g '*.tsx'

# 3.4 最小验证（按仓库节奏；compile / 全量 E2E 后置到发布闸门）
pnpm test
```

**判定标准**：3.2 中出现的每个文件名都必须在 `docs/` 下真实存在；3.3 的命中项逐一确认语义正确（活引用→活文档，历史引用→归档）。

## 4. 已知坑位（本次踩过）

| 坑 | 说明 | 处理 |
|----|------|------|
| **行号级历史引用** | `docs/review-risk-report.md` 含 `decisions.md:72-78` 这类**行号引用**，是当时的诊断快照 | **不改**，改动会破坏历史快照语义；如确需重定向，另起小节说明 |
| **注释指向已归档内容** | 源码注释里的 `docs/decisions.md` 指向的是 V{N} 内容，归档后路径失效 | 重定向为 `docs/decisions-v{N}.md`；只改注释，不动逻辑 |
| **归档文档内部互链** | 归档后从 `decisions-v1.md` 仍链到 `features.md`（活文档） | 指向同版本内容时应改链到 `features-v1.md`；指向跨版本策略时留在活文档 |
| **相对路径** | `docs/` 内互链用 `./x.md`，指向根目录用 `../AGENTS.md` | 逐个确认层级，避免 404 |
| **历史计数不可改写** | 归档里的「N 文件 / M 用例」是当时快照 | 原样保留，不改写；新数据只进活文档的新小节 |
| **架构文档的时序漂移** | 把新版本内容混进 `architecture-v1.md` 会让「-v1」名不副实 | 架构严格按版本分文件，活文档不留旧版架构细节 |

## 5. V1 → V2 范例映射（供 V2 → V3 照搬）

| 动作 | V1 → V2 的实际落点 |
|------|--------------------|
| 归档决策 | `docs/decisions.md` → `docs/decisions-v1.md` |
| 归档契约 | `docs/features.md` → `docs/features-v1.md` |
| 归档架构 | `docs/architecture-v1.md` 加「已封板」抬头并去 V2 内容 |
| 活文档 | `docs/decisions.md` / `docs/features.md` 收敛为 V2 |
| 新架构 | 新建 `docs/architecture-v2.md` |
| 指针同步 | `AGENTS.md`、`.cursor/rules/dualmind-core.mdc`、`README.md`、`docs/cursor-cheatsheet.md`、`docs/store-listing.md` |
| 注释重定向 | `features/immersive/{controller,controller.test,types,validate}.ts`、`entrypoints/options/diff.test.ts`、`e2e/selection-panel-toggle.e2e.ts` |

> 切换到 V3 时：把上表的 `v1` → `v2`、`v2` → `v3` 平移即可；核心理念是
> **「归档加后缀、活文档沿用旧名、跨版本策略只留一份」**。
