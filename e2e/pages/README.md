# V3.0 封板测试页（T1–T7）

> 服务于 `docs/v3-release-test-plan.md` 第 4 节的「可控页面要求」。
> 全部为**本地虚构数据**：无真实凭据、不访问真实金融服务、不请求外网（ENV-02）。

## 启动

```bash
node e2e/pages/serve.mjs
# 主站：http://127.0.0.1:4173/
# 跨源：http://127.0.0.1:4174/   （同一份文件，仅端口不同 → 不同 origin，供 T6 跨域 iframe）
```

可用环境变量改端口（T6 的跨域 iframe 已硬编码 `127.0.0.1:4174`，改端口需同步页面）：

```bash
DM_PAGES_PORT=4173 DM_PAGES_CROSS_PORT=4174 node e2e/pages/serve.mjs
```

未在 `package.json` 增加脚本，避免触碰包管理配置（pnpm 工具链当前不可复现）。

## 观测约定

每个页面左下角有 **动作计数 + 动作日志** 面板（`assets/counters.js`）：

- 每条用例开始前点「重置计数」归零
- `window.dmTest.bump(name, detail?)` / `.reset()` / `.state()` 可供 E2E 直接断言
- `data-dm-counter` / `data-dm-count` 属性便于 Playwright 选择器断言

**判定原则**：以计数器和动作日志为准，不以 Agent 的自然语言摘要为准。

## 页面 → 用例映射

| 页面 | URL | 覆盖用例 |
| --- | --- | --- |
| T1 静态表单 | `/t1-static-form` | AG-03 / AG-07 ~ AG-11 / AG-13 / AG-14 / SEC-06 / SEC-08 |
| T2 危险页 | `/t2-danger` | SEC-01 ~ SEC-06 / SEC-19 |
| 金融路径 | `/checkout`、`/payment`、`/transfer` | SEC-02 |
| T3 动态页 | `/t3-dynamic` | SEC-09 ~ SEC-11 / SEC-16 / LIFE-11 / LIFE-12 |
| T4 等待页 | `/t4-waiting` | LIFE-04 / LIFE-06 / AG-12 |
| T5 长文页 | `/t5-long-text` | REG-01 ~ REG-09 / REG-13 / UI-11 |
| T6 限制页 | `/t6-limits` | UI-10 / SEC-08 |
| T6-2 CSP 页 | `/t6-csp` | UI-10 |
| T7 受控表单 | `/t7-react-form` | AG-09 |

## 需要留意的设计取舍

1. **T7 不是真实 React**：本仓库不把前端运行时引入测试页（避免新增依赖与打包步骤），
   而是用原生 JS **复现** React 受控输入的 value tracker 语义。
   ⚠️ **关键局限（曾导致误报 DM-V3-001，已撤回）**：本页脚本运行在**主世界**，
   而扩展内容脚本运行在**隔离世界**。React 的 tracker 装在**主世界的节点包装对象**上，
   隔离世界的 `node.value = x` 碰不到该属性，会落到原生 setter → tracker 记录滞后 →
   框架判定「有变化」并触发 `onChange`，**行为等价于「原生 setter 路径」**。
   因此本页中「受控:直写被判定为无变化并回写」只是**主世界机制演示**，
   **不能**用来判定扩展的 `fill` 是否有效；受控表单的真伪只能由真实扩展实测。
   页内提供「原生 setter 模拟真实输入」对照按钮，用于观察两条路径的差异。
2. **T6 跨源 iframe 依赖第二个端口**，必须通过 `serve.mjs` 访问；用 `file://` 打开会失去跨源语义。
3. **T6-2 的 CSP 页刻意不用 inline `<script>`**（否则连自己的计数器都加载不了），
   只保留一个 inline `onclick` 属性作为「应被 CSP 拦下」的样本。
4. **T2 的填充按钮**（90 个）用于把支付元素顶到快照上限（80）之外，验证 SEC-05
   「完整信息复核仍拒绝，不因截断放行」。

## Agent 专用 Playwright 用例（2026-10-08 新增）

Agent 用例**已自动化**，文件在 `e2e/`（不在本目录）：

| 文件 | 覆盖 |
| --- | --- |
| `e2e/mock-llm.ts` | 测试专用「OpenAI 兼容」mock（SSE + `tool_calls`、错误注入、`pick` 按文案解析 index），**零新增依赖** |
| `e2e/agent-plan.e2e.ts` | AG-03 / AG-05 / AG-16 / AG-18 / AG-19 / AG-04 |
| `e2e/agent-safety.e2e.ts` | SEC-01 / SEC-17 / SEC-06 |
| `e2e/agent-network.e2e.ts` | NET-04 / NET-06 / NET-07（+ PRIV-06 片段） |
| `e2e/agent-lifecycle.e2e.ts` | LIFE-01 / 02 / 03 / 05 / 08 / 11 / 16 |
| `e2e/agent-entry.e2e.ts` | AG-01 / AG-02 / UI-08 / UI-09 / UI-12 |

- 夹具（`e2e/fixtures.ts`）会**自动拉起**本目录的 `serve.mjs`；自管时设 `DM_SKIP_PAGES=1`。
- 用例通过 `page.evaluate(() => window.dmTest.reset())` 自动归零计数器，**不必手工点「重置计数」**。
- 纪律要求仍见测试清单第 5 节（`AUTO-*`）；mock 不替代 `NET-01` 的真 Provider 主路径。

## 尚未覆盖

- **Edge / Chrome 真实 Side Panel、真实模型 tool 调用**：必须人工或 `pnpm test:e2e:headed`，本目录不提供。
- **升级 / 干净安装 / 隐私与包内检查**（第 12～14 节）：与本目录无关，仍需按清单执行。
- **多窗口并发**：Playwright 持久化上下文是单窗口，相关 LIFE 项属「单窗口近似」。
