# 本地开发

> 面向开发者：环境、脚本、WXT 热更新与常见踩坑。产品与架构口径见 [decisions.md](decisions.md) / [architecture-v3.md](architecture-v3.md)。

## 环境

- Node.js **>= 22**（仓库含 `.nvmrc`，推荐 `nvm use`）
- pnpm（版本以 `package.json` 的 `packageManager` 为准）
- Chrome / Edge（Chrome ≥ 114）

```bash
pnpm install
pnpm dev
```

本地环境变量从 [.env.example](../.env.example) 复制为 `.env`；`.env` 已被 gitignore，勿提交。

## 脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 开发模式（HMR） |
| `pnpm build` | 生产构建 |
| `pnpm zip` | 打包 zip |
| `pnpm compile` | TypeScript 类型检查 |
| `pnpm test` | Vitest 单测（纯逻辑，无外部依赖） |
| `pnpm test:e2e` | Playwright E2E（先 `wxt build`；需本机 Ollama 与 `qwen-coder-8k:latest`）；**默认无头** |
| `pnpm test:e2e:headed` | E2E 有头（`E2E_HEADED=1`）：需要观察界面 / 跑真实 Side Panel 用例时使用 |

CI（[../.github/workflows/ci.yml](../.github/workflows/ci.yml)）只跑 `compile` + `test`；E2E 依赖真实本地模型，请在本地执行。

## WXT 热更新

**WXT 默认会在 Content Script 变更时 reload 所有匹配标签页**（本项目为 `<all_urls>`）。Background 已拦截该行为：默认只刷新**当前活动标签**（见 `.env` 的 `WXT_DEV_RELOAD_TABS`）。改完后请**重启一次 `pnpm dev`** 使补丁生效。

**改了 Content Script 后，后台标签页不会自动更新。**

- 需要验证的页面请置于前台，或手动刷新；扩展 Reload 后旧标签仍可能跑旧脚本。
- 症状很有迷惑性：表现为「新功能不生效」或「浮层关不掉」，但代码其实是对的。
- 同时存在 `.output/chrome-mv3` 与 `.output/chrome-mv3-dev` 时，确认加载的是当前 dev 产物。
- 若仍觉得刷太勤：`.env` 设 `WXT_DEV_RELOAD_TABS=none`（完全不自动刷页）。

| 改动位置 | 生效方式 |
| --- | --- |
| `features/selection-toolbar/`、`entrypoints/content.ts` | 前台页自动刷 / 或手动刷新 |
| `entrypoints/background.ts` | Reload 扩展（可能短暂打断 SW） |
| `entrypoints/sidepanel`、`entrypoints/workspace`、`entrypoints/options` | 刷新对应扩展页即可 |

## 快捷键

改了 `wxt.config.ts` 的 `commands.suggested_key` 后，**必须卸载并重新安装扩展**：Chrome 只在首次安装时采纳 `suggested_key`，Reload / 更新都不会重新绑定。也可在 `chrome://extensions/shortcuts` 手动设置。

## E2E

- 默认 `pnpm test:e2e` 为**无头**；涉及真实 Side Panel（`sidePanel.open()`）、需要肉眼观察界面、或发现无头下扩展未加载时，改用 `pnpm test:e2e:headed`。
- E2E 前需先 `pnpm build`，并确保本机 Ollama 已启动且拉取 `qwen-coder-8k:latest`。
- 页面夹具在 [e2e/pages/](../e2e/pages/)，说明见 [e2e/pages/README.md](../e2e/pages/README.md)。

## 约定

- 临时脚本 / 截图命名 `_tmp-*`，**用完即删**；已在 `.gitignore` 中忽略。
- CI、构建产物、`.output/`、`.wxt/` 不要提交。
- 改产品边界 / 权限 / 消息协议前先读 [decisions.md](decisions.md) 与 [AGENTS.md](../AGENTS.md)。
