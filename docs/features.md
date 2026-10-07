# DualMind Feature 契约表 · 当前版本（V2 · 已封板）

> 生效版本：**V2（摘要 / 聊天，已封板）**——功能冻结，仅修 bug。  
> V1 / V1.5 契约见 [features-v1.md](./features-v1.md)。  
> 代理入口见 [AGENTS.md](../AGENTS.md)。  
> 封板快照见 [decisions.md](./decisions.md)「V2 封板 · 验收快照」。

## V2 会话边界（摘要 / 聊天）

- **chatSessions**（`local:chatSessions`）：**全局**会话列表，每条含 `pageUrl` / `pageTitle` / `messages` / `updatedAt` / 可选 `allowCrossPage`（用户已确认本会话继续用当前页，不再做来源一致性检查）；上限 **50 会话 / 每会话 200 条**，超限淘汰最旧
- **chatPrefs**（`local:chatPrefs`）：上下文范围（选区 / 当前页正文）等偏好
- 页面正文**不写 storage**：仅随已发送消息保存上下文片段 / 引用
- **禁止**复用 `translateSession` / `translate:*`：聊天属独立 feature，见下表

## V2 Feature 一览

| Feature | 目录 | 入口消息 / Port | 写入 storage | UI 入口 | 状态 |
|---------|------|-----------------|--------------|---------|------|
| chat | `features/chat/` | `chat:*`：`chat:prefs:get/save`、`chat:sessions:list/get/upsert/delete/clear`、`chat:context`（BG 经 `resolveContentTab` 转发内容脚本提取正文 / 选区）、`chat:page-info`（同解析取内容页地址 / 标题，用于会话来源一致性确认；工作台前台可回退最近可读页）、`chat:summarize-page`（页面悬浮入口「总结本页」，BG 手势期内 `sidePanel.open()` + 写信箱）；Port `dualmind-chat`（`start` / `abort`，流式） | `local:chatSessions`（全局会话，上限 50 会话 / 200 条，超限淘汰最旧）、`local:chatPrefs`（`contextScope` / `maxContextChars`）、`local:chatPending`（右键菜单信箱，消费即清空，TTL 30s）；正文不落 storage | Side Panel / 全页工作台「网页助手」Tab（`ChatPanel` + `SessionList`，展示「绑定页」；历史支持单条 / 全部导出 Markdown）、页面悬浮入口「总结本页」、右键菜单「用 DualMind 总结本页」（仅 `contexts: ['page']`，`disabledHosts` 站点置灰） | V2 已封板 |

> 页面悬浮入口 `features/page-fab/` **不是独立 Feature**：无消息前缀（动作要么直连本页 controller，要么复用既有 `chat:*` / `immersive:*`），只写 `local:pageFabPos`（落点，全局共享）；隐藏操作经 `settings:save` 写 `settings.pageFab*`。它是内容脚本侧的**共享 UI 壳**：沉浸译与网页总结在挂载时 `registerAction` 注册动作，新增能力不改入口壳。交互与架构决策见 [decisions.md](./decisions.md)「V2 页面悬浮入口」与「V2 悬浮入口 · 开关与粒度」。

> **入口的显隐有两条互不等价的路径**（别混用）：`settings.disabledHosts` 命中 → 内容脚本**整体不注入**（划词 + 入口 + 整页翻译全无）；`settings.pageFabEnabled === false` 或 `settings.pageFabHiddenHosts` 命中 → **只不挂载入口壳**，划词 / 整页翻译 / 右键菜单照常。判定分别走 `isHostDisabled` / `shouldShowPageFab`（`shared/siteAccess.ts`）。注意 `mountImmersive` 除注册入口动作外还承担右键「翻译整页」与自动翻译的监听，因此入口隐藏时**仍须挂载**（`fab` 参数可选）。

> 共享提取层 `features/page-content/` **不是独立 Feature**：无消息前缀、不写 storage，被 `chat` 与 `immersive` 共同引用（`segmenter` 语义采集 / `budget` 字符预算截断）。

V1 / V1.5 既有 Feature（`translate` / `selection-toolbar` / `immersive`）见 [features-v1.md](./features-v1.md)。
全页工作台（`entrypoints/workspace/`）不是独立 Feature：无新消息前缀，UI 复用 `features/translate/ui`，与 Side Panel 共用 `translateSession`。
Provider / 模型选择器（`features/translate/ui/ModelSelector.tsx`）为 header 之下、模块 Tab 之上的**常驻单行醒目横栏**（独立品牌色色带 + 图标刷新），翻译 / 网页助手 / Agent 各 Tab 共享；横栏以「当前使用」品牌色胶囊提示正在生效的模型，模型触发器用 `SearchableSelect` 的 `emphasis` 强调态（加粗品牌色边框 + 浅底 + 半粗字重），只放「模型 + 刷新」以把宽度让给模型名，**Provider 切换收在模型下拉面板顶部**（低频操作，经 `SearchableSelect` 的 `panelHeader` 插槽注入）；切换即时持久化到同一 BYOK 设置。

模型名会按厂商识别并加品牌图标：解析逻辑在 `shared/ui/modelIcons.ts`（`detectModelVendorId` / `getModelIconUrl` / `toModelOptions`，纯函数 + 单测），图标资源在 `public/model-icons/*.svg`，来源为开源图标集 [`@lobehub/icons-static-svg`](https://github.com/lobehub/lobe-icons)（有 `-color` 变体时优先取品牌色版本）。当前选中值与下拉候选都会显示图标；识别不出厂商时不显示（不猜）。工作台横栏与 Options 页的模型下拉共用同一逻辑。

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
