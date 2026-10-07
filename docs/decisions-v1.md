# DualMind 决策记录 · V1 / V1.5（已封板）

> 状态：**V1 与 V1.5 已封板（功能冻结，仅修 bug）**；本文件为历史归档，不再随新版本更新。  
> 当前版本（V3）决策见 [decisions.md](./decisions.md)；V2 决策归档见 [decisions-v2.md](./decisions-v2.md)。  
> 架构见 [architecture-v1.md](./architecture-v1.md)（V1 / V1.5）、[architecture-v2.md](./architecture-v2.md)（V2）、[architecture-v3.md](./architecture-v3.md)（V3）。  
> 代理入口与 Always / Ask / Never 见仓库根目录 [AGENTS.md](../AGENTS.md)。

## 产品决策

| 决策 | 结论 |
|------|------|
| 首发能力 | 翻译（划词 + Side Panel + 设置） |
| 参考竞品 | Monica：分层入口；不照搬 All-in-One / 重度自动化 |
| V1 不做 | 网页沉浸式全文双语、PDF 对照、自有后端、Browser Operator |
| 主入口 | Side Panel（点击扩展图标打开）；弱化 Popup；侧栏「工作台」打开 `workspace.html`，**先开页再关侧栏**（与「设置」相同） |
| 后续路线 | V1.5 沉浸译 → V2 摘要/聊天 → V3 浏览器 Agent（独立 feature） |

> 跨版本的「发布与验证节奏」为当前生效策略，已移至 [decisions.md](./decisions.md)。

## 技术决策

| 决策 | 结论 |
|------|------|
| 框架 | WXT + Manifest V3 |
| UI | React + TypeScript + Tailwind |
| 浏览器 | Chrome / Edge 优先 |
| AI 接入 | BYOK；用户自带 Key 或本地 Ollama；插件直连，无自有后端 |
| Provider | `openai-compatible` + `ollama`（一等公民） |
| 运行时约束 | **仅 Background** 发起 AI 请求；Provider 永不碰 DOM |
| Node | `>=22`（`.nvmrc` 为 22；本机可用 24） |
| WXT 版本 | `0.21.x`；storage 使用 `wxt/utils/storage` |

## 交互决策

| 决策 | 结论 |
|------|------|
| 划词工具栏 | **默认「仅快捷键」**（Alt/Option+K）；可改为「选中后自动显示」。快捷键可在 chrome://extensions/shortcuts 改键 |
| 浮层关闭 | 统一走 `closeToolbar`：关闭按钮 / 外部点击 / Esc 均收起；有译文不再「钉住」，选区塌陷兜底收起 |
| 浮层定位 | `@floating-ui/dom` 虚拟元素（选区矩形）跟随，滚动/缩放自动重算并做边缘翻转与越界平移 |
| 划词快捷键通道 | 仅 `chrome.commands` → Background → Content；不在 Content 硬编码 keydown，避免与浏览器/系统抢键及双触发 |
| 设置 | 目标语言、Provider、API Key、Ollama Host/模型、站点禁用列表 |
| Side Panel 模块 | Translate 可用；Chat / Agent 仅占位；全页工作台与侧栏共用翻译 UI / `translateSession` |
| Side Panel 模型 | 翻译页顶部可切换 Provider + 当前模型；Key/Host 仍在 Options |
| Provider 文案 | 统一称 **「本地 Ollama」/「OpenAI 兼容」**，两处 UI 共用 `PROVIDER_OPTIONS` / `PROVIDER_HINT`（`shared/storage/types.ts`，与 `TARGET_LANGUAGES` 同处）。**不再使用单说「OpenAI」的标签**：`openai-compatible` 覆盖 DeepSeek / Groq / 中转 / 自建 `/v1` 等任意兼容端点，叫「OpenAI」会让用户以为只能填官方 API（尤其模型下拉出现 `deepseek-*` 时字面矛盾） |
| 划词浮层侧边栏 | 按钮为 **toggle**（开/收起）；扩展图标行为不改 |
| 划词目标语 | **跟随设置**：划词 / 快捷键翻译每次实时读取 `settings.targetLanguage`（与沉浸译 `start()` 一致，取实时值而非 content 启动快照）；当源文本**已是该目标语**时自动反向（中→英、英→中，仅 zh*/en 可可靠判定），避免「中文翻中文」。未显式指定的调用方（右键菜单等）仍走中英互切 `resolveAutoTargetLanguage`；Side Panel 手选语言仍优先 |

## 运行时补充（2026-10-06）

| 决策 | 结论 |
|------|------|
| 流式输出 | Provider 支持 `chatStream`（OpenAI 兼容 SSE）；UI 经 Port 收 chunk，可 Abort |
| 错误模型 | `shared/errors` 统一 ErrorCode + 用户文案；响应可带 `code` |
| LLM 入口 | Feature 经 `shared/llm/run.ts`；契约表见 `docs/features-v1.md` |
| 会话边界 | V1 仅 `translateSession` 当前会话；不做跨页历史 / 云同步 |
| 侧边栏打开 | `sidePanel.open()` 需用户手势：右键菜单必须**先同步开面板、再执行翻译**；面板打开失败不得覆盖译文结果 |
| 侧边栏 open 的手势窗口 | `open()` 前**不得插入额外 await**：网页点击的激活能经 `sendMessage` 传到 SW，但经不起第二次异步往返（如 `getContexts`）。浮层 toggle 因此用**同步** Port 连接态判断开关（`entrypoints/background.ts` `toggleSidePanel`），确保 `open()` 紧跟手势；否则抛 `may only be called in response to a user gesture`（回归见 `e2e/selection-panel-toggle.e2e.ts`） |
| 开发热更新 | WXT CS 变更默认会刷所有匹配 tab；DualMind 用 `softenDevTabReloads` 默认只刷活动标签（`WXT_DEV_RELOAD_TABS`） |

## 权限决策（2026-10-06）

- **`<all_urls>` 为有意保留**，且必须**同时**出现在两处，缺一不可：
  - `content_scripts.matches`：划词常驻注入，支撑「选中即自动显示」（`toolbarTrigger: 'auto'`）。去掉就得改 `activeTab` 按需注入，每页首次使用都需手势唤起，**丢失 auto 模式**。
  - `host_permissions`：BYOK 的 `OpenAICompatibleProvider` 请求用户自填的任意 Base URL；Background SW 跨域 `fetch` 必须持有该域 `host_permissions`，否则 `Failed to fetch`。**它不是冗余**。
- **代价**：安装时用户可见「读取并更改您在所有网站上的数据」。这是划词类扩展的品类固有成本，上架需在商店后台备好权限用途说明。
- **不采用的替代**：仅把 host `<all_urls>` 改为 `optional_host_permissions` 运行时申请 —— 因 `content_scripts.matches` 仍是 `<all_urls>`，**安装警告不变**，只多一处运行时失败点，收益极低。
- **权限收敛**：删除未使用的 `activeTab` / `scripting` 声明（代码中无 `executeScript` 等调用）。核对依据：`tabs.sendMessage` 只需目标页已有 content script，不需要 host 权限或 activeTab。

## 明确不做的事（避免范围膨胀）

- 不要在 V1 把翻译服务改成万能 God Object
- 不要在 Content Script 里存/读 API Key 或直连 LLM
- 不要默认开启强打扰悬浮球；站点可禁用
- Agent 级浏览器操作必须后置，且需强确认与独立权限说明

## V1 收官（2026-10-06）

**状态：功能冻结，仅修 bug。** 新能力（沉浸译 / Chat / Agent）进入 V1.5+，须先更新本文件与 `docs/features-v1.md`。

本地校验结果：

| 项目 | 结果 |
|------|------|
| `pnpm compile`（tsc --noEmit） | ✅ 通过 |
| `pnpm test`（Vitest） | ✅ 7 个文件 / 56 用例全通过 |
| `pnpm build` | 本次未跑（本机 `pnpm dev` 在运行，避免写入 `.output` 冲突） |
| `pnpm test:e2e` | 本次未跑（依赖真实本地 Ollama 及 `qwen-coder-8k:latest`） |
| Firefox | 未验证（Chrome / Edge 优先，脚本已备） |

边界说明：

- CI（`.github/workflows/ci.yml`）只跑 `compile` + `test`；E2E 需真实模型，**不进 CI**，本地手动执行。
- 上架权限 / 单一用途 / 数据使用说明见 [store-listing.md](./store-listing.md)。
- 文档漂移已修：`architecture-v1.md` 目录结构补齐 `shared/ui`、`shared/extensionPages.ts`、`shared/dev`。

## V1.5 沉浸式全文双语翻译（2026-10-06）

**范围**：在网页正文中做整页对照翻译，支持动态内容补译、展示模式切换、一键还原。
**不做**：PDF、跨页历史、云同步、Agent；Chat 仍占位。

| 决策 | 结论 |
|------|------|
| Feature 隔离 | 新建 `features/immersive/`；**不写 `translateSession`**，不复用 `translate:*` 消息，不动 `TranslateService` |
| 消息契约 | Port `dualmind-immersive`（批量 + 每批独立 `requestId` + abort）；`immersive:command` / `immersive:status` 由 Background 转发到**当前活动标签页**；偏好走 `immersive:prefs:get/save` |
| storage | 仅 `local:immersivePrefs`（展示模式、自动翻译开关）；**译文不落 storage**，只存在于页面 DOM |
| 默认行为 | **不自动翻译**；默认展示模式为**双语对照**（`translation-only` 可选）；入口为右下角悬浮按钮 / 右键「翻译整页」/ 侧栏控制区 |
| 渲染原则 | 只**追加兄弟节点**展示译文，不改写原文内容；「仅译文」通过源元素标记 + `<html>` 类名隐藏原文，撤销即还原（表格单元格保持双语） |
| 分段策略 | 块级容器下钻、行内内容聚合成段；跳过 script/style/pre/code/表单/媒体/`aria-hidden`/`contenteditable`/不可见元素；单次采集上限 500 段 |
| 批量与容错 | 单批 ≤12 段且 ≤1800 字符；并发上限 3；模型按 `[[n]]` 编号输出，解析缺段时**逐段补译**，避免整页失败 |
| 动态内容 | MutationObserver 防抖 500ms 增量补译，忽略自身注入节点；节点被框架回收时清理孤儿译文 |
| 权限 | **无需扩大**：沿用已有 `content_scripts.matches` / `host_permissions` `<all_urls>`；不引入 `scripting` / `activeTab` |
| 站点禁用 | 复用 `settings.disabledHosts`：命中则不注入划词浮层，也不挂载沉浸译入口 |

## V1.5 沉浸译 · 测试结论与已知缺陷（2026-10-06）

**验收结果**：`tsc` 通过；Vitest 10 文件 / 85 用例全通过；Playwright E2E **23/23**（沉浸译新增 2 条，含整页翻译 + 布局不变形 + 还原后 DOM 逐字节一致）。

### 已知缺陷 P0：译文回显（模型抄写）— 已修（2026-10-06）

**现象**：整页翻译后部分块的「译文」与原文完全一致，UI 仍报「翻译完成」。

**根因**（已用 curl 直连 Ollama 探针复现，非推测）：

| 场景 | 结果 |
|------|------|
| 纯英文 6 段 / 3 段 / 1 段批量 | 全部正确出中文（6/6、3/3、1/1） |
| EN+ZH+FR+ES+EN **混排**批量 | **仅第 1 段被翻译，其余原样回显** |

→ Prompt 本身无误；是 `qwen-coder-8k:latest`（`qwen2.5-coder:7b`，代码模型）在**多语混排批量**下会抄写输入，而 `features/immersive/translator.ts` 对解析结果**无回显校验**，直接把原文当译文渲染。

**处置（2026-10-06 已修）**：按下列方式落地，核心是「回显检测 + 单段兜底 + 未翻译标注」：

1. **回显检测 + 单段兜底**（核心）：新增 `features/immersive/validate.ts`，归一化（压缩空白）后比较译文与原文，一致即判回显；`translator.ts` 把「缺段 / 回显」统一交给逐段补译。单段补译仍回显或失败时标记 `untranslated: true`，**不再伪装成成功**。
2. **过滤已属目标语言的片段**：在 `features/translate/detectLang.ts` 新增 `isTargetLanguage`（仅 `zh*` / `en` 可可靠判定，其余保守返回 false），由 `controller.ts` 采集后过滤。既去掉诱发整批抄写的因素，也保证 `total` 与实际待译量一致。
3. **UI 明示未翻译**：`renderer.ts` 对 `untranslated` 片段改用琥珀色虚线块 + 「未翻译」角标并保留原文；`ImmersiveStatus` 新增 `untranslated` 计数，侧栏控制区显示「N 段未翻译」提示，悬浮按钮转琥珀色并在 title 标注。
4. 暂未下调 `MAX_SEGMENTS_PER_BATCH`（仍为 12）：回显已由检测兜底，不下调以免牺牲批量吞吐。
5. 模型建议：沉浸译推荐通用 instruct 模型；`*-coder` 类代码模型在多语混排批量下更易抄写。

### 本轮修复的测试侧缺陷（非产品逻辑）

| 缺陷 | 根因与修法 |
|------|------|
| 划词浮层 9 条用例全挂 | `seedSettings` 只写 `local:settings`，扩展首次读设置时迁移 `toolbar-default-shortcut-v1` 会把种子的 `toolbarTrigger: 'auto'` 改写成 `shortcut`，`shouldShowOnMouseUp` 恒 false。修法：seed 时一并写入 `local:migrations`，取值**由 `MIGRATION_IDS` 派生**（`Object.values`），新增迁移无需手工同步。 |
| Options「拉取模型」strict mode 冲突 | `getByRole('button', { name: '刷新列表' })` 宽松匹配命中了含同子串的下拉空态提示文案。修法：加 `exact: true`。 |

> 两处均经 `git stash` 回退到上一提交重跑验证为**既有回归**，与沉浸译改动无关。

### 本轮修复的产品缺陷：整页翻译误报「没有正文」（2026-10-06）

**现象**：在英文页面点「开始翻译」，侧栏与悬浮按钮报「当前页面没有可翻译的正文内容」；把目标语言改成中文重试**仍然报错**。

**根因（三重叠加，均以真实页面 + 扩展存储日志证实）**：

| # | 位置 | 问题 |
|---|------|------|
| 1 | `features/immersive/segmenter.ts` | `seen.add(el)` 写在「判定是否可译」之前：一次未产出片段的全页扫描会把所有遍历过的叶子永久标记，之后每次采集都直接跳过，恒返回 0 段（`WeakSet` 不会自行清除，只有刷新页面才恢复）。这是「改了语言重试仍失败」的直接原因 |
| 2 | `features/immersive/controller.ts` | 「页面真的没有正文」与「正文已是目标语言被过滤」共用同一文案，把排查引向错误方向 |
| 3 | `features/translate/ui/WorkbenchApp.tsx` | 侧栏语言选择器被 `translateSession.targetLanguage` 覆盖显示：该值是「上次实际使用的语言」（划词按中英互切自动推导），并非持久化设置。于是出现「下拉显示简体中文、而 `settings.targetLanguage` 其实是 `en`」的假象；用户再选同一项不触发 `onChange`，设置永远改不回去 |
| 4 | `entrypoints/options/App.tsx` | 草稿整对象 `settings:save`：Options 加载时的旧快照会把其他入口（侧栏改语言 / Provider）刚写入的值覆盖回去，是设置被反复写回 `en` 的来源 |

**修法**：

1. `segmenter.ts`：仅在**真正产出片段**时写入 `seen`。
2. `controller.ts`：采集改为 `collectForTranslation()`，同时回传未过滤量；0 段时按成因给出准确文案（`当前页面正文已是{语言}，无需翻译`），并在「采到片段但全被语言过滤」时**回退 `seen`**，让改完目标语言后能直接重试成功。
3. `WorkbenchApp.tsx`：语言选择器只反映持久化设置，会话语言不再覆盖显示值。
4. `options/App.tsx`：新增 `diffSettings()`，保存只提交相对基线的**增量字段**（嵌套对象只带变化子字段，Background 侧 `saveSettings` 浅合并）。

**回归护栏**：`features/immersive/segmenter.test.ts` 新增「未产出片段的元素不写入 `seen`」用例。

> 现象层面：该页正文全英文，目标语为 `en` 时 `isTargetLanguage` 会把所有片段判为「无需翻译」→ 0 段。实测该页可采到 **111** 段，故采集算法本身无问题。

**同类缺陷（同一类根因，一并修复）**：UI 把提示存进**本地 state**，只在「本视图内的操作」里清空。当新一轮翻译由**其他入口**（悬浮按钮 / 右键菜单 / 划词浮层）发起时，本视图收不到任何清空动作，上一轮的旧提示会永久挂着，甚至与正在进行的「翻译中 x/y」自相矛盾。

| 位置 | 问题 | 修法 |
|------|------|------|
| `features/immersive/ui/ImmersiveControl.tsx` | 本地 `error` 仅由 `runCommand` 清空；轮询 `refresh()` 只更新 status，不清本地 error | `refresh()` 成功取到状态后 `setError('')`，提示以权威的 `status.error` 为准 |
| `features/translate/ui/WorkbenchApp.tsx` | `refresh()` 只在 `sess.error` 存在时 `setError`，从不清除 | 改为 `setError(sess.error ?? '')`，让 `translateSession` 成为错误态的唯一权威来源 |

**「部分失败」提示已修（2026-10-06）**：`features/immersive/controller.ts` 原先在某一批失败时 `this.error = message` 后继续处理后续批次且不再清除 —— 后续批次成功、整页翻完，错误文案仍会永久留在面板与悬浮按钮上。现改为按**失败片段集合**（`failedIds`）记账，`error` 统一由 `refreshFailure()` 刷新：

| 情形 | 行为 |
|------|------|
| 某批失败 | 「有 N 段翻译失败：原因」，如实保留，不被后续成功批次掩盖 |
| 全部失败片段补译成功 | 自动清空（成功批次会把这些 id 从 `failedIds` 移除） |
| 下一次 `start()` / `stop()` | 清空 |

护栏：`features/immersive/controller.test.ts` 覆盖上述四条路径（部分失败如实计数、全成功为空、`stop()` 清除、补译成功后自动消失）。

### 本地 E2E 运行须知

- E2E **不进 CI**，依赖真实本地 Ollama + `wxt build` 产物；**必须先重新构建**，否则跑的是旧产物。
- **默认无头**（`pnpm test:e2e`）：无头下通过 `channel: 'chromium'` 走完整 Chromium 的新无头模式，否则默认的 headless shell 不支持 `--load-extension`。
- **需要观察界面 / 真实 Side Panel** 时用 `pnpm test:e2e:headed`（即 `E2E_HEADED=1`）。真实 `sidePanel.open()` 依赖窗口侧边 UI，无头下不产生 SIDE_PANEL 上下文，故 `e2e/selection-panel-toggle.e2e.ts` 的首个用例仅在 `E2E_HEADED=1` 时执行，否则自动 skip。
- 沙箱化 shell 需 `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=mac-arm64`（沙箱把 `os.arch()` 报成 x64，且 Chromium 因 `xattr` 受限会 SIGABRT）；用户自建终端不需要。

## V1.5 封板 · 测试补充与验收快照（2026-10-07）

**背景**：V1.5 功能已落地（见上节），但自动化覆盖滞后——沉浸译只覆盖「整页翻译 + 还原」，「展示模式 / 动态补译 / 指令入口 / 未翻译标注」以及全页工作台、复制、错误态均无护栏。本节记录封板前补齐的测试、修掉的阻塞项与最终验收结果。

> 上方「V1 收官」与「V1.5 测试结论」中的计数是**当时的历史快照**，不改写；封板以本节为准。

### 本次新增 / 扩展的测试

| 文件 | 类型 | 覆盖 |
|------|------|------|
| `features/immersive/renderer.test.ts` | 新增（9） | 双语追加兄弟节点 + 源标记、幂等更新、表格单元格插入内部且不隐藏、「仅译文」`<html>` 类名切换、未翻译角标与计数、未翻译→已翻译、孤儿清理、`clear()` 还原、样式只注入一次 |
| `features/immersive/dom.test.ts` | 新增（8） | FAB 状态机：idle / error / running / active / warning 的文案与 `data-state`、优先级、状态切换不残留 |
| `entrypoints/options/diff.ts` | 新增 | 从 `App.tsx` 抽出 `diffSettings` / `parseHosts`（纯逻辑，脱离 React/DOM 才可单测） |
| `entrypoints/options/diff.test.ts` | 新增（10） | 空补丁、单字段、嵌套只带变化子字段、禁用站点比对、`parseHosts` 解析 |
| `features/immersive/controller.test.ts` | 扩展（+2） | 已激活时 `start(mode)` 只切模式不重译；未激活时按指定模式开始 |
| `e2e/workspace.e2e.ts` | 新增（2） | 全页工作台翻译 + 复制按钮启用态；Chat / Agent 占位且无实际能力 |
| `e2e/immersive.e2e.ts` | 扩展（+3） | 偏好「仅译文」（隐藏原文 + 偏好落盘）、动态内容自动补译、`content:immersive-command` 指令入口 |
| `e2e/sidepanel.e2e.ts` | 扩展（+2） | 空输入提前返回不请求、Ollama 不可达给出可读错误 |

**测试侧缺陷与阻塞项（本次修，均非产品逻辑）**

1. **`pnpm compile` 阻塞**：`browser.runtime.getURL('wordmark.svg')` 缺前导斜杠 → `TS2769`（`entrypoints/options/App.tsx`、`features/translate/ui/WorkbenchApp.tsx` 两处；HEAD 即存在）。改为 `getURL('/wordmark.svg')` 后 `compile` 归零。
2. **过期断言（既有回归）**：`e2e/sidepanel-language.e2e.ts` 断言「语言选择器随划词互切变化」，与既定改动「划词目标语**按次写 `translateSession`、不回写 settings**，选择器只反映持久化设置」相矛盾。经 `git stash` 回退到 HEAD **复现确认**（非本次引入）。改为断言权威契约 `translateSession.targetLanguage`，并补一条「三次互切后选择器仍为持久化值」防污染断言。
3. **新增用例的标签页选择**：持久化 context 会先开一个空白标签，`tabs.query` 用「排除自身」会误选到它（报 `Receiving end does not exist`），改为按 URL（`example.com`）锁定内容页。

### 验收结果（2026-10-07）

| 项目 | 结果 |
|------|------|
| `pnpm compile`（tsc --noEmit） | ✅ 通过（0 错误） |
| `pnpm test`（Vitest） | ✅ **16 文件 / 137 用例**全通过 |
| `pnpm build`（wxt build） | ✅ 通过（本轮为跑 E2E 构建，dev 写 `chrome-mv3-dev`，互不冲突） |
| `pnpm test:e2e`（无头） | ✅ **29 passed / 1 skipped**（30 条；skip 为需要真实窗口的真实侧栏用例） |
| `pnpm test:e2e:headed`（真实侧栏 2 条） | ✅ 2/2 通过（`e2e/selection-panel-toggle.e2e.ts`，含无头下被 skip 的真实 `sidePanel.open()` 用例） |
| `pnpm zip` / 提审 | ⏸ 未做（发布与全量验证按既定节奏后置到 V3 完成后统一执行） |
| Firefox | ⏸ 未验证（Chrome / Edge 优先） |

### 封板后仍存在的已知覆盖缺口

- **真实右键菜单**：`contextMenus` 的原生右键无法被 Playwright 点击；已用同款 `content:immersive-command` 消息覆盖内容脚本侧，但 Background 的「当前活动标签页」查找仍是盲区，需手工验证。
- **无头下侧栏「沉浸翻译」控制区**：`immersive:command` 依赖 `tabs.query({active:true})`，无头多标签下不可靠，需 `pnpm test:e2e:headed` 或手工验证。
- **真实复杂布局**：布局用例是注入式 fixture，Grid/Flex 卡片流、粘性表头、站点样式冲突未覆盖。
- **复制译文 → 「已复制」提示**：剪贴板在无头下不稳定，未自动化（工作台用例已断言复制按钮的启用/禁用态）。
- **`renderFab` 的 error 与 untranslated 同时存在时**：`data-state` 取 error、但 `title` 优先显示未翻译段数（错误原因只在侧栏可见）；已按现状锁定断言，若调整优先级需同步更新 `dom.test.ts`。
