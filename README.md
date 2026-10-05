# DualMind

AI 浏览器助手（Chrome / Edge Manifest V3）。第一版聚焦翻译：划词工具栏 + Side Panel 工作台 + BYOK（OpenAI Compatible / 本地 Ollama）。

## 开发

需要 Node.js >= 22（推荐使用 nvm：`nvm use`，项目已含 `.nvmrc`）。

```bash
pnpm install
pnpm dev
```

Chrome 打开 `chrome://extensions` → 开启开发者模式 → 加载 `.output/chrome-mv3`（或 WXT 提示的目录）。

## 脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发模式（HMR） |
| `pnpm build` | 生产构建 |
| `pnpm zip` | 打包 zip |
| `pnpm compile` | TypeScript 类型检查 |

## 使用

1. 打开扩展 **设置**，选择 Provider：
   - **Ollama**：确认本机已启动（默认 `http://127.0.0.1:11434`），点击「刷新列表」选择模型。
   - **OpenAI Compatible**：填写 Base URL（含 `/v1`）、API Key、模型名。
2. 任意网页划词 → 浮动工具栏点「翻译」，或快捷键 `Alt+T`。
3. 点击扩展图标打开 Side Panel，可继续编辑原文并重译。

## 架构要点

- 仅 **Background Service Worker** 发起 AI 请求（密钥不出 Content Script）。
- Provider 适配层：`providers/openai-compatible.ts`、`providers/ollama.ts`。
- 后续 Chat / Agent 在 Side Panel 占位，独立 feature 扩展。

## 项目文档

| 文档 | 说明 |
|------|------|
| [docs/decisions.md](docs/decisions.md) | 本次对话已拍板决策 |
| [docs/architecture-v1.md](docs/architecture-v1.md) | V1 架构摘要 |
| [AGENTS.md](AGENTS.md) | 给 AI / 协作者的入口说明 |
| `.cursor/rules/` | Cursor 项目规则（自动约束后续对话） |

## 权限说明

- `storage`：保存设置与翻译会话
- `sidePanel`：侧边栏工作台
- `scripting` / `<all_urls>`：划词工具栏注入
- `http://127.0.0.1:11434/*`：本地 Ollama
