# DualMind 上架材料（首轮 Chrome）

> 用于 Chrome Web Store / Edge Add-ons 提交表单中的「权限用途」「单一用途」「数据使用」等字段。
> **首轮仅提交 Chrome**；Edge 延后（见 [decisions.md](./decisions.md)「V3.0 正式版发布范围裁剪」），Edge 的同类字段可直接复用本文件英文版。
> 与 [docs/decisions.md](./decisions.md)（当前权威 · V3 已立项）保持一致；改权限前先改本文件。
> 注：商店后台多数字段要求英文，文末附英文版可直接粘贴。
> 修订记录：2026-10-08 按 V3 口径补齐**阅读助手 / 可选本页 Agent**、**本地聊天历史**与 **DOM 写操作**披露，并修正「Key 不上传任何服务器」「页面信息不外发」等绝对声明（对应 REL-06 / REL-07）。
> 修订记录：2026-10-08（三）**已发布公开隐私政策**（[PRIVACY.md](../PRIVACY.md)，中英双语）与**支持入口**（GitHub Issues），对应 REL-08；下文「数据使用」字段与该政策口径一致，**提交当日须以最终包为准再核验一次**。
> 修订记录：2026-10-08（二）**首轮仅提交 Chrome**（Edge 延后，见 [decisions.md](./decisions.md)「V3.0 正式版发布范围裁剪」）；并**修正 Agent 默认状态的事实描述** —— 代码默认为启用（`agentPrefs.enabled = true`，`shared/storage/types.ts`），故不再宣称「默认关闭」，改为「安装后可用，但不会自动启动任务」。

## 单一用途（Single purpose）

在网页中提供基于用户自带模型（BYOK）的三类能力，帮助用户理解与操作当前网页：
① **划词翻译 / 整页沉浸式双语翻译**与侧边栏翻译工作台；
② **只读的阅读助手**（整页摘要、针对当前页的问答）；
③ **可选**的本页操作 Agent（在用户逐次批准下对**当前网页**执行有限 DOM 操作）。
阅读助手保持只读；Agent 的每个任务都必须由用户在页面上**显式发起**，且步骤计划必须经用户批准后才执行（安装后 Agent 即可用，但不会自动启动任何任务）。

## 权限用途说明

| 权限 | 类型 | 用途 | 不使用的场景 |
|------|------|------|--------------|
| `storage` | 权限 | 保存扩展设置（Provider、模型、目标语言、站点禁用列表、Agent 偏好）、**当前一次**翻译会话，以及**仅存于本机**的聊天 / 会话历史（供恢复、导出、删除） | 不用于任何云端同步；开发者不接收；用户可随时清空 |
| `sidePanel` | 权限 | 打开侧边栏翻译工作台 / 阅读助手 / Agent 面板 | — |
| `contextMenus` | 权限 | 提供右键菜单「用 DualMind 翻译」（选中文本）与「用 DualMind 翻译整页」 | — |
| `commands`（Alt/Option+K） | 快捷键 | 对当前选中文本触发划词翻译（默认「仅快捷键」触发） | 不在页面内硬编码监听按键 |
| `content_scripts.matches: <all_urls>` | 内容脚本 | 注入划词工具栏、页面悬浮入口（含「沉浸译」「总结本页」「请 Agent 操作本页」）与 Agent 的 DOM 操作通道；读取当前选区、页面正文，以及在用户发起 Agent 任务时所需的页面元素快照（表单值等可能包含在内） | **不持有 API Key、不直连模型**（模型调用一律由 Background 发起）；Agent 仅在用户开启并经逐次批准后操作**当前页** |
| `host_permissions: <all_urls>` | 主机权限 | 用户在设置中填入**任意** OpenAI 兼容 Base URL 后，由 Background 跨域 `fetch` 调用该端点 | 除用户显式配置的端点外，不外发任何数据 |
| `host_permissions: 127.0.0.1 / localhost :11434` | 主机权限 | 访问用户本机运行的 Ollama 服务，实现本地模型翻译 | 请求仅发往本机回环地址 |

## 数据传输说明（Data usage）

- **BYOK 直连**：翻译文本、摘要 / 问答上下文，以及 Agent 任务的工具结果，仅从 Background Service Worker 直接发送到**用户自己配置**的模型端点（自建 OpenAI 兼容服务或本机 Ollama）。DualMind **没有自有后端**，不中转、不存储用户文本。
- **API Key**：仅保存在浏览器本地 `storage`，只由 Background 读取，并**仅用于向用户所配置的 Provider 发送认证请求**（即 Key 会作为该端点的认证凭据发出，但不会发往任何其他第三方）；**不会**注入到网页 Content Script。
- **本页操作 Agent（可选）**：每个任务都必须由用户**显式发起**，且步骤计划必须经用户批准后才执行（安装后即可用，但不会自动启动任务）；提交表单、导航至敏感域、删除类等**危险动作**在执行前二次确认，随时可停止。**支付 / 下单 / 转账等资金类动作直接拒绝**，不执行、也无法通过确认放行。仅在**当前内容页**操作，**不跨标签页**，不使用 debugger / CDP；对 Shadow DOM / 跨域 iframe / 严格 CSP 下的部分元素可能无法操作（会给出可读失败）。用户可在设置中关闭该能力。
- **本地历史**：聊天与会话历史仅存于本机扩展存储，支持单条删除与全部清空；Agent 任务的运行态**不持久化**（关闭或重启后不恢复、不重放页面操作）。
- **不采集**：不做浏览历史、个人身份信息的收集或分析；无遥测 / 埋点。
- **无远程代码**：所有逻辑随包发布，运行时仅从用户配置的 API 端点获取文本结果，不加载远程可执行代码。

## 商店表单常见字段速查

- **Remote code（是否使用远程代码）**：否
- **Data collection（是否收集用户数据）**：否（仅在本机/用户端点间传输，开发者不接收）
- **Host permission justification**：见上表两行 `host_permissions`
- **Content script justification**：划词 / 沉浸译需常驻读取用户选区与页面正文；可选 Agent 需在用户批准后对当前页执行 DOM 操作
- **Privacy policy URL（隐私政策）**：<https://github.com/zhengzhp/DualMind/blob/main/PRIVACY.md>
- **Support URL（支持入口）**：<https://github.com/zhengzhp/DualMind/issues>

---

## English（可直接粘贴）

**Single purpose**

Provide three user-configured (BYOK) capabilities on web pages:
(1) instant translation of selected text and immersive full-page bilingual translation, plus a
translation workbench in the side panel;
(2) a read-only reading assistant (page summary and Q&A about the current page);
(3) an **optional** on-page agent that performs limited DOM actions on the current page, only after
the user explicitly starts a task and approves its plan (the agent is available out of the box but
never starts a task on its own).

**Permission justifications**

- `storage` — Persist extension settings (provider, model, target language, disabled-site list,
  agent preferences), the current translation session, and locally stored chat/session history
  (for restore, export, and deletion). No cloud sync; the developer does not receive it.
- `sidePanel` — Host the translation workbench, reading assistant, and agent panel in the browser side panel.
- `contextMenus` — Add "Translate with DualMind" (selection) and "Translate full page with DualMind" right-click menu items.
- `commands` (Alt/Option+K) — Trigger translation for the current selection (hotkey-only by default).
- `content_scripts.matches: <all_urls>` — Inject the selection toolbar, the page entry point
  (immersive translation, summarize, "Ask the agent to operate this page"), and the agent's DOM
  action channel. The script reads the current selection, the page's visible text, and — only when
  the user starts an agent task — a snapshot of the required page elements (which may include form
  values). It never holds the API key and never calls the model directly; all model calls are made by
  the background service worker. The agent acts on the current page only, after explicit opt-in and
  per-task approval.
- `host_permissions: <all_urls>` — The extension must `fetch` any user-provided OpenAI-compatible
  Base URL from the background service worker to perform translation. No data is sent anywhere
  except the endpoint the user explicitly configured.
- `host_permissions: 127.0.0.1 / localhost :11434` — Talk to the user's locally running Ollama
  server for on-device translation.

**Data usage**

No developer-operated backend. Selected text, summary/Q&A context, and agent tool results are sent
only from the background worker directly to the user-configured model endpoint (their own
OpenAI-compatible server or local Ollama). API keys stay in local extension storage, are read only by
the background worker, and are used solely to authenticate requests to the provider the user
configured — never sent to any other third party, and never injected into content scripts.
The optional on-page agent never starts a task on its own: every task must be explicitly started by
the user and its plan approved before execution, and dangerous actions (form submission, navigation
to sensitive domains, deletion, etc.) require a second confirmation. Payment, ordering, and
money-transfer actions are refused outright — they are never executed and cannot be approved. It
operates on the current page only, never spans tabs, and never uses debugger/CDP. The user can turn
this capability off in settings. Chat and session history are stored locally and can be deleted.
Agent task state is not
persisted (no replay of page actions after restart). No telemetry, no browsing-history or page-content
collection. No remote code.

**Remote code** — No.
