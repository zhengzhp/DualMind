# DualMind 上架材料（Chrome / Edge）

> 用于 Chrome Web Store / Edge Add-ons 提交表单中的「权限用途」「单一用途」「数据使用」等字段。
> 与 [docs/decisions-v1.md](./decisions-v1.md)「权限决策」保持一致；改权限前先改本文件。
> 注：商店后台多数字段要求英文，文末附英文版可直接粘贴。

## 单一用途（Single purpose）

在网页中提供基于用户自带模型（BYOK）的**划词翻译**、**整页沉浸式双语翻译**与翻译工作台，帮助用户即时理解外语内容。

## 权限用途说明

| 权限 | 类型 | 用途 | 不使用的场景 |
|------|------|------|--------------|
| `storage` | 权限 | 保存扩展设置（Provider、模型、目标语言、站点禁用列表）与**当前一次**翻译会话；供界面恢复状态 | 不用于任何云端同步、不收集历史 |
| `sidePanel` | 权限 | 打开侧边栏翻译工作台 | — |
| `contextMenus` | 权限 | 提供右键菜单「用 DualMind 翻译」（选中文本）与「用 DualMind 翻译整页」 | — |
| `commands`（Alt/Option+K） | 快捷键 | 对当前选中文本触发划词翻译（默认「仅快捷键」触发） | 不在页面内硬编码监听按键 |
| `content_scripts.matches: <all_urls>` | 内容脚本 | 注入划词工具栏与页面悬浮入口（含「沉浸译」「总结本页」），支撑「选中后自动显示」、整页翻译与一键摘要 | 脚本仅读取**当前选区**与页面正文文本用于翻译 / 摘要，不采集其它信息、不外发 |
| `host_permissions: <all_urls>` | 主机权限 | 用户在设置中填入**任意** OpenAI 兼容 Base URL 后，由 Background 跨域 `fetch` 调用该端点 | 除用户显式配置的端点外，不外发任何数据 |
| `host_permissions: 127.0.0.1 / localhost :11434` | 主机权限 | 访问用户本机运行的 Ollama 服务，实现本地模型翻译 | 请求仅发往本机回环地址 |

## 数据传输说明（Data usage）

- **BYOK 直连**：翻译文本仅从 Background Service Worker 直接发送到**用户自己配置**的模型端点（自建 OpenAI 兼容服务或本机 Ollama）。DualMind **没有自有后端**，不中转、不存储用户文本。
- **API Key**：仅保存在浏览器本地 `storage`，只由 Background 读取用于发起请求；**不会**注入到网页 Content Script，也不会上传到任何服务器。
- **不采集**：不做浏览历史、页面内容、个人身份信息的收集或分析；无遥测/埋点。
- **无远程代码**：所有逻辑随包发布，运行时仅从用户配置的 API 端点获取文本结果，不加载远程可执行代码。

## 商店表单常见字段速查

- **Remote code（是否使用远程代码）**：否
- **Data collection（是否收集用户数据）**：否（仅在本机/用户端点间传输，开发者不接收）
- **Host permission justification**：见上表两行 `host_permissions`
- **Content script justification**：划词翻译需常驻读取用户选区

---

## English（可直接粘贴）

**Single purpose**

Provide instant, user-configured (BYOK) translation of selected text on web pages and of
full page content (immersive in-page bilingual translation), plus a translation workbench
in the side panel.

**Permission justifications**

- `storage` — Persist extension settings (provider, model, target language, disabled-site list)
  and the current translation session. No cloud sync, no history collection.
- `sidePanel` — Host the translation workbench in the browser side panel.
- `contextMenus` — Add "Translate with DualMind" (selection) and "Translate full page with DualMind" right-click menu items.
- `commands` (Alt/Option+K) — Trigger translation for the current selection (hotkey-only by default).
- `content_scripts.matches: <all_urls>` — Inject the selection toolbar and the immersive
  full-page translation entry point. The script only reads the user's current selection and
  the page's visible body text for translation; nothing else is collected or sent.
- `host_permissions: <all_urls>` — The extension must `fetch` any user-provided OpenAI-compatible
  Base URL from the background service worker to perform translation. No data is sent anywhere
  except the endpoint the user explicitly configured.
- `host_permissions: 127.0.0.1 / localhost :11434` — Talk to the user's locally running Ollama
  server for on-device translation.

**Data usage**

No developer-operated backend. Selected text is sent only from the background worker directly to
the user-configured model endpoint (their own OpenAI-compatible server or local Ollama). API keys
stay in local extension storage and are never injected into content scripts. No telemetry, no
browsing-history or page-content collection. No remote code.

**Remote code** — No.
