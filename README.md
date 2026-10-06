# DualMind

AI 浏览器助手（Chrome / Edge Manifest V3）。第一版聚焦翻译：划词工具栏 + Side Panel 工作台 + BYOK（OpenAI Compatible / 本地 Ollama）。

## 开发

需要 Node.js >= 22（推荐使用 nvm：`nvm use`，项目已含 `.nvmrc`）。

```bash
pnpm install
pnpm dev
```

Chrome 打开 `chrome://extensions` → 开启开发者模式 → 加载 `.output/chrome-mv3`（或 WXT 提示的目录）。

### 开发注意事项（踩坑记录）

**WXT 默认会在 Content Script 变更时 reload 所有匹配标签页**（本项目为 `<all_urls>`）。已在 Background 拦截该行为：默认只刷新**当前活动标签**（见 `.env` 的 `WXT_DEV_RELOAD_TABS`）。改完后请 **重启一次 `pnpm dev`** 使 Background 补丁生效。

**改了 Content Script 后，后台标签页不会自动更新。**

- 需要验证的页面请置于前台，或手动刷新；扩展 Reload 后旧标签仍可能跑旧脚本。
- 症状极具迷惑性：表现为「新功能不生效」或「浮层关不掉」，但代码其实是对的。
- 另注意：同时存在 `.output/chrome-mv3` 与 `.output/chrome-mv3-dev` 时，确认加载的是当前 dev 产物。
- 若仍觉得刷太勤：`.env` 设 `WXT_DEV_RELOAD_TABS=none`（完全不自动刷页）。

改动对应关系（便于判断要不要刷新）：

| 改动位置 | 生效方式 |
|----------|----------|
| `features/selection-toolbar/`、`entrypoints/content.ts` | 前台页自动刷 / 或手动刷新 |
| `entrypoints/background.ts` | Reload 扩展（可能短暂打断 SW） |
| `entrypoints/sidepanel`、`entrypoints/workspace`、`entrypoints/options` | 刷新对应扩展页即可 |

**改了快捷键（`wxt.config.ts` 的 `commands.suggested_key`）后，必须卸载并重新安装扩展**：Chrome 只在「首次安装」时采纳 `suggested_key`，Reload / 更新都不会重新绑定（这就是快捷键「描述有、按键为空」的常见原因）。也可在 `chrome://extensions/shortcuts` 手动设置。

## 脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发模式（HMR） |
| `pnpm build` | 生产构建 |
| `pnpm zip` | 打包 zip |
| `pnpm compile` | TypeScript 类型检查 |
| `pnpm test` | Vitest 单测（纯逻辑，无外部依赖） |
| `pnpm test:e2e` | Playwright E2E（先 `wxt build`；需本机启动 Ollama 并拉取 `qwen-coder-8k:latest`） |

> CI（`.github/workflows/ci.yml`）只跑 `pnpm compile` + `pnpm test`；E2E 依赖真实本地模型，请在本地执行。

## 使用

1. 打开扩展 **设置**，选择 Provider：
   - **Ollama**：确认本机已启动（默认 `http://127.0.0.1:11434`），点击「刷新列表」选择模型。
   - **OpenAI Compatible**：填写 Base URL（含 `/v1`）、API Key、模型名。
2. 任意网页划词 → 按快捷键 `Alt+K`（macOS 为 `Option+K`）弹出浮层并翻译。默认「仅快捷键」，可在设置改为「选中后自动显示」；改键见 `chrome://extensions/shortcuts`。
3. 点击扩展图标打开 Side Panel，可继续编辑原文并重译；点「工作台」打开加宽的全页（`workspace.html`）并收起侧栏，与侧栏共用同一翻译会话。

## 架构要点

- 仅 **Background Service Worker** 发起 AI 请求（密钥不出 Content Script）。
- Provider 适配层：`providers/openai-compatible.ts`、`providers/ollama.ts`。
- 后续 Chat / Agent 在 Side Panel 占位，独立 feature 扩展。

## 项目文档

| 文档 | 说明 |
|------|------|
| [docs/decisions.md](docs/decisions.md) | 本次对话已拍板决策 |
| [docs/architecture-v1.md](docs/architecture-v1.md) | V1 架构摘要 |
| [docs/store-listing.md](docs/store-listing.md) | 上架权限用途 / 单一用途 / 数据使用说明 |
| [docs/cursor-cheatsheet.md](docs/cursor-cheatsheet.md) | Cursor 快捷键与 `/` 命令速查 |
| [AGENTS.md](AGENTS.md) | 给 AI / 协作者的入口说明 |
| `.cursor/rules/` | Cursor 项目规则（自动约束后续对话） |
| `.cursor/commands/` | 项目自定义斜杠命令（输入 `/` 选用） |

## 权限说明

- `storage`：保存设置与翻译会话
- `sidePanel`：侧边栏工作台
- `contextMenus`：右键菜单「用 DualMind 翻译」
- `content_scripts.matches: <all_urls>`：注入划词工具栏（支撑「选中即自动显示」）
- `host_permissions: <all_urls>`：BYOK 直连用户自填的 OpenAI 兼容端点（Background 跨域 `fetch` 必需）
- `http://127.0.0.1:11434/*`、`http://localhost:11434/*`：本地 Ollama

> 因划词常驻 + BYOK 任意端点，安装时会出现「读取并更改您在所有网站上的数据」警告，属预期行为；完整理由与替代方案对比见 [docs/decisions.md](docs/decisions.md)。
