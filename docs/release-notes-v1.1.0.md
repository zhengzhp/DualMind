# DualMind v1.1.0 发布说明 · 已知限制 · 回滚预案

> 对应清单 **REL-12**（延续 [v1.0.0](./release-notes-v1.0.0.md)）。首轮**仅 Chrome**（Edge 延后）。
> 隐私与数据处理见 [PRIVACY.md](../PRIVACY.md)；权限用途见 [store-listing.md](./store-listing.md)。

## 1. 版本信息

| 字段 | 值 |
|------|-----|
| 版本号 | `1.1.0`（`package.json` 与最终 `manifest.version` 一致） |
| 目标浏览器 | **Chrome（Chromium）≥ 114**（`minimum_chrome_version: "114"`，`sidePanel` 需 114+）；Edge 延后 |
| manifest | MV3；`permissions = storage / sidePanel / contextMenus`；**无** `debugger` / `scripting` / `tabs` / `activeTab` / `downloads` |
| 描述 | `AI 浏览器助手（BYOK）：划词与整页翻译、网页摘要与问答，以及逐次批准的本页操作 Agent` |
| 正式包 | `.output/dualmind-1.1.0-chrome.zip`（待打包后补 hash / 体积） |
| 发布负责人 | zp |
| 回滚负责人 | zp |

## 2. 本次发布内容

### 2.1 视觉与可访问性（v0.3 · 已落地）

- 语义 token（canvas / surface / line / ink / accent / success / warn / danger）统一浅色 / 深色两套；深色阴影改 1px 描边，`ink-3` 提到 WCAG 达标对比度。
- 内置 IBM Plex Sans（拉丁可变）+ IBM Plex Sans SC UI 子集；中文字重统一 400 / 600。
- 工作台头部 56px、模型横栏 Provider chip + 状态点、模块 Tab、翻译区合并卡片；侧栏 32px / 全页 40px 按钮高度。
- 新增 skip-to-main（工作台 / 设置页）、下拉键盘提示、`prefers-reduced-motion` 全局退化。
- 阅读助手正文把 `**粗体**` 渲染为强调、去掉行首 `#` 标记（仅展示层）；存储 / 导出仍保留原始 Markdown。
- 品牌：双页标 / 组合标按规范几何统一；页头字标改内联 SVG，删除浅/深两份资源切换。

### 2.2 本页 Agent（V3.0）

- 新增**执行记录导出**：计划 + 时间线 + 结论 → 本机 Markdown；结果含 Markdown 表格时可另存 **CSV**（UTF-8 BOM，Excel 可直接打开）。两条导出均为本机 Blob 下载，**不新增 `downloads` 权限**、不经 Background。
- 结论里的 Markdown 表格在面板内渲染为真表格（链接可点），不再是原始管道文本。
- 空态示例改为差异化场景（套餐对比 / 页内搜索 / 评论关键词 / 批量勾选 / 提取正文清单），不再统一要求表格输出。

### 2.3 上架素材

- 5 张商店截图（Agent 的计划批准 + 危险确认合并为一张 1280×800 双联）；README 截图同步。

## 3. 已知限制（**请在文档与商店说明中如实保留**）

### 3.1 产品能力边界

- **仅当前页**：Agent 只在启动时绑定的内容页工作，**不跨标签页**，不使用 `debugger` / CDP。
- **需要自带模型**：扩展不含任何内置额度或代理服务。Agent 需支持 tool / function calling；不支持时在连续两轮零 `tool_calls` 后明确报错（`TOOLS_UNSUPPORTED`）。
- **资金类动作直接拒绝**；提交 / 删除 / 敏感导航等危险动作需二次确认；已发生的同步动作不可撤销。
- **运行态不持久化**：关闭 / 重启后不恢复、不重放页面操作。
- **CSV 导出不保证每次都有**：仅当模型在结论里输出 Markdown 表格时出现；没有表格时只提供 Markdown 记录。
- **暂不提供**：页面图片批量下载、用户自定义 Agent 操作（工作流配方）——已登记为 V3.1 / V3.2 候选（见 [decisions.md](./decisions.md)「后续候选排期」）。
- **部分页面无法操作**：Shadow DOM、跨域 iframe、严格 CSP 下的部分元素可能失败（可读提示）。

### 3.2 已知缺陷

| 编号 | 现象 | 影响 | 处置 |
|------|------|------|------|
| — | 产物缺少 `content-scripts/content.css` | 两个 Shadow UI 自带内联样式，正确性不受影响；仅每页一次失败请求 + 控制台警告 | 低危，不阻塞 |

## 4. 权限与隐私提示（对用户可见）

- 安装时会出现「**读取并更改您在所有网站上的数据**」警告 —— 属预期：划词需常驻读取选区与页面正文，BYOK 需由 Background 跨域 `fetch` 用户自填的任意端点。
- API Key 仅存本机、仅由 Background 读取、仅用于用户配置的端点认证。
- 新增的 Markdown / CSV 导出只写用户本机，不经服务器、不上传。
- 无遥测、无浏览历史收集、无远程代码。

## 5. 回滚 / 暂停发布预案

沿用 [v1.0.0](./release-notes-v1.0.0.md) §5：无自有后端，只能通过商店「暂停分发 / 下架」+ 发新版本处置；触发条件与步骤不变。

## 6. 验证记录（2026-10-19 · v1.1.0 工作区）

| 项 | 结果 |
|----|------|
| `pnpm compile` | ✅ 0 error |
| `pnpm test` | ✅ 39 文件 / **400 用例** |
| `pnpm build` | ✅ `manifest.version = 1.1.0`；permissions 仍为 `storage / sidePanel / contextMenus` |
| 全量 E2E | ✅ **81 passed / 7 skipped / 0 failed（6.7m）**（`DM_OLLAMA_MODEL=huihui_ai/qwen3-abliterated:8b-v2 pnpm test:e2e`） |
| 商店截图 | ✅ **5 / 5**，均 1280×800（`DM_CAPTURE=1`；01/02 铺满视口，03/04 等流式结束） |

- 7 skipped = 5 条截图专用（已单独跑完，5/5 通过）+ 2 条仅 headed（已用 `E2E_HEADED=1` 复跑：`agent-ui` + `selection-panel-toggle` 通过，后者 2/2）。
- 测试侧修正（不影响产品行为）：UI 改版后遗留的旧文案 / 元素定位（计划编号、危险卡、页头副标题分隔符、绑定页 chip）改为 role / testid；新增 `data-testid="agent-bound-page"`；划词浮层侧栏按钮已改图标按钮，断言改用 `aria-label`，并在 headed 前归零持久化 profile 的侧栏状态；截图脚本修正 demo `body` 限宽 / 左对齐与流式等待。
- 包：`.output/chrome-mv3`（1.1.0）；**zip / sha256 待提交 commit 后生成**。
- 详细证据见 [v3-release-test-plan-log.md](./v3-release-test-plan-log.md) 的 2026-10-19 记录。
