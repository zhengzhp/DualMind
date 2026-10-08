# DualMind 隐私政策 · Privacy Policy

**生效日期 / Effective date：2026-10-08**
**适用版本 / Applies to：DualMind 浏览器扩展（Chrome / Edge，Manifest V3）v1.0.0 起**
**开发者 / Developer：DualMind（个人开发者）**

> 本文件同时以中英文提供；如两种文本存在歧义，以中文为准。
> Both Chinese and English versions are provided; in case of ambiguity, the Chinese version prevails.

---

## 中文

### 一句话概述

DualMind **没有开发者自建的后端服务器**，**不做任何遥测或数据收集**。你的网页内容只会在你主动发起某个功能时，由扩展的 Background Service Worker **直接发送到你自己配置的模型端点**（本机 Ollama 或你填写的任意 OpenAI 兼容服务）。除此之外，我们不接收、不中转、不存储你的任何数据。

### 1. 我们处理哪些数据，以及为什么

| 数据 | 何时处理 | 去哪里 |
|------|----------|--------|
| 你**选中的文本** | 你划词翻译时 | 你配置的模型端点 |
| 当前**网页正文** | 你使用「总结本页 / 沉浸式全文翻译」时 | 你配置的模型端点 |
| 针对当前页的**提问内容** | 你在侧栏向当前页提问时 | 你配置的模型端点 |
| 页面**元素快照与工具结果** | 你**显式发起并批准**本页 Agent 任务后 | 你配置的模型端点 |

- 以上数据**仅**从扩展的 Background Service Worker 直接发往**你自己配置**的端点；DualMind 没有自有后端，**不中转、不存储**这些文本。
- **元素快照可能包含表单字段的值**（例如输入框里已有的内容）。我们对**密码框做掩码处理**（只发送 `••••`，不发送明文），但**普通输入框的值可能进入快照**。请勿在测试或使用 Agent 时填写真实敏感信息。
- 我们**不采集**浏览历史、个人身份信息，**没有**遥测 / 埋点 / 崩溃上报，也**不加载任何远程可执行代码**（所有逻辑随扩展包发布）。

### 2. API Key 如何保管

- 你填写的 API Key **只保存在你本机的浏览器扩展存储中**，**只由 Background Service Worker 读取**，并**仅用于向你配置的 Provider 发送认证请求**。
- Key **不会**注入网页的内容脚本（Content Script），**不会**发往任何其他第三方。Content Script 既不持有 Key，也不直连模型。

### 3. 本机保存了哪些内容

以下数据保存在你本机的浏览器扩展存储（`chrome.storage.local`）中，**不上传**：

- 扩展设置（Provider、模型、目标语言、禁用站点列表、悬浮按钮隐藏列表、Agent 偏好）；
- **聊天与会话历史**（供恢复、导出与删除）；
- **当前一次**翻译会话；
- Agent 悬浮入口的**信箱**（一次性指令）。

**不持久化**：本页 Agent 任务的运行状态（步骤计划、执行轨迹、中止标志）**只存在内存中**，关闭或重启浏览器后不会恢复，也**不会重放**任何页面操作。

### 4. 你如何删除数据

- 聊天与会话历史**支持单条删除，也支持一键全部清空**（在侧栏 / 工作台的历史面板中操作）。
- 其余设置可在扩展的 **设置页** 中修改或清除。
- **卸载扩展**会移除上述所有本机数据。

### 5. 权限与用途

| 权限 | 用途 |
|------|------|
| `storage` | 保存上述本机设置与会话历史 |
| `sidePanel` | 在浏览器侧边栏提供翻译工作台 / 阅读助手 / Agent 面板 |
| `contextMenus` | 右键菜单「用 DualMind 翻译」「用 DualMind 翻译整页」 |
| `content_scripts.matches: <all_urls>` | 注入划词工具栏、页面悬浮入口，以及（在你发起任务后）Agent 的 DOM 操作通道 |
| `host_permissions: <all_urls>` | 由 Background 跨域 `fetch` 你**自己填写**的 OpenAI 兼容端点 |
| `host_permissions: 127.0.0.1 / localhost :11434` | 访问你本机运行的 Ollama 服务 |

我们**不使用** `debugger` / CDP，**不使用** `scripting` / `tabs` / `activeTab` 等未列入的权限。

### 6. 本页操作 Agent 的边界（安全设计）

本页 Agent 是**可选**能力，且**不会自动启动任何任务**：

- 每个任务必须由你在页面上**显式发起**，其**步骤计划必须经你批准**后才执行；
- **危险动作**（提交表单、导航到敏感域、删除类操作等）在执行前**二次确认**；
- **支付 / 下单 / 转账等资金类动作直接拒绝**，不执行，也无法通过确认放行；
- 只在**当前内容页**操作，**不跨标签页**，不使用 `debugger` / CDP；
- 对 Shadow DOM、跨域 iframe、严格 CSP 下的部分元素可能无法操作（会给出可读失败提示）；
- 你可以在设置中**关闭**该能力。

### 7. 第三方

除**你自己配置的模型端点**外，扩展不会向任何第三方发送数据。你与该端点之间的数据处理适用该服务自己的隐私政策（例如你使用的商业 API 服务或你自建的服务）。

### 8. 儿童

DualMind 面向一般用户，**不面向 13 岁以下儿童**，也不会有意收集儿童的个人信息。

### 9. 政策变更

本政策如有更新，我们会修改本文件顶部的「生效日期」并随扩展版本发布。重大变更会在扩展的发布说明中提示。

### 10. 联系方式 / 支持

- **问题反馈与支持**：<https://github.com/zhengzhp/DualMind/issues>
- **隐私相关问题**：同样可通过上述 Issues 提出。

---

## English

### Summary

DualMind has **no developer-operated backend server** and performs **no telemetry or data collection**. Your page content is only sent, when you explicitly trigger a feature, from the extension's background service worker **directly to the model endpoint you configured yourself** (local Ollama or any OpenAI-compatible service you enter). Beyond that, we neither receive, relay, nor store any of your data.

### 1. What we process and why

| Data | When | Where it goes |
|------|------|---------------|
| Text you **select** | When you translate a selection | Your configured model endpoint |
| The current **page text** | When you use "Summarize this page" / immersive full-page translation | Your configured model endpoint |
| Your **question** about the current page | When you ask in the side panel | Your configured model endpoint |
| Page **element snapshots and tool results** | Only after you **explicitly start and approve** an on-page agent task | Your configured model endpoint |

- This data is sent **only** from the extension's background service worker directly to the endpoint **you configured**. There is no developer backend; we do not relay or store this text.
- **Element snapshots may include form field values** (e.g., text already typed into inputs). **Password fields are masked** (we send `••••`, never the plaintext), but values in ordinary inputs may be included. Do not enter real sensitive information when using the agent.
- We do **not** collect browsing history or personal identity information. There is **no** telemetry, analytics, or crash reporting, and **no remote code** is loaded at runtime (all logic ships with the extension package).

### 2. How your API key is handled

- The API key you enter is stored **only in your local browser extension storage**, read **only by the background service worker**, and used **solely to authenticate requests to the provider you configured**.
- It is **never** injected into page content scripts, and **never** sent to any other third party. Content scripts neither hold the key nor call the model directly.

### 3. What is stored on your device

The following is stored locally in the extension's browser storage (`chrome.storage.local`) and is **never uploaded**:

- Extension settings (provider, model, target language, disabled-site list, floating-button hidden list, agent preferences);
- **Chat and session history** (for restore, export, and deletion);
- The **current single** translation session;
- The agent entry point's one-shot **mailbox**.

**Not persisted**: an on-page agent task's runtime state (plan, execution trace, abort flag) lives **in memory only**; it is not restored after closing or restarting the browser, and page actions are **never replayed**.

### 4. How to delete your data

- Chat and session history can be **deleted individually or cleared all at once** (from the history panel in the side panel / workbench).
- Other settings can be changed or cleared on the extension's **Options** page.
- **Uninstalling the extension** removes all of the local data above.

### 5. Permissions and their purposes

| Permission | Purpose |
|------------|---------|
| `storage` | Persist the local settings and session history above |
| `sidePanel` | Host the translation workbench / reading assistant / agent panel |
| `contextMenus` | "Translate with DualMind" / "Translate full page with DualMind" context menu items |
| `content_scripts.matches: <all_urls>` | Inject the selection toolbar, the page entry point, and (after you start a task) the agent's DOM action channel |
| `host_permissions: <all_urls>` | Let the background `fetch` the OpenAI-compatible endpoint **you** enter |
| `host_permissions: 127.0.0.1 / localhost :11434` | Talk to your locally running Ollama server |

We do **not** use `debugger`/CDP, and we do **not** request `scripting`, `tabs`, `activeTab`, or any other permission not listed above.

### 6. On-page agent boundaries (safety by design)

The on-page agent is an **optional** capability that **never starts a task on its own**:

- Every task must be **explicitly started** by you, and its **step plan must be approved** by you before execution;
- **Dangerous actions** (form submission, navigation to sensitive domains, deletions, etc.) require a **second confirmation**;
- **Payment, ordering, and money-transfer actions are refused outright** — never executed and not approvable;
- It acts on the **current page only**, **never spans tabs**, and never uses `debugger`/CDP;
- Some elements under Shadow DOM, cross-origin iframes, or strict CSP may be inoperable (a readable failure is shown);
- You can **turn the capability off** in settings.

### 7. Third parties

Except for the **model endpoint you configured**, the extension sends data to no third party. Your use of that endpoint is governed by that service's own privacy policy (e.g., the commercial API service you use or the service you self-host).

### 8. Children

DualMind is intended for a general audience, is **not directed to children under 13**, and does not knowingly collect personal information from children.

### 9. Changes to this policy

If this policy is updated, we will revise the "Effective date" above and ship the change with an extension release. Material changes will be noted in the release notes.

### 10. Contact / Support

- **Support and issue reports**: <https://github.com/zhengzhp/DualMind/issues>
- **Privacy questions**: also via the Issues link above.
