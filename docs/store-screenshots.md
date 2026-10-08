# DualMind 上架截图与功能说明（REL-10 / T30）

> 状态：**图片已用最终归档包采集（2026-10-08，6/6 通过）**，待人工补拍「真实侧栏形态」与观感核对（见 §6）。
> 与 [store-listing.md](./store-listing.md)（表单文案）、[release-notes-v1.0.0.md](./release-notes-v1.0.0.md)（已知限制）配套；
> 权威边界见 [decisions.md](./decisions.md) 与 [v3-minimal-release-plan.md](./v3-minimal-release-plan.md)。

## 1. 这份文档解决什么

Chrome 应用商店每条截图都要配一段说明，且宣传内容必须与**实际能力一致**（REL-05 / REL-10）。
本文把「截哪几张、每张说什么、必须先声明什么前提」固定下来，避免提交时临场拼文案。

## 2. 截图清单

尺寸统一 **1280×800**（商店要求 1280×800 或 640×400；PNG）。
产物目录：`docs/assets/store/`。

| # | 文件 | 展示的能力 | 建议说明（可粘贴） |
|---|------|------------|--------------------|
| 1 | `01-selection-toolbar.png` | 划词翻译 | 选中一段外文即可就地翻译，译文流式呈现，随时可停止 / 收起。 |
| 2 | `02-immersive-fullpage.png` | 沉浸式整页双语翻译 | 整页对照阅读：译文紧跟原文、布局不变形，可一键切回「仅译文」或还原页面。 |
| 3 | `03-workbench-translate.png` | 翻译工作台（全页工作台） | 在工作台里做长文翻译；模型、目标语言、Provider 都在同一处切换。 |
| 4 | `04-reading-assistant.png` | 阅读助手（只读摘要） | 一键总结当前页要点，并可就该页继续问答；**只读**，不修改页面。 |
| 5 | `05-agent-plan.png` | 本页操作 Agent（计划批准） | 让 Agent 操作当前页时，先给出步骤计划；**必须由你批准后才执行**。 |
| 6 | `06-agent-danger-confirm.png` | 危险动作二次确认 | 删除类等危险动作执行前再次确认，并可跳过；资金类动作**直接拒绝**。 |

## 3. 如何生成

```bash
# ① 用「正式包」而非 dev 产物截图（推荐）
unzip -q ~/DualMind-releases/dualmind-1.0.0-chrome.zip -d /tmp/dm-1.0.0

# ② 采集（默认无头；人工核对观感时加 E2E_HEADED=1）
#    必须脱离 Cursor 沙箱执行，并显式指定 Playwright 浏览器路径
DM_CAPTURE=1 \
DM_EXTENSION_PATH=/tmp/dm-1.0.0 \
PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" \
npx playwright test e2e/store-screenshots.e2e.ts
```

- 用例文件：`e2e/store-screenshots.e2e.ts`（**仅在 `DM_CAPTURE=1` 时执行**，不参与 `pnpm test:e2e` 跑批）。
- 内容页（1 / 2 / 4）走**真实本地 Ollama**，产出的是真实译文，不是占位文本；请先确认 `ollama list` 里默认模型存在。
- `DM_CAPTURE=1` 会把 devicePixelRatio 锁为 1，保证出图恰好 1280×800（Retina 上默认 2x 会变 2560×1600）。

### 3.1 采集能力的边界（必须如实知悉）

| 项 | 说明 |
|----|------|
| 截不到浏览器窗口 | Playwright 只能截**网页视口**，拿不到地址栏 / 标签栏 / 工具栏 |
| 截不到真实 Side Panel | Side Panel 是浏览器 UI，无法截图；工作台 / 阅读助手 / Agent 三张统一在 **`workspace.html`（全页工作台）** 采集 —— 它与侧栏**共用 `WorkbenchApp`**，消息与 storage 链路都是真实的，只是 surface 不同 |
| 侧栏观感需人工补拍 | 若提交材料要求体现「侧栏形态」，须人工在有头浏览器里打开真实 Side Panel 手动截图（见 §6） |
| 演示内容为虚构 | 演示文章 / 表单均为虚构数据，不含真实凭据（ENV-02） |

## 4. 功能说明（提交表单「功能简介」可用）

DualMind 把三类能力放到你正在看的这一页上，模型由**你自己**提供（BYOK）：

1. **翻译**：划词即译、整页沉浸式双语对照、侧栏 / 工作台长文翻译。
2. **阅读助手（只读）**：整页摘要与针对当前页的问答，全程不改动页面。
3. **本页操作 Agent（可选）**：在你逐次批准下，对**当前网页**做有限 DOM 操作。

### 4.1 模型前提（须在提交材料中声明）

- 翻译与阅读助手可用**任意** OpenAI 兼容端点或**本机 Ollama**；默认路径是本地 Ollama，无需账号与付费。
- 本页操作 Agent **要求模型支持 tool calling**；不支持时会给明确提示，不会静默失败。
- 未配置模型 / Key 时，界面给出可读错误并可重试，不会无限 loading。

### 4.2 安全确认（须在提交材料中声明）

- Agent 任务**只由用户显式发起**；安装后即可用，但**不会自动启动任何任务**（S1）。
- 执行前必须**批准步骤计划**。
- **删除类**等危险动作执行前**二次确认**，可跳过。
- **支付 / 下单 / 转账等资金类动作直接拒绝**，不执行、也不提供「仍要执行」的放行路径。
- 仅操作**当前内容页**，**不跨标签页**，不使用 `debugger` / CDP。
- 可随时停止；已发生的页面动作**无法撤销**（发布说明已如实披露）。

### 4.3 已知限制（须在提交材料中声明）

- 首轮**仅 Chrome**，Edge 逐项验证延后。
- 运行态不持久化：关闭 / 重启后 Agent 任务**不恢复、不重放**页面操作。
- Shadow DOM / 跨域 iframe / 严格 CSP 下的部分元素可能无法操作，会给出可读失败。
- 已知低危产物缺陷：缺少 `content-scripts/content.css`（两个 Shadow UI 自带内联样式，正确性不受影响，仅每页一次失败请求 + 控制台警告）。
- 详见 [release-notes-v1.0.0.md](./release-notes-v1.0.0.md)「已知限制 / 已知缺陷」。

## 5. 提交前 Checklist

- [x] 用**最终归档包**（不是 dev 产物）跑一次 §3 的采集，确认 6 张图与文中描述逐条一致。→ **2026-10-08 已执行**（`DM_EXTENSION_PATH=/tmp/dm-1.0.0`，源包 sha256 `2a670372…`，6/6 通过）
- [ ] 图内出现的功能、按钮、文案与最终包**实际**一致（REL-05）。→ 图片已取自最终包；**仍须人工目视复核**文案口径
- [ ] §4.1–§4.3 的三类前提**已写进**提交表单对应字段。
- [ ] 与 [store-listing.md](./store-listing.md) 的「单一用途 / 数据使用」无事实冲突。
- [x] 图片尺寸恰为 1280×800，且无个人数据 / 真实 Key / 真实站点私密信息。→ 6 张均 `sips` 实测 **1280×800**，内容为虚构演示数据

## 5.1 采集记录（2026-10-08）

| 项 | 值 |
|----|----|
| 来源扩展 | `/tmp/dm-1.0.0`（解压自 `~/DualMind-releases/dualmind-1.0.0-chrome.zip`） |
| 源包 sha256 | `2a6703722098cba7e583c96f56bc9b5da7090307fe5280153c347d41629b08c1`（与归档 `.sha256` 一致） |
| 包内版本 | `manifest.json` → `version: 1.0.0` |
| 模式 | 有头（`E2E_HEADED=1`），DPR 锁 1 |
| 结果 | **6 passed / 27.4s**，产物 6 张均 1280×800 |
| 模型 | 本机 Ollama `qwen-coder-8k:latest`（内容页 1/2/4 走真实推理） |
| 命令 | `DM_CAPTURE=1 DM_EXTENSION_PATH=/tmp/dm-1.0.0 E2E_HEADED=1 PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" npx playwright test e2e/store-screenshots.e2e.ts` |

> 说明：本次出图**已脱离 Cursor 沙箱**（沙箱内代理会干扰扩展加载 / 本地模型连接）。

## 6. 待人工补拍 / 待人工确认

| 项 | 原因 | 建议做法 |
|----|------|----------|
| 真实侧栏形态截图 | Playwright 截不到浏览器 UI | 有头浏览器打开真实 Side Panel（`pnpm test:e2e:headed` 或手工），系统截图 |
| 划词浮层的拖拽宽度 / 深色主题观感 | 属「肉眼观感」，自动化只断言结构与行为 | 人工目视一次 |
| 提交当日核验（REL-11） | 依赖实际提交日期 | 提交当天按 §5 复核并记录日期 |
