# Contributing

感谢愿意帮忙。这个仓库优先保证**权限边界**与**可回滚**，功能数量不是目标。

## 开发环境

```bash
nvm use          # Node >= 22
pnpm install
pnpm dev
```

本地环境变量从 [.env.example](.env.example) 复制为 `.env`。更多踩坑见 [docs/development.md](docs/development.md)。

## 提 PR 前

1. 先开 issue 说明动机与范围，避免大改方向不一致。
2. 跑最小验证：`pnpm compile` + `pnpm test`；涉及 UI / Agent 的改动请说明手工验证路径。
3. 不引入新依赖、不扩大 `host_permissions`、不新增自动化权限，除非 issue 中已明确同意。
4. 更新受影响的文档（`docs/`、`README.md`、`PRIVACY.md`）。

## 代码约定

- **仅 Background 调用 LLM / Ollama**；Content Script 不持有 API Key、不直连模型。
- Provider（`providers/`）只做协议适配，不碰 DOM；新能力放 `features/<name>/`。
- Agent 消息用 `agent:*`，不要混进 `chat:*`。
- 错误统一经 `shared/errors` 映射文案；处理空值、loading、错误态。
- 核心逻辑加中文注释；UI 优先 Tailwind。
- 改产品边界 / 架构前先读 [docs/decisions.md](docs/decisions.md) 与 [docs/architecture-v3.md](docs/architecture-v3.md)。

## 提交信息

使用 Conventional Commits，scope 用模块名，例如：

```
fix(agent): 阻止计划外导航
feat(immersive): 支持动态内容补译
docs(readme): 补充商店徽章
```

## License

提交即表示同意以 [MIT](LICENSE) 授权你的贡献。
