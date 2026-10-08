# DualMind 代理入口

本仓库是 **DualMind** 浏览器扩展（WXT + React + MV3）。**本文件是唯一通用入口**；当前阶段与边界见「产品边界」。扩大 V3.0 范围或开 V3.1+ 须先 `/plan-feature` 并更新决策 / 架构 / 契约。

## 规则优先级

1. 用户明确指令
2. 本文件（`AGENTS.md`）+ `.cursor/rules/`
3. `docs/decisions.md`、`docs/architecture-v3.md`（当前权威 = V3 已立项；V2 / V1 归档见对应 `-vN` 文档）
4. 训练数据（可能过期，不得覆盖上述任意一层）

写代码前先读 decisions / architecture；自动生效细则见 `.cursor/rules/`。

## 产品边界

- **已封板（仅修 bug）**：划词翻译、沉浸译、Side Panel / 工作台、网页助手（摘要 / 问答）、BYOK、共享 `page-fab`
- **进行中**：V3.0 本页 Agent（`features/agent/`，零新增权限 + 计划批准 + 危险动作再确认）
- **不做（须再立项）**：`debugger` / CDP、跨 Tab 自动化、MCP、PDF、自有后端、云同步
- 参考 Monica 的分层入口，禁止 All-in-One 堆功能

## 项目概况

- 技术栈：WXT `0.21.x` + React + TypeScript + Tailwind；Node `>=22`；Chrome / Edge 优先；包管理 `pnpm`
- 目录：`entrypoints/`、`features/`、`providers/`、`shared/`
- AI：仅 Background 发起；BYOK（OpenAI Compatible）+ 本地 Ollama；无自有后端
- storage 走 `wxt/utils/storage`；feature 间消息走 `shared/messaging`；设置走 `shared/storage`
- 常用命令：`pnpm dev` / `build` / `compile`（`tsc --noEmit`）/ `test` / `test:e2e`（无头，需 build + Ollama）/ `test:e2e:headed` / `zip`。**默认不执行**，除非用户明确要求

### 改动 → 最小验证

按改动类型选**最小**验证；全量 `compile` / `test:e2e` 推迟到 V3 发布闸门（见 `docs/decisions.md`）。**Ask first 不变**：仍须先征得用户同意再执行任何 test / build / compile / e2e。对照表与执行细则见 [`.cursor/commands/verify.md`](.cursor/commands/verify.md)（`/verify`）；更细手工清单用 `/test-plan`。

### E2E 有头 / 无头 —— 必须主动提醒用户

默认 `pnpm test:e2e` 为**无头**。涉及**真实 Side Panel（`sidePanel.open()`）/ 需肉眼观察界面 / 无头下扩展未加载**时，**主动提醒改用 `pnpm test:e2e:headed`**（`E2E_HEADED=1`）；细节见 [`.cursor/commands/verify.md`](.cursor/commands/verify.md)。

## 代理边界

### Always

- 与用户用 **简体中文**；代码默认 TypeScript，UI 优先 Tailwind；核心逻辑加中文注释
- **仅 Background** 调用 LLM / Ollama；Content Script 不持有 API Key、不直连模型
- Feature 经 `shared/llm` 调模型；错误经 `shared/errors` 映射文案
- Provider（`providers/`）永不碰 DOM；新能力放 `features/<name>/`，勿塞进 `TranslateService`
- **Agent 用 `agent:*`，勿混进 `chat:*`**
- 改架构或产品边界前先读并更新 `docs/decisions.md` 与 `docs/architecture-v3.md`
- 处理空值、loading、错误态
- 大文档（>`v3-*` 发布材料）先 `rg` 定位再局部读，禁止整读
- 环境与验证纪律（不杀用户进程 / 优先 prod 产物 / 临时脚本 `_tmp-*` 用完即删 / 外网走本机代理）见 [`.cursor/commands/verify.md`](.cursor/commands/verify.md)

### Ask first

- 引入新依赖、改目录结构、改 messaging 协议
- 扩大 `host_permissions` 或加自动化权限（含 `debugger` / `scripting`；V3.0 红线禁止）
- 扩大 V3.0 范围、启动 V3.1+，或做 PDF / 自有后端 / 云同步
- 执行 lint / build / compile / zip / 测试（默认不跑）
- 需求不明确时直接问，勿靠猜测 + 反复试错

### Never

- 在 Content Script 存/读 API Key 或直连 Provider
- 把翻译服务改成万能 God Object，或把 Chat/Agent 逻辑混入翻译链路
- V1 默认开启强打扰悬浮球；站点禁用能力被破坏
- 未经确认引入第三方 UI / 动画库，或 All-in-One 堆功能

## 文档与命令入口

- `docs/` 文档地图（活文档 / 归档 / 发布材料，含入口 · 使用时机 · 权威性）见 [docs/README.md](docs/README.md)
- `.cursor/rules/` 代码约束；`.cursor/commands/` 斜杠命令（`/review` `/verify` `/arch-check` 等）；`.cursor/handoff-TEMPLATE.md` 交接模板
- Feature 契约表见 [docs/features.md](docs/features.md)

## 完成报告格式

任务结束时按下列结构简短汇报：**改动**（文件路径）/ **未验证**（未跑什么、为什么）/ **请用户验证**（Chrome 路径）/ **假设与风险**。
