# DualMind V3.0 最小发布清单（Chrome-only）

> 编制：2026-10-08 ｜ 状态：**执行中** ｜ 目标：用最小必要工作量拿到一个**可提交上架的正式版**。
> 权威边界：`docs/decisions.md`（发布范围裁剪）、`docs/architecture-v3.md`、`docs/features.md`。
> 全量清单见 [v3-release-test-plan.md](./v3-release-test-plan.md)，人工批次见 [v3-acceptance-runbook.md](./v3-acceptance-runbook.md)。
> 本文只做「**裁剪 + 排序 + 估时**」，不降低任何已声明 P0 的判据。

## 0. 铁律（先读）

1. **P0 不可豁免**。本文所有「延后」都是**发布范围变更**，必须同步写进 `decisions.md` 并在 §16 签收记录；**不得**把裁剪写成「豁免 P0」或「经负责人确认可放行」。
2. **改码即重跑**。修改代码 / 依赖 / 权限 / 配置 / 打包产物后，按影响重跑相关验证；影响安全、消息或任务生命周期时，安全（SEC）与生命周期（LIFE）用例必须重跑。
3. **一次成包**。最终必须有一个不可变 zip + hash + 日期，且能在该包上复跑 PRIV / REL 各项。验证过旧包又提交新包 = AUTO-06 失败。
4. **执行纪律**：`test` / `build` / `compile` / `zip` / `e2e` 均须**单独征得用户同意**后执行。

## 1. 范围锁定（2026-10-08 拍板）

| # | 决定 | 对测试清单的影响 |
|---|------|------------------|
| **S1** | Agent 保持默认开（`agentPrefs.enabled = true`，见 `shared/storage/types.ts:258`） | 9 条 LIFE P0 **全部必修、不得豁免** |
| **S2** | 本轮**只发 Chrome**，Edge 延后 | 整列 Edge 必测项移除；登记表 Edge 由 `BLOCKED` 改为「**已声明延后**」 |
| **S3** | V1/V2 回归（REG）收敛到**被改动的共享面** | 近 60 提交改动面：`features/page-fab`(3)、`shared/storage`(4)、`providers`(9)、`entrypoints`(6)、`shared/messaging`(2)、`features/chat`(4) ⇒ REG 收敛为 6～8 条冒烟 |
| **S4** | 升级 / 持久化（DATA）收敛为迁移 + 重启 | DATA-01～09 ⇒ 保留 **DATA-03 + DATA-04**，其余延后 |
| **S5** | 低价值 P1 / P2 延后并披露 | PRIV-07/09、UI-02/07/10/12、DATA-05～09、ENV-04/05/07、NET-02/03/04 未覆盖分支、NET-06～09 等 |

**已完成、不计入本次工作量（不可逆的沉没收益）**：SEC-01～SEC-20 全绿（19×P0 + 1×P1）；B1–B5 自动化闸门全绿（compile 0 error / Vitest 386 / build / 无头 E2E 68–1skip–0fail / 有头 E2E 68–1flake–0skip）；AG 组 21/23；REL-06 / REL-07 上架材料已按 V3 口径改写。

**关键发现（直接影响估时）**：`e2e/agent-lifecycle.e2e.ts` 已有 **7 条真实用例**（LIFE-01/02/03/05/08/11/16）且在首轮全量 E2E 全绿。故 LIFE 的**零覆盖项只有 4 条**（LIFE-06/10/12/19），另 5 条只需**补子分支断言**。

## 2. 任务清单

> 状态图例：`[ ]` 未开始 ｜ `[~]` 进行中 ｜ `[x]` 完成 ｜ `[!]` 阻塞
> 「对应」列指向 `v3-release-test-plan.md` 的条目编号。

### Phase 0 · 决策与登记（≈0.5h）

- [x] **T01** · REL-01 ｜ 确定正式版 version ✅ **2026-10-08 拍板 = `1.0.0`**（首个正式版）；`package.json` 已改，WXT 取 package version 写入 manifest（无硬编码 version） | 0.2h | 负责人：zp
- [ ] **T02** · §3 ｜ 候选版本 / 源码标识绑定最终 commit；S1–S5 范围变更已写入 `docs/decisions.md`（本清单第 1 节） | 0.3h | 负责人：待填

### Phase 1 · 打包与包内安全（P0 机械项，≈1.5h）

- [x] **T03** · B6 ｜ `pnpm zip` 生成正式包 ✅ 2026-10-08 → `.output/dualmind-0.1.0-chrome.zip`（227,847 B / 227.85 kB；sha256 `3d741a39c812f49c309569cb26fd5a3ea6d52583f5cc3e7e48c975b9abc83204`） | 0.2h
- [x] **T04** · REL-03 · P0 ｜ 解压最终 zip，核对 manifest / 权限 / 脚本 / 资源 / 校验值 ✅ 72 文件 / 788K（解压后）；manifest 与批准口径一致（见 §7）；「运行加载」部分留 T09 / T28 | 0.3h
- [x] **T05** · PRIV-08 · P0 ｜ zip 全内容检查 ✅ 无 `.env` / `.map` / `.ts` / 日志 / 凭据 / `.e2e-profile` / trace | 0.2h
- [x] **T06** · PRIV-01 / PRIV-02 · P0 ｜ 最终包 manifest 口径 ✅ `permissions=[storage,sidePanel,contextMenus]`、无 `optional_permissions`、无 `debugger`/`scripting`/`tabs`/`activeTab`、无 `web_accessible_resources`、无 `content_security_policy`（走 MV3 默认）；`commands` 仅 `translate-selection`(Alt+K) | 0.2h
- [x] **T07** · PRIV-05 · P0 ｜ 最终包 `content.js` 静态复跑 ✅ `getSettings`/`Authorization`/`Bearer`/`sk-` 命中 **均为 0**；`apiKey` 仅默认空串（`apiKey:""`） | 0.2h
- [x] **T08** · PRIV-04 / PRIV-06 · P0 ｜ 最终包复跑 ✅ 密码掩码 `••••` 存在于 `content.js`；`background.js` 含 `Authorization`/`Bearer` 各 1（仅请求头）、`debugger`/`scripting` 命中 0；DM-V3-002 超时常量 `1e4`/`15e3` 均在包内 | 0.2h
- [ ] **T09** · AUTO-06 · P1 ｜ 最终包加载 + 主路径冒烟（防止「验旧包、交新包」）—— **待真实 Chrome 加载** | 0.2h

### Phase 2 · 隐私实证（P0，≈1～2h）

- [ ] **T10** · PRIV-03 · P0 ｜ DevTools 网络观察：翻译 / Chat / Agent 各一条，确认仅打用户配置端点，无遥测 / 未知第三方 | 0.5h
- [ ] **T11** · REL-08 · P0 ｜ **新建**公开可访问隐私政策 + 支持入口（商店硬要求；当前 `docs/` 下不存在对应文件） | 1～1.5h

### Phase 3 · Agent 硬性补齐（P0，≈0.5～1 天）★关键路径

> **做法**：优先扩 `e2e/agent-lifecycle.e2e.ts`（mock Provider，确定性断言），勿排 9 次人工会话。P0 判据以**页面计数器 / mock 请求轮次**为准，不以模型自然语言摘要为准。

- [ ] **T12** · LIFE-06 · P0 ｜ 工具超时后底层响应迟到 → 整任务失败并停止；同批下一个动作不执行；到期请求不补执行（当前**零覆盖**，需注入迟到回包） | 0.2h
- [ ] **T13** · LIFE-10 · P0 ｜ 任务运行时切活动内容 Tab / 另一窗口 → 工具不重定向，UI 仍显示原绑定页（当前**零覆盖**） | 0.2h
- [ ] **T14** · LIFE-12 · P0 ｜ hash / pushState / replaceState 导航、离开再返回原 URL → 旧任务持续失效，不恢复旧授权（当前**零覆盖**） | 0.2h
- [ ] **T15** · LIFE-19 · P0 ｜ 运行中禁用当前站点 → 后续工具被拒绝；刷新后生效一致（当前**零覆盖**） | 0.2h
- [ ] **T16** · LIFE-02/03/05/08/11 补子分支断言（富化现有 mock 用例）：① 迟到回包注入（现为 `hang`，未注入迟到响应）；② LIFE-08 补「第一任务快照 / 确认 / UI 不被改变」前置后置对比；③ LIFE-11 补「待危险确认时」变体 + SPA 导航 | 0.5h
- [ ] **T17** · NET-01 · P1 ｜ 双 Provider（Ollama / BYOK）各跑到 `finish` 正常收尾（目前**双侧均缺**，是唯一「主路径未闭环」点） | 0.5h
- [ ] **T18** · AG-16 / AG-18 · P1 ｜ 空 / 全空格目标、需要多轮 tools 的场景补断言 | 0.5h

### Phase 4 · 收窄后的回归与升级（≈0.5～1 天）

- [ ] **T19** · REG / page-fab ｜ 新增 Agent 入口后，既有拖动 / 贴边 / 显隐行为不回归（`features/page-fab` 有改动） | 0.3h
- [ ] **T20** · DATA-03 / DATA-04 ｜ storage 迁移（`agentPrefs` / `agentPending` 新键）+ 关闭浏览器再打开的持久化 | 0.3h
- [ ] **T21** · REG / providers ｜ tools 支持改动未影响普通翻译 / Chat 路径 | 0.3h
- [ ] **T22** · REG 冒烟 ｜ 划词 / 沉浸译 / Chat 各一条主路径 | 0.3h
- [ ] **T23** · DATA 升级 ｜ 干净安装 + **保留旧数据升级**（**不得**用卸载重装模拟） | 0.3h

### Phase 5 · 入口与 UI（≈0.5 天）

- [ ] **T24** · UI-01 · P1 ｜ FAB「请 Agent 操作本页」→ 打开**真实 Side Panel** 并切 Agent；只刷新绑定页，不自动启动、不自动批准 | 0.2h
- [ ] **T25** · UI-03 / UI-04 · P1 ｜ 关 FAB / 隐藏某站 FAB / 整站禁用；`chrome://`、扩展页、商店页不做非法 DOM 操作 | 0.2h
- [ ] **T26** · UI-05 / UI-11 · P1 ｜ 多内容页并存；沉浸译 / Chat / Agent 并发 | 0.2h
- [ ] **T27** · UI-09 · P1 ｜ loading / 空值 / 请求失败态 | 0.2h

### Phase 6 · 上架材料与签收（≈1 天）

- [ ] **T28** · REL-04 · P1 ｜ Chrome 加载最终解压包，Options / 真实 Side Panel / 工作台 / 划词 / 沉浸译 / Chat / Agent 主路径逐一打开 | 0.3h
- [ ] **T29** · REL-05 · P1 ｜ 扩展名 / 描述 / 图标 / 版本 / 快捷键说明无开发版标识与 V1-only 宣传 | 0.3h
- [ ] **T30** · REL-10 · P1 ｜ 正式包截图与功能说明（含模型前提、安全确认、已知限制） | 0.5h
- [ ] **T31** · REL-12 · P1 ｜ 发布说明 / 已知限制 / 回滚暂停预案 / 负责人 | 0.3h
- [ ] **T32** · REL-11 · P1 ｜ 提交表单**当日**核验（记录日期） | 0.3h
- [ ] **T33** · §16 ｜ 填写签收表（V3.0 封板 + Chrome 发布），登记剩余问题与已声明延后 | 0.3h

## 3. Phase D · 明确延后并披露（不勾选、也不豁免）

以下项**本轮不执行**，必须在 `decisions.md` 与 §16 签收中以「**发布范围裁剪 / 已声明延后**」登记：

- **Edge 全列**（S2）：Edge 未安装；本轮声明 Chrome-only，Edge 下轮补。
- **REG 非共享面项**（S3）：REG-08～REG-20 中与被改动面无关者。
- **DATA 其余**（S4）：DATA-01/02/05/06/07/08/09。
- **低价值 P1 / P2**（S5）：PRIV-07、PRIV-09、UI-02、UI-07、UI-10、UI-12、ENV-04、ENV-05、ENV-07、NET-02 / 03 / 04 未覆盖分支、NET-06～09。
- **LIFE 的 P1 项**：LIFE-01/04/07/09/13/14/15/17/18/20。
- **既有偶发 flake**：`selection-toolbar` 家族（「点击浮层外部收起」「流式翻译中点关闭」）——单跑 11/11，组合跑随机命中，成因疑似真实流式 + `pointerdown` 竞态；**已按负责人意见暂时忽略**，须在 REL-12 已声明限制中列入。
- **已知低危缺陷**：`content-scripts/content.css` 缺失（V1/V2 范围，Shadow UI 自带内联样式，正确性无损，仅每页一次失败请求 + 控制台警告）。

## 4. 需同步修订的文档

| 文件 | 改动 |
|------|------|
| `docs/decisions.md` | 新增「V3.0 正式版发布范围裁剪（2026-10-08）」节，记录 S1–S5 |
| `docs/v3-release-test-plan.md` | §1 补「范围变更须记入 decisions，不得静默豁免 P0」；§3 登记表 Edge 改「已声明延后」；§16 签收加「范围裁剪已声明」项 |
| `docs/store-listing.md` | **修正事实冲突**：原文「Agent 默认需用户显式开启 / disabled by default」与代码 `enabled: true` 不符，须改为「安装后可用、但不会自动启动任务」；并补「首轮仅 Chrome」口径 |
| `docs/v3-minimal-release-plan.md` | 本文件 |

## 5. 完成判据（Definition of Done）

- [ ] Phase 0–6 全部 `[x]`，且无 `[!]` 阻塞。
- [ ] 最终 zip 有 **版本号 + hash + 日期**，PRIV-01/02/04/05/06/08 与 REL-03 均在该包上通过。
- [ ] LIFE-02/03/05/06/08/10/11/12/16/19 十条 P0 全部有 PASS 证据（真实或 mock + 计数器）。
- [ ] §16 签收表三行填毕（V3.0 封板 / Chrome 发布），第 3 节延后项已登记。
- [ ] 唯一允许的非 PASS：`selection-toolbar` 既有 flake（已在 REL-12 已声明限制中披露）。

## 6. 估时汇总

| Phase | 内容 | 估时 |
|-------|------|------|
| 0 | 决策与登记 | 0.5h |
| 1 | 打包与包内安全（P0） | 1.5h |
| 2 | 隐私实证（P0） | 1～2h |
| 3 | Agent 硬性补齐（P0）★ | 0.5～1 天 |
| 4 | 回归与升级 | 0.5～1 天 |
| 5 | 入口与 UI | 0.5 天 |
| 6 | 上架材料与签收 | 1 天 |
| **合计** | | **≈3.5～4.5 人日** |

**关键路径**：Phase 3 → Phase 4 → Phase 6。Phase 1 / 2 可与 Phase 3 并行。

## 7. 执行记录

### 2026-10-08 · Phase 1 静态核对（源码标识 `861fda0` + 版号 `1.0.0`，工作区干净）

| 项 | 结果 |
|----|------|
| 打包命令 | `pnpm zip` → 退出码 0，`✔ Finished in 893 ms` |
| **产物（最终）** | `.output/dualmind-1.0.0-chrome.zip` · 227,845 B · **sha256 `487f11836ea86d94822a0034e597096c31f82a29b27fa6976ceff5fc13456f1e`** |
| 旧包（已废弃） | `dualmind-0.1.0-chrome.zip`（sha256 `3d741a39…`）—— 因版号变更已删除，其核对结论不再有效 |
| 解压规模 | 72 个文件 / 788K |
| 顶层结构 | `manifest.json`、`background.js`(56.6K)、`content-scripts/content.js`(112.4K)、`chunks/`(5 个：Workbench/options/sidepanel/tailwind/workspace)、`options.html`、`sidepanel.html`、`workspace.html`、`icon/`、`model-icons/`(57)、`assets/`、`wordmark.svg` |
| **T05 敏感文件** | 无 `.env*` / `*.map` / `*.ts(x)` / `*.log` / `credentials*` / `*.e2e*` ⇒ 干净 |
| **T06 manifest** | `manifest_version:3`、**`version:1.0.0`**、`permissions:["storage","sidePanel","contextMenus"]`、**无** `optional_permissions`、`host_permissions:["http://127.0.0.1:11434/*","http://localhost:11434/*","<all_urls>"]`、`commands` 仅 `translate-selection`(default/mac 均 `Alt+K`)、`side_panel.default_path: sidepanel.html`、`content_scripts.matches:["<all_urls>"]` 且 js 仅 `content-scripts/content.js`（**无 css** —— 已知低危）、**未声明** `content_security_policy`、**无** `web_accessible_resources`、**无** `debugger`/`scripting`/`tabs`/`activeTab` |
| **T07 隐私静态** | `content.js`：`getSettings`=0、`Authorization`=0、`Bearer`=0、`sk-`=0；`apiKey` 仅 1 处且为默认空串 `apiKey:""` |
| **T08 掩码 / 错误** | `content.js` 含 `••••`（密码掩码）；`background.js`：`Authorization`=1、`Bearer`=1（仅请求头）、`debugger`=0、`chrome.debugger`=0、`scripting`=0；DM-V3-002 常量 `1e4`(MAX_WAIT_MS) 与 `15e3`(TOOL_TIMEOUT_MS) 均在包内 |

**结论**：T01、T03–T08 全部通过，**与 `docs/v3-release-test-plan.md` §3 登记的权限口径一致**。T09（真实加载 + 主路径冒烟）与 T10（网络观察）需真实浏览器，尚未执行。

**⚠️ 后续约束**：Phase 3–5 若**新增测试文件**（不改产品源码），包不受影响；**一旦改动 `features/` / `providers/` / `shared/` / `entrypoints/` 等产品源码，必须重新 `pnpm zip` 并重跑 T04–T08**。
