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
| 划词工具栏 | 可配置：自动显示 / 仅快捷键（默认 Alt+Shift+K，可在 chrome://extensions/shortcuts 改键） |
| 浮层关闭 | 统一走 `closeToolbar`：关闭按钮 / 外部点击 / Esc 均收起；有译文不再「钉住」，选区塌陷兜底收起 |
| 浮层定位 | `@floating-ui/dom` 虚拟元素（选区矩形）跟随，滚动/缩放自动重算并做边缘翻转与越界平移 |
| 划词快捷键通道 | 仅 `chrome.commands` → Background → Content；不在 Content 硬编码 keydown，避免与浏览器/系统抢键及双触发 |
| 设置 | 目标语言、Provider、API Key、Ollama Host/模型、站点禁用列表 |
| Side Panel 模块 | Translate 可用；Chat / Agent 仅占位 |
| Side Panel 模型 | 翻译页顶部可切换 Provider + 当前模型；Key/Host 仍在 Options |

## 运行时补充（2026-10-06）

| 决策 | 结论 |
|------|------|
| 流式输出 | Provider 支持 `chatStream`（OpenAI 兼容 SSE）；UI 经 Port 收 chunk，可 Abort |
| 错误模型 | `shared/errors` 统一 ErrorCode + 用户文案；响应可带 `code` |
| LLM 入口 | Feature 经 `shared/llm/run.ts`；契约表见 `docs/features.md` |
| 会话边界 | V1 仅 `translateSession` 当前会话；不做跨页历史 / 云同步 |

## 明确不做的事（避免范围膨胀）

- 不要在 V1 把翻译服务改成万能 God Object
- 不要在 Content Script 里存/读 API Key 或直连 LLM
- 不要默认开启强打扰悬浮球；站点可禁用
- Agent 级浏览器操作必须后置，且需强确认与独立权限说明
