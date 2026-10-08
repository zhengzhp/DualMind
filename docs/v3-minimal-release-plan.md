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
- [x] **T02** · §3 ｜ ✅ 候选版本 / 源码标识已绑定 **`636fcd3`**（`main`，2026-10-08 11:33:57）= 定版 `1.0.0` + 描述修正 + `minimum_chrome_version`，对应包 sha256 `2a670372…`；S1–S5 范围变更已写入 `docs/decisions.md`。⚠️ 遗留：`9770b9e` 的人工验收证据未绑定到 `636fcd3`（原 DM-V3-ENV-04），已在 §3 与 §16 标明 | 0.3h | 负责人：zp

### Phase 1 · 打包与包内安全（P0 机械项，≈1.5h）

- [x] **T03** · B6 ｜ `pnpm zip` 生成正式包 ✅ 2026-10-08 → `.output/dualmind-0.1.0-chrome.zip`（227,847 B / 227.85 kB；sha256 `3d741a39c812f49c309569cb26fd5a3ea6d52583f5cc3e7e48c975b9abc83204`） | 0.2h
- [x] **T04** · REL-03 · P0 ｜ 解压最终 zip，核对 manifest / 权限 / 脚本 / 资源 / 校验值 ✅ 72 文件 / 788K（解压后）；manifest 与批准口径一致（见 §7）；「运行加载」部分留 T09 / T28 | 0.3h
- [x] **T05** · PRIV-08 · P0 ｜ zip 全内容检查 ✅ 无 `.env` / `.map` / `.ts` / 日志 / 凭据 / `.e2e-profile` / trace | 0.2h
- [x] **T06** · PRIV-01 / PRIV-02 · P0 ｜ 最终包 manifest 口径 ✅ `permissions=[storage,sidePanel,contextMenus]`、无 `optional_permissions`、无 `debugger`/`scripting`/`tabs`/`activeTab`、无 `web_accessible_resources`、无 `content_security_policy`（走 MV3 默认）；`commands` 仅 `translate-selection`(Alt+K) | 0.2h
- [x] **T07** · PRIV-05 · P0 ｜ 最终包 `content.js` 静态复跑 ✅ `getSettings`/`Authorization`/`Bearer`/`sk-` 命中 **均为 0**；`apiKey` 仅默认空串（`apiKey:""`） | 0.2h
- [x] **T08** · PRIV-04 / PRIV-06 · P0 ｜ 最终包复跑 ✅ 密码掩码 `••••` 存在于 `content.js`；`background.js` 含 `Authorization`/`Bearer` 各 1（仅请求头）、`debugger`/`scripting` 命中 0；DM-V3-002 超时常量 `1e4`/`15e3` 均在包内 | 0.2h
- [ ] **T09** · AUTO-06 · P1 ｜ 最终包加载 + 主路径冒烟（防止「验旧包、交新包」）—— **待真实 Chrome 加载** | 0.2h

### Phase 2 · 隐私实证（P0，≈1～2h）

- [ ] **T10** · PRIV-03 · P0 ｜ DevTools 网络观察：翻译 / Chat / Agent 各一条，确认仅打用户配置端点，无遥测 / 未知第三方 —— 📋 **步骤已就绪，待你执行**：runbook **B11-1 · T10 · PRIV-03**（三链路操作 + 记录表 + 判定口径「出现任何非用户配置 host 即 **P0 FAIL**」+ 常见误判提示）。需真实浏览器抓包，**Agent 不能代跑** | 0.5h
- [x] **T11** · REL-08 · P0 ｜ ✅ **完成**：新建根目录 `PRIVACY.md`（中英双语，生效 2026-10-08，适用 v1.0.0 起），口径与 `store-listing.md` 及代码事实逐条对齐（无后端 / 无遥测 / 无远程代码；密码框掩码；Key 仅 Background；删除方式；Agent 边界）。公开 URL：政策 `https://github.com/zhengzhp/DualMind/blob/main/PRIVACY.md`（仓库 public），支持入口 `https://github.com/zhengzhp/DualMind/issues`；README 与 store-listing 已互链 | 1～1.5h

### Phase 3 · Agent 硬性补齐（P0，≈0.5～1 天）★关键路径

> **做法**：优先扩 `e2e/agent-lifecycle.e2e.ts`（mock Provider，确定性断言），勿排 9 次人工会话。P0 判据以**页面计数器 / mock 请求轮次**为准，不以模型自然语言摘要为准。

- [x] **T12** · LIFE-06 · P0 ｜ ✅ **单测记账（§7.1 口径）**：`service.test.ts`「工具超时终止整个任务，不尝试同批次下一个动作」+ `executor.test.ts`「执行中的等待到请求截止时间即终止」「超时请求不执行」⇒ 三条判据（整任务失败 / 同批下一动作不执行 / 到期请求不补执行）均有断言。**E2E 不可构造**（页面侧工具均为本地同步操作，无法超 15s 后才回包） | 0.2h
- [x] **T13** · LIFE-10 · P0 ｜ ✅ **E2E PASS**：新增「LIFE-10 · 运行中切活动 Tab → 工具仍只发往原绑定页」——新开内容页并置为活动页后，工具仍写入原绑定页，新页计数器为空 | 0.2h
- [x] **T14** · LIFE-12 · P0 ｜ ✅ **E2E PASS**：新增「LIFE-12 · SPA 导航（pushState）使旧计划与确认失效」——同文档 pushState 后旧计划失效、批准入口 `toHaveCount(0)` | 0.2h
- [x] **T15** · LIFE-19 · P0 ｜ ✅ **E2E PASS**：新增「LIFE-19 · 运行中停用当前站点 → 后续工具被拒且零写入」——运行中改 `disabledHosts` 后，下一次工具被拒、UI 提示「当前站点已停用…」、页面零写入 | 0.2h
- [x] **T16** · LIFE-02/03/05/08/11 ｜ ✅ **部分完成**：新增「LIFE-08（补）· 第二入口被拒后，第一任务的计划 / 确认 / UI 不被改变」（前后对比 + 批准仍有效）。其余子分支（迟到回包注入、旧批准 / 旧确认竞态点击、待危险确认时的刷新变体、hash / replaceState）**未构造**，已在测试计划逐条披露（同一 `invalidate()` / 丢弃非当前 taskId 通路），并登记为已声明延后 | 0.5h
- [ ] **T17** · NET-01 · P1 ｜ 📋 **步骤已就绪，待执行**：runbook 新增 **B7a · NET-01 双 Provider 完整闭环（含 `finish`）** —— 含四条判据、推荐**只读**目标（`观察这个页面有哪些可交互元素，然后汇报结果`，避开危险闸门干扰）、Step A（Ollama `qwen3:4b`）/ Step B（BYOK）、**记录模板**（逐格：判据 1–4 / 轮数 / finish / 页面写入数 / 证据）、常见失败处理，以及判定口径「**单侧不达即 NET-01 不闭合**」。需真实 Provider，**待你提供端点后执行**（要点复述见 runbook **B11-2**） | 0.5h
- [x] **T18** · AG-16 / AG-18 · P1 ｜ ✅ **确认既有覆盖并勾选**：`agent-plan.e2e.ts` 已有「AG-16 · 空目标或全空格时『开始』不可用」「AG-18 · 工具调用被拒后模型换策略并完成」且全绿；未覆盖部分（storage 故障注入、迟到回包）已披露为延后 | 0.2h

### Phase 4 · 收窄后的回归与升级（≈0.5～1 天）

> **执行步骤已就绪** → runbook **B10 · 回归与升级（REG / DATA，按 S3 / S4 收敛）**（Step 5 回归冒烟 / Step 6 升级与持久化）。**T19～T22 已全部转为自动化**（既有 E2E / 单测 + 新增 `e2e/data-persistence.e2e.ts`），**无人工作业项**。

- [x] **T19** · REG-11（FAB 拖动 / 贴边 / 记忆）｜ ✅ **已自动化**：`e2e/immersive.e2e.ts →「悬浮入口：可拖动、贴边吸附并全局记忆位置」+「指针穿过按钮与菜单之间的空隙后，动作仍可点击」`。**改动面命中**（`features/page-fab` 有改动），故保留 | 0.0h
- [x] **T20** · DATA-03 + DATA-04（S4 保留项）｜ ✅ **已自动化**：新增 `e2e/data-persistence.e2e.ts`（DATA-03 迁移 + 幂等；DATA-04 关 / 重开同一 profile）。**关键竞态已解决**：SW 监听 `storage.onChanged` 会抢先迁移，构造与前置断言必须合并在同一次 `evaluate`（拆成两次 CDP 往返在整套 E2E 里必现失败）；另确认 `runMigrations()` 挂在 `getSettings()` 上，所以**打开内容页即可触发，无需 Reload 扩展** | 0.3h
- [x] **T21** · REG-17（+ REG-19）｜ ✅ **已自动化**：`e2e/options.e2e.ts` 4 条 + `providers/*.test.ts`（REG-17）；`entrypoints/options/diff.test.ts` 单测覆盖「草稿差异 → 空补丁 / 只提交变更字段」（REG-19，逻辑层） | 0.0h
- [x] **T22** · REG 冒烟 4 条 ｜ ✅ **已自动化**：REG-01 `selection-toolbar`（shortcut 不自动弹）、REG-04 `selection-toolbar` 6 条、REG-08/10 `immersive`（布局还原 / 仅译文 / 动态补译 / 禁用站点）、REG-13 `chat` + `workspace` | 0.0h
- [ ] **T23** · DATA-01 / DATA-02 ｜ ⚠️ **按 S4 已声明延后**（S4 只保留 DATA-03 + DATA-04）。因此「干净安装引导」与「保留旧数据升级」本轮**不执行**，须在 §16 与 decisions.md 作为范围裁剪登记；**不得**用「卸载重装」冒充升级验证 | 0.3h

### Phase 5 · 入口与 UI（≈0.5 天）

> **执行步骤已就绪** → runbook **B8**（S3 收敛后聚焦 UI-01 / 03 / 04 / 05 / 09 / 11）。**已由新增 `e2e/agent-ui.e2e.ts`（8 条用例）覆盖**；T24 的真实侧栏判据仍必须**有头**（`E2E_HEADED=1`，无头下自动 skip）。

- [x] **T24** · UI-01 · P1 ｜ ✅ **已自动化**：`e2e/agent-ui.e2e.ts →「UI-01a」`（有头）断言 **SIDE_PANEL context +1 + 无新标签页 + 信箱被消费 + 目标页零写入** ⇒「侧栏而非标签页」已机器可判；`「UI-01b」`（无头）断言切 Agent Tab / 目标框为空 / 无计划卡 / 无批准入口 / 绑定页 = 当前页 / 模型 0 调用。⚠️ 仅真实侧栏**内部观感**保留人工 | 0.2h
- [x] **T25** · UI-03 / UI-04 · P1 ｜ ✅ **已自动化（部分）**：`「UI-03」` 关 FAB 后划词仍在且 Agent 仍能完整写入；`「UI-04a」` 隐藏列表只关 FAB（划词仍可用）；`「UI-04b」` 整站禁用 ⇒ 都不注入。❌ **保留人工**：`chrome://` / `edge://` / 扩展页 / 商店页 —— Playwright 拿不到这些页面的内容脚本上下文，无法直接断言 | 0.1h
- [x] **T26** · UI-05 / UI-11 · P1 ｜ ✅ **已自动化（UI-11 范围收敛）**：`「UI-05」` 两个同 URL 内容页各起一任务、各自只写自己的页、无跨页重放（两页计数各 1）；`「UI-11」` 网页助手的 6s 慢流式与 Agent 规划**同时在途**、互不打断、两边都不写页面。⚠️ 未并入沉浸译（其按段落逐次调用模型，与有序 mock 脚本共用时步数随分段数漂移 ⇒ 合并即不稳定），**「三功能同页并发」保留人工** | 0.1h
- [x] **T27** · UI-09 · P1 ｜ ✅ **已自动化（四处）**：未配模型 ⇒ 文案「请先在设置中填写 API Key」且输入 / 「开始」**回到可用态**（非无限 loading，`agent-ui` 新增）；空目标禁用（`AG-16`）；401 / 429 / 500 / 连接重置文案可读且不泄露响应体（`agent-network`）；无 JS 堆栈（`agent-entry`）。❌ 仍缺 loading 空白页的专门视觉检查 | 0.1h

### Phase 6 · 上架材料与签收（≈1 天）

- [ ] **T28** · REL-04 · P1 ｜ Chrome 加载最终解压包，Options / 真实 Side Panel / 工作台 / 划词 / 沉浸译 / Chat / Agent 主路径逐一打开 | 0.3h
- [x] **T29** · REL-05 · P1 ｜ ✅ 完成：名称 / 版本 / `default_title` / 四图标（有效 PNG + 尺寸正确）/ 无开发标记 全通过；**修复 V1-only 描述**（改为覆盖三类能力、不夸大，并写明 Agent「可选 + 逐次批准」）；**顺带修复 P1-3**：新增 `minimum_chrome_version: "114"`。已重新 build + zip + 在新包重跑 T04–T08 全通过 | 0.4h
- [x] **T34** · REL-09 · P1 ｜ ✅ 新建 `docs/reviewer-reproduction.md`：安装 → 配置（`ollama pull qwen3:4b`，无需账号 / 付费）→ 翻译 → 阅读助手 → Agent 计划批准 → 危险二次确认 → **资金类动作被拒** → 停止；含无模型降级路径与「勿粘贴真实 Key」提示 | 0.4h
- [~] **T30** · REL-10 · P1 ｜ ⏳ **素材框架就绪（2026-10-08），图片待跑**：新建 `docs/store-screenshots.md`（6 张截图清单 + 每张可粘贴文案 + **模型前提 / 安全确认 / 已知限制**三段 + 提交前 Checklist + 待人工补拍项）与采集用例 `e2e/store-screenshots.e2e.ts`（仅 `DM_CAPTURE=1` 执行，锁定 DPR=1 保证恰为 1280×800）。⚠️ **未完成部分**：① 尚未用最终解压包真正出图；② 工作台 / 阅读助手 / Agent 三张采自 `workspace.html`（与侧栏共用 `WorkbenchApp`），**真实侧栏观感须人工补拍** | 0.5h
- [x] **T31** · REL-12 · P1 ｜ ✅ 新建 `docs/release-notes-v1.0.0.md`：发布说明 + 已知限制 + 已知缺陷表 + **回滚 / 暂停发布预案**（含「无后端 ⇒ 只能商店下架」的影响追踪）；负责人已填 **zp** | 0.3h
- [ ] **T32** · REL-11 · P1 ｜ 提交表单**当日**核验（记录日期）—— 📋 **8 项 Checklist 已就绪**：runbook **B11-3 · T32 · REL-11**（包 sha256 校验 / 包内版本 / 权限口径 / 隐私政策与支持 URL 可达 / 表单字段 / 截图与最终包一致 / 提交日期；含「当日改源码即须重新打包」红线）。**待提交当日执行** | 0.3h
- [x] **T35** · REL-13 · P1 ｜ ✅ 正式包已归档到**仓库外** `~/DualMind-releases/`（zip + `.sha256` + README），`shasum -c` 校验 OK，不再依赖会被覆盖的 `.output` | 0.2h
- [x] **T33** · §16 ｜ ✅ 已**预填签收表框架**：负责人 zp、候选版本 `1.0.0` @ `636fcd3`、包 hash `2a670372…`、Edge 行标「延后（S2）」，并在「结论与遗留」列逐条列出 A / B 段待决项。**日期与结论留「待签」**，明确「预填 ≠ 已通过」。⚠️ 真正签收仍待完成。**2026-10-08 收口**：A 段第 ③ 项由「已知 flake 待披露」更正为「测试夹具竞态已修复（DM-V3-005）」；B 段待决项改为**指向可执行步骤**（T10→B11-1、NET-01→B7a/B11-2、T30 截图框架、T32→B11-3 八项 Checklist） | 0.3h

## 3. Phase D · 明确延后并披露（不勾选、也不豁免）

以下项**本轮不执行**，必须在 `decisions.md` 与 §16 签收中以「**发布范围裁剪 / 已声明延后**」登记：

- **Edge 全列**（S2）：Edge 未安装；本轮声明 Chrome-only，Edge 下轮补。
- **REG 非共享面项**（S3）：REG-08～REG-20 中与被改动面无关者。
- **DATA 其余**（S4）：DATA-01/02/05/06/07/08/09。
- **低价值 P1 / P2**（S5）：PRIV-07、PRIV-09、UI-02、UI-07、UI-10、UI-12、ENV-04、ENV-05、ENV-07。
- **LIFE 的 P1 项**：LIFE-04 / 07 / 09 / 13 / 14 / 15 / 17 / 18 / 20。
- **已覆盖 P0 的未构造「变体」子句**（同一代码通路，故不阻断，但如实登记）：LIFE-02「再点旧批准」、LIFE-03「再点旧确认」、LIFE-05「注入迟到回包」、LIFE-11「待危险确认时的刷新」、LIFE-12「hash / replaceState / 离开再返回」、LIFE-19「解除禁用不恢复旧任务」；AG-16「storage 读 / 写失败注入」、AG-18「迟到结果不串新任务」。
- **NET**：NET-01 双 Provider 到 `finish`（**未做**，需真实 Provider 人工会话）、NET-02 / 03 / 04 未覆盖分支、NET-06 的 E2E 层缺口、NET-07～09。
- ~~**既有偶发 flake**~~ → **已消除（2026-10-08 · DM-V3-005）**：`selection-toolbar` / `selection-panel-toggle` 家族「划词后浮层未出现」经排查为**测试夹具竞态**（`seedSettings` 直写底层 storage 与 SW 启动期 `runMigrations()` 的**写-写竞态**；`runMigrations` 读-改-写整块 settings，中间空窗被夹具写入插入后用 `shortcut` 覆写种子）——**非产品缺陷**（产品内写入都经 `getSettings()/saveSettings()` 与迁移串行）。夹具已改为「**写入 + 回读校验 + 重试**，全部在同一次 `evaluate` 内，失败显式抛错」。有头全量 E2E **连续两轮 83 passed / 0 failed / 6 skipped**（此前两轮各命中 1 条）⇒ **不再列入已声明限制**，REL-12 已同步更正。
- **已知低危缺陷**：`content-scripts/content.css` 缺失（V1/V2 范围，Shadow UI 自带内联样式，正确性无损，仅每页一次失败请求 + 控制台警告）。

## 4. 需同步修订的文档

| 文件 | 改动 |
|------|------|
| `docs/decisions.md` | 新增「V3.0 正式版发布范围裁剪（2026-10-08）」节，记录 S1–S5 |
| `docs/v3-release-test-plan.md` | §1 补「范围变更须记入 decisions，不得静默豁免 P0」；§3 登记表 Edge 改「已声明延后」；§16 签收加「范围裁剪已声明」项 |
| `docs/store-listing.md` | **修正事实冲突**：原文「Agent 默认需用户显式开启 / disabled by default」与代码 `enabled: true` 不符，须改为「安装后可用、但不会自动启动任务」；并补「首轮仅 Chrome」口径 |
| `docs/v3-minimal-release-plan.md` | 本文件 |
| `PRIVACY.md` | 新建：公开隐私政策（REL-08） |
| `docs/release-notes-v1.0.0.md` | 新建：发布说明 / 已知限制 / 回滚预案（REL-12） |
| `docs/reviewer-reproduction.md` | 新建：审核员复现步骤（REL-09） |
| `README.md` | 文档表补 `PRIVACY.md` 链接 |

## 5. 完成判据（Definition of Done）

- [ ] Phase 0–6 全部 `[x]`，且无 `[!]` 阻塞。
- [ ] 最终 zip 有 **版本号 + hash + 日期**，PRIV-01/02/04/05/06/08 与 REL-03 均在该包上通过。
- [ ] LIFE-02/03/05/06/08/10/11/12/16/19 十条 P0 全部有 PASS 证据（真实或 mock + 计数器）。
- [ ] §16 签收表三行填毕（V3.0 封板 / Chrome 发布），第 3 节延后项已登记。
- [x] ~~唯一允许的非 PASS：`selection-toolbar` 既有 flake~~ → **已消除（DM-V3-005）**：查明为测试夹具竞态（非产品缺陷）并修复，两轮有头全量 0 失败 ⇒ **本轮不再存在「允许的非 PASS」**。

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
| **产物（最终，2026-10-08 重打包）** | `.output/dualmind-1.0.0-chrome.zip` · **227,927 B** · **sha256 `2a6703722098cba7e583c96f56bc9b5da7090307fe5280153c347d41629b08c1`** · 已归档 `~/DualMind-releases/` |
| 上一版包（已废弃） | `dualmind-1.0.0-chrome.zip`（sha256 `487f1183…`）—— 因 **REL-05 描述修正 + 新增 `minimum_chrome_version`** 重新打包而作废；`dualmind-0.1.0-chrome.zip`（`3d741a39…`）因版号变更早已作废 |
| 解压规模 | 72 个文件 / 788K |
| 顶层结构 | `manifest.json`、`background.js`(56.6K)、`content-scripts/content.js`(112.4K)、`chunks/`(5 个：Workbench/options/sidepanel/tailwind/workspace)、`options.html`、`sidepanel.html`、`workspace.html`、`icon/`、`model-icons/`(57)、`assets/`、`wordmark.svg` |
| **T05 敏感文件** | 无 `.env*` / `*.map` / `*.ts(x)` / `*.log` / `credentials*` / `*.e2e*` ⇒ 干净 |
| **T06 manifest** | `manifest_version:3`、**`version:1.0.0`**、`permissions:["storage","sidePanel","contextMenus"]`、**无** `optional_permissions`、`host_permissions:["http://127.0.0.1:11434/*","http://localhost:11434/*","<all_urls>"]`、`commands` 仅 `translate-selection`(default/mac 均 `Alt+K`)、`side_panel.default_path: sidepanel.html`、`content_scripts.matches:["<all_urls>"]` 且 js 仅 `content-scripts/content.js`（**无 css** —— 已知低危）、**未声明** `content_security_policy`、**无** `web_accessible_resources`、**无** `debugger`/`scripting`/`tabs`/`activeTab` |
| **T07 隐私静态** | `content.js`：`getSettings`=0、`Authorization`=0、`Bearer`=0、`sk-`=0；`apiKey` 仅 1 处且为默认空串 `apiKey:""` |
| **T08 掩码 / 错误** | `content.js` 含 `••••`（密码掩码）；`background.js`：`Authorization`=1、`Bearer`=1（仅请求头）、`debugger`=0、`chrome.debugger`=0、`scripting`=0；DM-V3-002 常量 `1e4`(MAX_WAIT_MS) 与 `15e3`(TOOL_TIMEOUT_MS) 均在包内 |

**结论**：T01、T03–T08 全部通过，**与 `docs/v3-release-test-plan.md` §3 登记的权限口径一致**。T09（真实加载 + 主路径冒烟）与 T10（网络观察）需真实浏览器，尚未执行。

**⚠️ 后续约束**：Phase 3–5 若**新增测试文件**（不改产品源码），包不受影响；**一旦改动 `features/` / `providers/` / `shared/` / `entrypoints/` 等产品源码，必须重新 `pnpm zip` 并重跑 T04–T08**。

### 2026-10-08 · Phase 3 静态与 E2E（`e2e/agent-lifecycle.e2e.ts` 扩展）

**改动**：仅新增/扩展测试文件（**未改产品源码** ⇒ 上述 `1.0.0` 包仍有效，无需重打包）。

| 项 | 结果 |
|----|------|
| `pnpm compile` | ✅ `tsc --noEmit` **0 error** |
| `npx playwright test e2e/agent-lifecycle.e2e.ts` | ✅ **11 passed**（原 7 + 新增 4），15.9s |
| 新增用例 | LIFE-08（补）· 第二入口被拒后第一任务计划 / 确认 / UI 不被改变；LIFE-10 · 运行中切活动 Tab；LIFE-12 · SPA 导航（pushState）；LIFE-19 · 运行中停用当前站点 |
| 全量 `npx playwright test` | **71 passed / 1 failed / 1 skipped**（2.8 min）。较上轮 68 通过增加 4 条新用例（73 总，3 项差异见下） |
| 唯一失败 | `selection-toolbar.e2e.ts:83「按 Esc 收起浮层」` —— 与既有登记**同一族 flake**（`.dm-btn.primary` 解析到但 `hidden`，单跑稳定通过），按负责人意见**暂时忽略** |
| `1 skipped` | `selection-panel-toggle.e2e.ts` 真实 Side Panel（无头自动 skip，有头下已于 §5.3 补齐） |

**结论**：T12–T16、T18 闭合（T12 走单测记账、T16 部分完成并披露未构造变体）；**T17（NET-01 双 Provider 到 `finish`）未做**，需真实 Provider 人工会话。

### 2026-10-08 · Phase 6 文档项（REL-09 / REL-12 / REL-05 核对）

| 项 | 结果 |
|----|------|
| **REL-05 产物核对** | ✅ 名称 `DualMind`、版本 `1.0.0`、`action.default_title`=「打开 DualMind」、`icon/{16,32,48,128}.png` 均 `file` 验证为**有效 PNG 且尺寸正确**、manifest 无开发标记 ⇒ 全部通过。⚠️ **发现 1 处待修**：`description` 为 V1 口径「AI 浏览器助手 — 划词翻译 / Side Panel / 本地 Ollama」，**未提阅读助手与可选本页 Agent**，不满足 REL-05「无 V1-only 宣传」 |
| **REL-09** | ✅ 新建 `docs/reviewer-reproduction.md`（安装 → 配置 → 翻译 → 阅读助手 → Agent 批准 → 危险二次确认 → **资金类动作被拒** → 停止；含无模型降级路径） |
| **REL-12** | ✅ 新建 `docs/release-notes-v1.0.0.md`（发布说明 / 已知限制 / 已知缺陷表 / 回滚暂停预案）；⚠️ 负责人待填 |
| **REL-13** | ⏳ 未做：正式包仍只存在于会被 build 覆盖的 `.output`，需另存 + `.sha256` |

**结论**：T29 / T31 / T34 完成；**T29 附带一处 REL-05 发现需拍板**（是否本轮修 manifest 描述 → 会触发重打包 + T04–T08 重跑）。

### 2026-10-08 · Phase 6 收口（描述修正 + 归档）

**拍板**：① 修 `description`；② 同时加 `minimum_chrome_version`；③ 归档到仓库外；④ 负责人 = zp。

| 项 | 结果 |
|----|------|
| 代码改动 | `wxt.config.ts`：`description` → `AI 浏览器助手（BYOK）：划词与整页翻译、网页摘要与问答，以及逐次批准的本页操作 Agent`（48 字符，未超 132 上限）；新增 `minimum_chrome_version: '114'`（修复 review-risk-report P1-3） |
| 重新验证 | `pnpm compile` 0 error；`pnpm zip` → **新包 227,927 B / sha256 `2a670372…`**；重跑 T04–T08：描述 / 最低版本 114 / 权限三项 / 无 `optional_permissions` / 无 CSP / 无 WAR / 图标 4 个 / `content.js` 敏感串全 0 / 掩码与超时常量均在 —— **全通过** |
| 归档（REL-13） | `~/DualMind-releases/`：zip + `.sha256` + `README.txt`；`shasum -a 256 -c` **OK** |
| 文档修订 | `review-risk-report.md`：P1-2 标注「原判断前提失效（Chat/Agent 已实现）」并记录按 V3 口径处理；P1-3 标注已修复 |
| 连带更新 | `release-notes-v1.0.0.md` 版本表（新 hash / 最低版本 / 负责人 zp）、测试计划 §3 登记表与 REL-05 / REL-12 / REL-13 |

**结论**：**T29 / T31 / T34 / T35 完成**；剩余 Phase 6 仅 T28（真实加载）、T30（截图）、T32（提交当日核验）、T33（签收表）。

### 2026-10-08 · T02 + T33（绑定与签收框架）

| 项 | 结果 |
|----|------|
| **T02 · §3 绑定** | 候选版本 / 源码标识改绑 **`636fcd3`**（`main`，2026-10-08 11:33:57）→ 对应包 sha256 `2a670372…`；历史证据链（`9770b9e` 人工 / `b3af568` 自动化）保留并标明差异；执行人填 **zp**；「构建与包」行补本次重打包与 T04–T08 复跑结论 |
| **T33 · §16 预填** | 签收表补入负责人 `zp`、候选版本 `1.0.0` @ `636fcd3`、包 hash、Edge 行「延后（S2）」；「结论与遗留」列逐条列出 A 段（ENV-04 证据未绑定 / 必测复跑 / 已知缺陷披露）与 B 段（T09/T10 / NET-01 / REL-10/11）待决项。**日期与结论留「待签」**，并加说明「预填框架 ≠ 任何闸门已通过」 |

### 2026-10-08 · T17 准备（NET-01 可执行步骤）

**为什么是「准备」而不是「完成」**：NET-01 要求两侧 Provider 各走到 `finish`，需真实端点，**我无法独立执行**。

| 项 | 结果 |
|----|------|
| 新增 runbook 段 | `docs/v3-acceptance-runbook.md` → **B7a · NET-01 双 Provider 完整闭环（含 `finish`）** |
| 做了什么 | 把 NET-01 从「一句判据」变成**可照着做 + 可留证**的步骤：四条判据表（计划 / 结构化参数 / 多轮 ≥2 / finish）；**推荐只读目标** `观察这个页面有哪些可交互元素，然后汇报结果`（只读 ⇒ 不触发危险闸门，专验「多轮 + finish」）；Step A（Ollama `qwen3:4b`）与 Step B（BYOK）逐条操作 + 期望；**记录模板**（判据 1–4 / 轮数 / finish / 页面写入数 / 证据）；常见失败与处理（反复 snapshot / 无 `tool_calls` / `finish(success:false)` 误判 / Ollama 冷启动）；判定口径「**单侧不达即 NET-01 不闭合**」 |
| 关键防呆 | ① 明确「不要把步骤写进目标框」（沿用 runbook 书写纪律，避免 AG-13 那类失效）；② 明确「`success:false` 的 finish **不算** PASS」；③ 明确禁用 `/t2-danger` 作本条的停留页 |
| 前置 | 先跑「模型 tools 能力一次性探测」确认 `tool_calls` 非空；最大步数保持默认 20（压小会误触 AG-19 污染判定） |

**结论**：T17 **仍未闭合**（无真实端点），但执行成本已从「临场设计」降到「照表填」。

### 2026-10-08 · T19–T27 准备（Phase 4 / 5 人工步骤）

**为什么是「准备」**：这 9 项全部需要真实浏览器 / 侧栏 / 人工观察，**我无法独立执行**。此前清单里它们只有一句目标，执行时仍需临场设计。

| 项 | 结果 |
|----|------|
| 新增 runbook 段 1 | **B8 · UI 入口 / 禁用 / 能力限制**（S3 收敛后聚焦 UI-01/03/04/05/09/11）：Step 1 UI-01（FAB → **真实 Side Panel** + Agent，含「若打开普通标签页即 FAIL」的判定）；Step 2 UI-03/04（关 FAB vs 隐藏 FAB vs 整站禁用的**语义差异**）；Step 3 UI-05/11（多页隔离 + 三功能并发）；Step 4 UI-09（loading / 空值 / 401·500） |
| 新增 runbook 段 2 | **B10 · 回归与升级**（S3/S4 收敛）：Step 5 回归冒烟 7 行（REG-01/04/11/08·10/13/17/19）；Step 6 升级与持久化（DATA-03/04） |
| 关键防呆 | ① **REG-11 标注为「改动面命中」**（`features/page-fab` 有改动 ⇒ 必跑，不能因 S3 收敛而漏）；② **DATA-03 的迁移验证陷阱**：人工验迁移**必须先清空 `local:migrations` 标记**，否则迁移不触发会被误判 PASS（E2E 种子会预置标记）；③ **UI-01 明确 FAIL 条件**（打开的是标签页而非真实侧栏）；④ 隐藏 FAB ≠ 整站禁用（UI-03/04 的常见误判） |
| 批次表 | 补 B10 行；B8 行标注 S3 收敛后的实际范围与 S5 延后项 |
| 范围一致性 | **T23（DATA-01/02）按 S4 明确标为「已声明延后」**，与 decisions.md 的 S4 对齐，避免「清单要跑、决策已延后」的自相矛盾 |

**结论**：T19–T27 **仍未闭合**，但已全部降为「照表执行 + 留证」。

### 2026-10-08 · DM-V3-005 收口 + 验证范围裁剪（跳过最终包全量有头 E2E）

| 项 | 结果 |
|----|------|
| flake 定性与加固 | `selection-toolbar` 家族「划词后浮层未出现」= **测试夹具竞态**（`seedSettings` 直写底层 storage 与 SW 启动期 `runMigrations()` 的写-写竞态），**非产品缺陷**。`e2e/fixtures.ts` 改为「**先等启动期写入收敛 → 写入 → 连续两次稳定校验**」，失败显式抛错；`selection-toolbar.e2e.ts`「滚动跟随」由固定 `waitForTimeout` 改 `expect.poll` |
| 证据 | 有头全量 3 轮 `83/0`、`82/1`（同族）、加固后 `83/0`；**最终版定向复跑 15/15（44.1s）** |
| **拍板：跳过** | **负责人（zp）决定不再补跑「最终包完整有头 E2E」**（判断依据：夹具缺陷非产品缺陷、v2 已在 `83/0` 与定向 15/15 两档通过；全量复跑耗时高、边际信息低） |
| 影响登记 | ① 这是一次**验证范围裁剪**（非 P0 豁免：E2E 为夹具层验证，产品 P0 判据不变）；② DM-V3-005「不再作为产品已知缺陷」的依据是**代码路径证据 + 定向证据**，非完整套件统计置信度；③ 已同步记入 [v3-release-test-plan.md](./v3-release-test-plan.md) §15 / §16；④ 若发布后同族用例再现浮层未出现，优先按「夹具竞态」复核 |
| 未触及产品源码 | 本轮仅改测试夹具与文档 ⇒ 已归档的 `1.0.0` 包（sha256 `2a670372…`）**仍有效，无需重新打包** |

**结论**：发版前剩余代码级风险（DM-V3-005）已闭环；完整有头套件的最终包复跑按负责人意见**跳过并登记**。
