# DualMind 代理入口

本仓库是 **DualMind** 浏览器扩展（WXT + React + MV3）。当前阶段：**V1 已冻结**（划词 + Side Panel/全页工作台 + BYOK/Ollama），**只修 bug、不加功能**；Chat / Agent 仅占位。新能力进入 V1.5+，须先更新 `docs/decisions.md`。

## 规则优先级

1. 用户明确指令
2. 本文件（`AGENTS.md`）与 `.cursor/rules/`
3. [docs/decisions.md](docs/decisions.md)、[docs/architecture-v1.md](docs/architecture-v1.md)
4. 训练数据（可能过期，不得覆盖上述任意一层）

写代码前先读 decisions / architecture；自动生效细则见 `.cursor/rules/`。

## 项目概况

- 技术栈：WXT `0.21.x` + React + TypeScript + Tailwind；Node `>=22`；Chrome / Edge 优先
- 目录：`entrypoints/`、`features/`、`providers/`、`shared/`
- AI：仅 Background 发起；BYOK（OpenAI Compatible）+ 本地 Ollama；无自有后端
- 包管理：`pnpm`

## 命令

| 命令 | 作用 |
|------|------|
| `pnpm dev` | 开发（WXT） |
| `pnpm build` | 生产构建 |
| `pnpm compile` | `tsc --noEmit` |
| `pnpm test` | Vitest 单测 |
| `pnpm test:e2e` | E2E（默认**无头**；需 `wxt build` + 本地 Ollama） |
| `pnpm test:e2e:headed` | E2E 有头（`E2E_HEADED=1`；真实 Side Panel / 肉眼观察用） |
| `pnpm zip` | 打包 zip |

**默认不执行** `dev` / `build` / `compile` / `zip`，除非用户明确要求。

### E2E 有头 / 无头 —— 必须主动提醒用户

- 默认 `pnpm test:e2e` 为**无头**。
- 当任务涉及 **真实 Side Panel（`sidePanel.open()`）/ 需要肉眼观察界面 / 无头下扩展未加载** 时，
  **主动提醒用户改用 `pnpm test:e2e:headed`**（`E2E_HEADED=1`）；无头下
  `e2e/selection-panel-toggle.e2e.ts` 的真实侧栏用例会自动 skip，只有该模式才执行。
- 无头依赖 `channel: 'chromium'` 走完整 Chromium 新无头模式（headless shell 不支持加载扩展）。
- 细节见 `docs/decisions.md`「本地 E2E 运行须知」。

## 代理边界

### Always

- 与用户用 **简体中文** 交流；代码默认 TypeScript，UI 优先 Tailwind；核心逻辑加中文注释
- **仅 Background** 调用 LLM / Ollama；Content Script 不持有 API Key、不直连模型
- Feature 经 `shared/llm` 调模型；错误经 `shared/errors` 映射文案；契约见 `docs/features.md`
- Provider（`providers/`）永不碰 DOM；新能力放 `features/<name>/`，勿塞进 `TranslateService`
- Side Panel：Translate 可用；Chat / Agent 仅占位，除非用户明确要求实现
- 改架构或产品边界前先读并更新 `docs/decisions.md` 与 `docs/architecture-v1.md`
- 处理空值、loading、错误态

### Ask first

- 引入新依赖、改目录结构、改 messaging 协议
- 扩大 `host_permissions` 或添加自动化相关权限
- 实现 Chat / Agent、全文沉浸译、PDF、自有后端、Browser Operator
- 执行 lint / build / compile / zip / 测试（默认不跑）
- 需求不明确时直接问，不要靠猜测 + 反复试错

### Never

- 在 Content Script 存/读 API Key 或直连 Provider
- 把翻译服务改成万能 God Object，或把 Chat/Agent 逻辑混入翻译链路
- V1 默认开启强打扰悬浮球；站点禁用能力被破坏
- 未经确认引入第三方 UI / 动画库，或 All-in-One 堆功能

## 细节文档

| 文档 | 用途 |
|------|------|
| [docs/decisions.md](docs/decisions.md) | 已拍板产品 / 技术决策 |
| [docs/architecture-v1.md](docs/architecture-v1.md) | V1 架构摘要与数据流 |
| [docs/features.md](docs/features.md) | Feature 契约表（消息 / storage / UI） |
| [docs/cursor-cheatsheet.md](docs/cursor-cheatsheet.md) | Cursor 快捷键与 `/` 命令 |
| `.cursor/rules/` | 始终 / 按 glob 生效的代码约束 |
| `.cursor/commands/` | 项目自定义斜杠命令（`/review`、`/arch-check` 等） |

## 完成报告格式

任务结束时按下列结构汇报（保持简短）：

1. **改动**：改了哪些文件（路径即可；新建说明主要结构）
2. **未验证**：未跑哪些命令、为什么
3. **请用户验证**：Chrome 中划词浮层 / Side Panel / Options 的哪些路径
4. **假设与风险**：未决问题、权限或兼容性风险
