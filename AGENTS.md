# AGENTS.md

本仓库是 **DualMind** 浏览器扩展（WXT + React + MV3）。

开始改代码前请阅读：

1. [docs/decisions.md](docs/decisions.md) — 已拍板决策
2. [docs/architecture-v1.md](docs/architecture-v1.md) — V1 架构摘要
3. `.cursor/rules/` — AI 项目约束（自动加载）
4. [docs/cursor-cheatsheet.md](docs/cursor-cheatsheet.md) — 快捷键与 `/` 命令
5. `.cursor/commands/` — 项目自定义斜杠命令

## 快速约束

- 只在 Background 调 AI；BYOK + Ollama
- V1 聚焦翻译；Chat / Agent 占位
- 用简体中文与用户沟通；TypeScript + Tailwind
