# DualMind v1.0.0 发布说明 · 已知限制 · 回滚预案

> 对应清单 **REL-12**。首轮**仅 Chrome**（Edge 延后，见 [decisions.md](./decisions.md)「V3.0 正式版发布范围裁剪」S2）。
> 隐私与数据处理见 [PRIVACY.md](../PRIVACY.md)；权限用途见 [store-listing.md](./store-listing.md)。

## 1. 版本信息

| 字段 | 值 |
|------|-----|
| 版本号 | `1.0.0`（首个正式版；`package.json` 与最终 `manifest.version` 一致） |
| 目标浏览器 | **Chrome（Chromium）≥ 114**（`minimum_chrome_version: "114"`，因 `sidePanel` API 需 114+）；Edge 延后至下一轮 |
| manifest | MV3；`permissions = storage / sidePanel / contextMenus`；**无** `debugger` / `scripting` / `tabs` / `activeTab` |
| 描述 | `AI 浏览器助手（BYOK）：划词与整页翻译、网页摘要与问答，以及逐次批准的本页操作 Agent` |
| 正式包 | `.output/dualmind-1.0.0-chrome.zip`（归档：`~/DualMind-releases/dualmind-1.0.0-chrome.zip`） |
| 包大小 / hash | 227,927 B；sha256 `2a6703722098cba7e583c96f56bc9b5da7090307fe5280153c347d41629b08c1` |
| 发布负责人 | zp |
| 回滚负责人 | zp |

## 2. 本次发布内容

三类能力（全部 BYOK / 本地 Ollama，无自有后端、无遥测）：

1. **翻译**：划词工具栏（`Alt/Option+K`）+ Side Panel 工作台 + 沉浸式整页双语翻译；
2. **只读阅读助手**：整页摘要、针对当前页的问答（本地历史可单条删除 / 全部清空）；
3. **可选的本页操作 Agent**：自然语言驱动当前页的有限 DOM 操作，**计划批准 + 危险动作二次确认**。

## 3. 已知限制（**请在文档与商店说明中如实保留**）

### 3.1 产品能力边界

- **仅当前页**：Agent 只在启动时绑定的那个内容页工作，**不跨标签页**，不使用 `debugger` / CDP。
- **需要自带模型**：扩展不含任何内置额度或代理服务。Agent 需要支持 **tool / function calling** 的模型；模型不支持时会在连续两轮零 `tool_calls` 后**明确报错**（错误码 `TOOLS_UNSUPPORTED`），不会退化成猜测点击。
- **资金类动作直接拒绝**：支付 / 下单 / 转账等动作**不执行、也无法通过确认放行**；其他危险动作（提交表单、删除类、导航到敏感域）需**二次确认**。
- **部分页面无法操作**：Shadow DOM、跨域 iframe、严格 CSP 下的部分元素可能失败（会给出可读失败提示）。
- **Agent 运行态不持久化**：步骤计划 / 轨迹 / 中止标志只存在于内存；关闭或重启浏览器后不恢复，也**不重放**页面操作，须重新发起并重新批准。
- **首轮仅 Chrome**：Edge 尚未验证，本轮不声明支持。
- **最低版本 Chrome 114**：`sidePanel` API 需 114+，低于该版本无法安装（已用 `minimum_chrome_version` 声明）。

### 3.2 已知缺陷（低危 / 已声明）

| 编号 | 现象 | 影响 | 处置 |
|------|------|------|------|
| — | 产物缺少 `content-scripts/content.css`（V1/V2 范围） | 两个 Shadow UI（划词浮层 / 悬浮入口）自带内联样式，**正确性不受影响**；仅每页一次失败请求 + 控制台警告 | 低危，本轮不阻塞；下轮清理 |

> **更正（2026-10-08）**：本表此前登记过一条「划词浮层在长组合会话下偶发不显示」，
> 经排查确认**不是产品缺陷**，而是 **E2E 测试夹具与扩展启动期设置迁移的写-写竞态**
> （夹具直接写底层 storage，与 `runMigrations()` 的读-改-写交错）。
> 真实用户路径不存在该窗口（产品内写入都经 `getSettings()/saveSettings()` 与迁移串行）。
> 夹具已修为「写入 + 回读校验 + 重试」，有头全量 E2E 连续两轮 `83 passed / 0 failed`。
> 因此该条**已从产品已知缺陷中移除**；排查记录见 [v3-release-test-plan-log.md](./v3-release-test-plan-log.md) §15 DM-V3-005。

## 4. 权限与隐私提示（对用户可见）

- 安装时会出现「**读取并更改您在所有网站上的数据**」警告 —— 属预期：划词需常驻读取选区与页面正文，BYOK 需由 Background 跨域 `fetch` 你自填的任意端点。理由与替代方案见 [decisions.md](./decisions.md) 与 [store-listing.md](./store-listing.md)。
- API Key 仅存本机、仅由 Background 读取、仅用于你配置的端点认证。
- 无遥测、无浏览历史收集、无远程代码。

## 5. 回滚 / 暂停发布预案

> 由于**没有自有后端**，扩展一旦分发出去，**无法远程关闭或降级**功能；所有处置都必须通过商店的「暂停分发 / 下架」+ 发新版本完成。

### 5.1 触发条件（满足任一即启动）

- 发现未确认的页面写入、支付类动作被放行、跨站点数据外发、Key 泄漏等**安全 / 隐私**问题；
- 影响主要功能的崩溃或数据损坏；
- 商店审核被驳回且原因涉及实现缺陷。

### 5.2 处置步骤

1. **立即止损**：在 Chrome Web Store 后台将该版本**暂停分发 / 下架**（这是唯一能快速阻止新用户安装的手段）。
2. **定界**：根据问题类型确定影响面（哪些功能 / 哪些站点 / 是否需要特定模型）。
3. **修复 + 回归**：修复后必须重跑受影响的安全（SEC）与生命周期（LIFE）用例，再 `pnpm zip` 并重跑 T04–T08（权限 / 包内安全静态核对）。
4. **发补丁版**：版本号递增（如 `1.0.1`），发布说明中明确说明修复内容与影响。
5. **通知**：通过 <https://github.com/zhengzhp/DualMind/issues> 与商店更新日志告知用户。

### 5.3 追踪影响

- 无后端 ⇒ **无法统计受影响用户数**；只能依据商店安装量 / 更新比例做粗估。
- 建议在安全事件中同时准备一份「影响评估 + 已采取措施」说明，附在 Issues 与商店更新日志中。

## 6. 相关文档

| 文档 | 用途 |
|------|------|
| [PRIVACY.md](../PRIVACY.md) | 公开隐私政策（提交表单的隐私政策 URL） |
| [store-listing.md](./store-listing.md) | 权限用途 / 单一用途 / 数据使用（商店字段） |
| [reviewer-reproduction.md](./reviewer-reproduction.md) | 审核员可复现步骤（含模型前提） |
| [v3-release-test-plan.md](./v3-release-test-plan.md) | 封板与发布测试清单 |
| [v3-minimal-release-plan.md](./v3-minimal-release-plan.md) | 本次发布的最小任务清单 |
