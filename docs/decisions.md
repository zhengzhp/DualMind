# DualMind 决策记录（本次对话）

> 日期：2026-10-06  
> 来源：V1 架构规划与落地对话  
> 代理入口与 Always / Ask / Never 见仓库根目录 [AGENTS.md](../AGENTS.md)

## 产品决策

| 决策 | 结论 |
|------|------|
| 首发能力 | 翻译（划词 + Side Panel + 设置） |
| 参考竞品 | Monica：分层入口；不照搬 All-in-One / 重度自动化 |
| V1 不做 | 网页沉浸式全文双语、PDF 对照、自有后端、Browser Operator |
| 主入口 | Side Panel（点击扩展图标打开）；弱化 Popup |
| 后续路线 | V1.5 沉浸译 → V2 摘要/聊天 → V3 浏览器 Agent（独立 feature） |

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
| 划词工具栏 | **默认「仅快捷键」**（Ctrl/⌘+Shift+K）；可改为「选中后自动显示」。快捷键可在 chrome://extensions/shortcuts 改键 |
| 浮层关闭 | 统一走 `closeToolbar`：关闭按钮 / 外部点击 / Esc 均收起；有译文不再「钉住」，选区塌陷兜底收起 |
| 浮层定位 | `@floating-ui/dom` 虚拟元素（选区矩形）跟随，滚动/缩放自动重算并做边缘翻转与越界平移 |
| 划词快捷键通道 | 仅 `chrome.commands` → Background → Content；不在 Content 硬编码 keydown，避免与浏览器/系统抢键及双触发 |
| 设置 | 目标语言、Provider、API Key、Ollama Host/模型、站点禁用列表 |
| Side Panel 模块 | Translate 可用；Chat / Agent 仅占位 |
| Side Panel 模型 | 翻译页顶部可切换 Provider + 当前模型；Key/Host 仍在 Options |
| 划词浮层侧边栏 | 按钮为 **toggle**（开/收起）；扩展图标行为不改 |
| 划词目标语 | 未显式指定时中英互切：英→中、中→英、**混排→中**；Side Panel 手选语言仍优先 |

## 运行时补充（2026-10-06）

| 决策 | 结论 |
|------|------|
| 流式输出 | Provider 支持 `chatStream`（OpenAI 兼容 SSE）；UI 经 Port 收 chunk，可 Abort |
| 错误模型 | `shared/errors` 统一 ErrorCode + 用户文案；响应可带 `code` |
| LLM 入口 | Feature 经 `shared/llm/run.ts`；契约表见 `docs/features.md` |
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
