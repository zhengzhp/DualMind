# DualMind v1.1.0 · Chrome Web Store 提交包

> 用途：把本文件当作提交表单的复制粘贴底稿。**最后一步「上传 zip + 提交审核」需要在你的 Chrome Web Store 开发者账号下完成**——本助手没有该账号的登录态，也不会索取凭据。
> 配套：[store-listing.md](./store-listing.md)（完整中英文案）、[PRIVACY.md](../PRIVACY.md)、[store-screenshots.md](./store-screenshots.md)。

## 1. 提交产物

| 项 | 值 |
|----|-----|
| 版本 | 1.1.0 |
| 提交包 | ~/DualMind-releases/dualmind-1.1.0-chrome.zip |
| 大小 | **496,970 B** |
| sha256 | 6ed0792da0927da6561e744f3c727e4f21d3ae9a61c993b72f479714a1e41dd3 |
| 源码标识 | 0d67c98（0d67c9897b944dcef4dda8077ddf8ecfca6998ab） |
| manifest | MV3；storage / sidePanel / contextMenus；无 debugger / scripting / tabs / activeTab / downloads |
| 最低 Chrome | 114 |

> 提交后不要再 rebuild / 重打包；若必须改代码，升 patch 版本并重走验证与截图。

## 2. Store listing 字段

| 字段 | 值 |
|------|-----|
| Item name | DualMind |
| Category | Productivity |
| Default language | 中文（简体）；另加 English (United States) 本地化 |
| Homepage | https://github.com/zhengzhp/DualMind |
| Support URL | https://github.com/zhengzhp/DualMind/issues |
| Privacy policy URL | https://github.com/zhengzhp/DualMind/blob/main/PRIVACY.md |
| Pricing | Free |
| Distribution | Public；所有地区；无付费 / 内购 |
| Mature content | No |

### 2.1 Summary（短描述，≤132 字符）

**English（114 字符）**

    Translate, summarize, and let a BYOK agent operate the current page — with plan approval and danger confirmations.

**中文（42 字）**

    划词与整页翻译、阅读助手摘要问答，以及逐次批准的本页操作 Agent；模型由你提供。

### 2.2 Detailed description（English）

    DualMind is a bring-your-own-model browser assistant that works on the page you are reading.

    TRANSLATE
    - Select text and press Alt/Option+K for an instant, streaming translation.
    - Translate a whole page into a bilingual side-by-side view and restore it at any time.
    - Use the side panel or the full-page workbench for long text.

    READ (READ-ONLY)
    - Summarize the current page and ask follow-up questions about it.
    - The reading assistant never modifies the page.
    - Chat and session history stay on your device and can be deleted.

    ACT ON THE PAGE (OPTIONAL AGENT)
    - Optionally let a model operate the current page: fill forms, click, scroll, filter, and extract text.
    - Every task must be explicitly started by you, and its step plan must be approved before execution.
    - Dangerous actions (submit, delete, navigation to sensitive domains) require a second confirmation.
    - Payment, ordering, and money-transfer actions are refused outright.
    - Works only on the current page, never across tabs, and never uses debugger/CDP.
    - Export the run record as Markdown; export the result table as CSV when the result contains a table.

    YOUR MODEL, YOUR DATA
    - Bring your own OpenAI-compatible endpoint, or run a local Ollama model.
    - No developer-operated backend, no telemetry, no remote code.
    - Page text is sent only to the endpoint you configure.
    - API keys stay in local extension storage and are read only by the background worker.

    REQUIREMENTS
    - Chrome 114 or newer.
    - A tool-calling model is required for the optional on-page agent.
    - Some pages (Shadow DOM, cross-origin iframes, strict CSP) may not be operable; failures are reported.

    Known limitations: agent runtime state is not persisted; CSV export appears only when the result contains a table.

### 2.3 Detailed description（中文）

    DualMind 是一个「自带模型（BYOK）」的浏览器助手，只在你正在阅读的这一页工作。

    翻译
    - 选中文字按 Alt/Option+K，即时流式翻译。
    - 整页双语对照，可一键还原。
    - 侧栏 / 全页工作台适合长文翻译。

    阅读助手（只读）
    - 总结当前页要点，并就这一页继续提问。
    - 全程不修改页面。
    - 会话历史只存本机，可单条删除或全部清空。

    本页 Agent（可选）
    - 在逐次批准下操作当前页：填表、点击、滚动、筛选、提取文字。
    - 每个任务必须由你显式发起，步骤计划必须经你批准。
    - 提交 / 删除 / 敏感跳转等危险动作需二次确认；支付、下单、转账一律拒绝。
    - 只在当前页工作，不跨标签页，不使用 debugger / CDP。
    - 执行记录可导出 Markdown；结果含表格时可导出 CSV。

    你的模型，你的数据
    - 可接任意 OpenAI 兼容端点，或本机 Ollama。
    - 无自有后端、无遥测、无远程代码。
    - 页面文本只发送到你配置的端点。
    - API Key 仅存本机，只由后台读取。

    要求
    - Chrome 114+。
    - 本页 Agent 需要支持 tool calling 的模型。
    - Shadow DOM / 跨域 iframe / 严格 CSP 下的部分元素可能无法操作，会给出可读失败。

    已知限制：Agent 运行态不持久化；仅当结果含表格时出现 CSV 导出。

## 3. 截图与宣传图

按顺序上传（均 1280×800）：

| # | 文件 | 建议英文说明 | 中文口径 |
|---|------|--------------|----------|
| 1 | docs/assets/store/01-selection-toolbar.png | Select text to translate instantly. | 划词即译 |
| 2 | docs/assets/store/02-immersive-fullpage.png | Bilingual full-page reading. | 整页双语对照 |
| 3 | docs/assets/store/03-workbench-translate.png | A workbench for long-form translation. | 长文翻译工作台 |
| 4 | docs/assets/store/04-reading-assistant.png | Read-only summary and Q&A. | 只读摘要与问答 |
| 5 | docs/assets/store/05-agent-plan.png | Plan approval + danger confirmation. | 计划批准 + 危险确认 |

宣传图：

- **小宣传图（必填）**：docs/assets/ui-refresh/cover-440x280.png（440×280）。
- **Marquee（选填）**：docs/assets/ui-refresh/cover-1400x560.png（1400×560）。

## 4. Privacy practices

**Single purpose**

    Provide three user-configured (BYOK) capabilities on web pages: instant translation of selected text and immersive full-page bilingual translation plus a side-panel translation workbench; a read-only reading assistant (page summary and Q&A); and an optional on-page agent that performs limited DOM actions on the current page only after the user explicitly starts a task and approves its plan.

**Permission justifications**

- storage — Persist settings, the current translation session, and locally stored chat/agent history (for restore, export, and deletion). No cloud sync; the developer receives nothing.
- sidePanel — Host the translation workbench, reading assistant, and agent panel.
- contextMenus — Add "Translate with DualMind" (selection) and "Translate full page with DualMind" menu items.
- host_permissions: <all_urls> — The background service worker must call any user-provided OpenAI-compatible endpoint. No data is sent anywhere except the endpoint the user explicitly configured.
- host_permissions: 127.0.0.1 / localhost :11434 — Access the user's locally running Ollama server.
- content_scripts.matches: <all_urls> — Inject the selection toolbar and page entry point; read the current selection and page text; take an element snapshot only after the user starts and approves an agent task.

**Not requested / not used**：debugger、scripting、tabs、activeTab、downloads。

**Data usage**

- Does this item collect user data? **No** — there is no developer-operated backend; page text is sent only to the endpoint the user configures, and exports are written to the user's local disk.
- Remote code: **No**.
- Certify limited use: **Yes**.
- Privacy policy URL: https://github.com/zhengzhp/DualMind/blob/main/PRIVACY.md

## 5. 提交流程（在开发者账号下执行）

1. 打开 https://chrome.google.com/webstore/devconsole 并登录。
2. 选择 **DualMind**（首次则 **New item**）。
3. **Package → Upload new package**：选择 ~/DualMind-releases/dualmind-1.1.0-chrome.zip；等待校验通过，确认版本显示 1.1.0、权限无新增。
4. **Store listing**：按 §2 粘贴中英文案；上传 §3 的 5 张截图、440×280 小图；需要时上传 marquee。
5. **Privacy practices**：粘贴 §4 的单一用途、权限理由、数据使用；Remote code 选 **No**；填入隐私政策 URL。
6. **Distribution**：Public、所有地区、Free。
7. **Submit for review**。
8. 在 §6 记录提交信息；审核期间不要改包。

> 若后台字段有长度限制，以页面提示为准；英文版用 §2.2 / §4，中文版用 §2.3。

## 6. 提交记录

| 项 | 值 |
|----|-----|
| 提交日期 | 待填 |
| 版本 | 1.1.0 |
| 包 sha256 | 6ed0792d… |
| 提交人 | 待填 |
| 审核状态 | 待填 |
| 审核结论 / 反馈 | 待填 |

## 7. 审核后

- **通过**：打 v1.1.0 tag（需推送授权）；更新 README / 商店记录；归档审核邮件。
- **被拒**：按反馈修复 → 升 patch 版本（如 1.1.1）→ 重跑对应验证与截图 → 重新提交。
- **线上问题**：商店后台暂停分发 / 下架；无自有后端，无法远程关停。
