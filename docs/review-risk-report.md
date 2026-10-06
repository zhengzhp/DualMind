# DualMind 审核风险报告（Chrome Web Store / Edge Add-ons）

> 日期：2026-10-06
> 范围：提交商店审核前需要消除的合规 / 可验证性风险
> 方法：核对**构建产物** `.output/chrome-mv3/manifest.json`、`wxt.config.ts`、`docs/store-listing.md`、全仓检索远程代码与隐私文件
> 状态：**仅诊断，未改动任何代码或 manifest**；按 [decisions.md](./decisions.md)「发布与验证节奏」，实际提审后置到 V3 完成后统一执行

## 一、结论摘要

**代码层面没有硬伤**：无远程代码、无遥测、权限已收敛、无 `web_accessible_resources`。
**风险几乎全部集中在「提审材料」与「审核环境可验证性」**，其中 3 条（P0）不解决大概率被退回。

| 结论 | 说明 |
|------|------|
| 可安全提交的前提 | 补齐隐私政策 URL + 审核员可复现说明 + 数据使用披露与隐私政策逐条对齐 |
| 最大单一风险 | 功能强依赖 BYOK（用户 Key 或本机 Ollama），**审核员默认拿不到任何可用端点** |
| 代码侧唯一实质争议 | `host_permissions: <all_urls>` 的论证口径（是否改用 `optional_host_permissions`） |

## 二、审核维度核对表（基于证据）

| 维度 | 现状 | 证据 | 判定 |
|------|------|------|------|
| 远程代码（Remote code） | 无 `eval` / `new Function` / `createElement('script')` 远程注入 | 全仓检索仅命中测试 mock 与 `innerHTML` 展示纯文本 | ✅ 可填「否」 |
| 遥测 / 埋点 | 无 | 全仓无相关依赖与上报逻辑 | ✅ |
| 权限最小化 | 仅 `storage` / `sidePanel` / `contextMenus` | `.output/chrome-mv3/manifest.json` | ✅ 无 `activeTab` / `scripting` |
| 攻击面 | 无 `web_accessible_resources` | 同上 | ✅ |
| 隐私政策 | **缺失** | 全仓无 `privacy*` 文件；manifest 无 `homepage_url` | ❌ P0 |
| 单一用途 | description 过宽 + 侧栏仅占位的 Chat / Agent | `wxt.config.ts` description；`features/translate/ui/WorkbenchApp.tsx:591-602` | ⚠️ P1 |
| 数据使用披露 | 未声明「网页正文外发」 | `docs/store-listing.md` 有描述但无隐私政策可对齐 | ❌ P0 |
| 审核可验证性 | 强依赖用户自带端点 | `host_permissions` 含 `127.0.0.1:11434`；`Options` 需填 Key | ❌ P0 |
| 浏览器版本兼容 | 无 `minimum_chrome_version` | 产物 manifest 无该字段；`sidePanel` 需 Chrome 114+ | ⚠️ P1 |
| 内容脚本注入范围 | 无 `exclude_matches` | 产物 manifest `content_scripts.matches: ["<all_urls>"]` | ⚠️ P2 |

## 三、风险清单

### P0 —— 不解决大概率退回

#### P0-1 没有隐私政策

- **证据**：全仓无 `privacy*` 文件；manifest 无 `homepage_url`；`docs/store-listing.md` 只覆盖用途说明，没有隐私政策正文或链接。
- **影响**：Chrome / Edge 对**传输用户数据**的扩展强制要求隐私政策 URL，后台为必填项，缺失直接卡提交。
- **建议**：新增 `docs/privacy-policy.md` 并发布到可公开访问的 URL（GitHub Pages / gist / 项目站点），再把 URL 填入商店后台与 manifest `homepage_url`。

#### P0-2 审核环境无法跑通功能

- **证据**：翻译能力 100% 依赖用户配置 —— `Options` 需自填 OpenAI 兼容 Key，或依赖本机 `127.0.0.1:11434` Ollama（manifest 已声明该 host permission）。
- **影响**：审核员默认既没有 Key、也不会在审核机架起本地 Ollama → 易判「扩展不可用 / 依赖付费第三方服务」。这是 BYOK 类扩展最常见的拒因。
- **建议**：在商店后台「Notes for reviewers」提供**免费且无需注册**的复现路径（见第四节草稿），并明确「不依赖付费服务、不依赖注册账号」。

#### P0-3 数据使用披露与隐私政策不一致

- **证据**：会把**网页正文 / 选中文本**从 Background 发送到用户配置的外部端点；`docs/store-listing.md` 声明「无自有后端、不中转」。
- **影响**：Dashboard「Data usage」须勾选 Website content（及可能的 User activity）并承诺不售卖，且与隐私政策逐条一致；不一致会被退回。
- **建议**：按第五节清单逐条勾选并交叉核对，保证三处（后台表单 / 隐私政策 / `store-listing.md`）表述一致。

### P1 —— 可能被追问，修复成本低

#### P1-1 `<all_urls>` host 权限的论证口径

- **证据**：`wxt.config.ts:19-24`；`decisions.md` 的保留理由是「反正 `content_scripts` 也是 `<all_urls>`，安装警告不变」。
- **问题**：这是**内部工程理由**，不是审核口径。Chrome 期望用户可配端点走 `optional_host_permissions` 按需申请。
- **建议（二选一，均需先更新 `decisions.md`）**：
  1. 保持现状，准备一份面向审核员的 `host_permissions` 论证（推荐，成本最低）；
  2. 改造为 `optional_host_permissions` + 运行时申请。注意 `decisions.md:78` 已记录：因 `content_scripts.matches` 仍是 `<all_urls>`，**安装警告不变**，收益有限且多一处运行时失败点。

#### P1-2 description 过宽，触碰单一用途

- **证据**：manifest description = `AI 浏览器助手 — 划词翻译 / Side Panel / 本地 Ollama`。
- **问题**：「AI 浏览器助手」+ `<all_urls>` + 侧栏「工作台」（`WorkbenchApp.tsx` 含 Chat / Agent 占位）容易被判"用途过宽"。
- **建议**：改为纯翻译表述（如「划词与整页双语翻译，支持自带模型」），并在审核说明里说明 Chat / Agent 仅为占位、无实际能力。**零代码成本**。

#### P1-3 缺 `minimum_chrome_version`

- **证据**：产物 manifest 无该字段；`sidePanel` 需 Chrome 114+。
- **影响**：老版本浏览器上 `chrome.sidePanel` 为 `undefined`，可能抛错，reviewer 视为兼容性缺陷。
- **建议**：`wxt.config.ts` 增加 `minimum_chrome_version: '114'`。

### P2 —— 建议准备口径，非阻塞

| 项 | 证据 | 建议 |
|----|------|------|
| `store-listing.md` 把 `commands` 列为「权限」 | 产物 `permissions` 无 `commands`（它只是 manifest key） | 后台表单里改为「快捷键」条目，避免照抄造成困惑 |
| 无 `homepage_url` / 支持链接 | manifest 无 | 补项目页 / 支持渠道；Edge 对此更严 |
| `content_scripts` 无 `exclude_matches` | 对网银 / 管理后台同样注入 | 划词类扩展的品类固有问题，准备口径而非改代码 |

## 四、审核员可复现说明（草稿，可直接粘贴后台）

> 建议放在商店后台「Notes for reviewers」，目标是把 P0-2 从「不可用」变成「两分钟可验」。

```text
How to verify (no payment, no account required)

1. Install the extension.
2. Open the Options page and pick "OpenAI Compatible" (or "Local Ollama").
3. Provide a model endpoint:
   - OpenAI Compatible: any free / self-hosted endpoint that speaks the
     OpenAI /v1/chat/completions API (e.g. a local llama.cpp or vLLM server,
     or a free-tier provider). Enter Base URL, model name and API key if needed.
   - Local Ollama: run `ollama serve` locally and pull any model,
     e.g. `ollama pull qwen2.5:7b`. The extension talks to
     http://127.0.0.1:11434 by default.
4. Select any text on a web page, then press Alt/Option+K (default hotkey) or
   right-click → "Translate with DualMind".
   Expected: a translation popup appears next to the selection.
5. Right-click → "Translate full page with DualMind" to verify immersive
   bilingual translation; click the floating button again to revert.

Notes
- No developer-operated backend. Selected text / page text is sent only from
  the background service worker directly to the endpoint YOU configured.
- No telemetry, no analytics, no data collection.
- The Chat / Agent tabs in the side panel are placeholders and perform no
  network requests.
```

## 五、数据使用披露对齐清单（三处必须一致）

提交前逐条核对「商店后台表单 / 隐私政策 / `docs/store-listing.md`」：

- [ ] 是否收集 / 传输**网页内容**（Website content）：是 —— 仅当前选区与用于翻译的可见正文
- [ ] 是否传输**用户活动**（User activity）：视表单口径而定，按最小化如实勾选
- [ ] **不**收集浏览历史、身份信息；**无**遥测 / 埋点
- [ ] 承诺不将数据用于**与单一用途无关**的目的，不出售给第三方
- [ ] 明确数据接收方 = **用户自行配置的第三方端点**（DualMind 无自有后端、不中转）
- [ ] API Key 仅存浏览器本地 `storage`，仅 Background 读取，不注入内容脚本
- [ ] 「Remote code」= 否
- [ ] 隐私政策 URL 与 `homepage_url` 已填写且可公开访问

## 六、不确定 / 需进一步确认

- **Chrome 对 localhost host permission 的审查力度**：`http://127.0.0.1:11434/*` 规则上需说明用途，近年对 localhost 相对宽松；本报告按「中低风险」计，无更强证据可断言。
- **reviewer 是否实机跑通**：Chrome 文档称审核员会验证功能，实际执行力度不确定，故 P0-2 列为 P0 而非「必然被拒」。
- **Edge 与 Chrome 的口径差异**：Edge 对隐私政策与支持渠道更严格，具体字段以提交时后台为准。

## 七、建议执行顺序（均待 V3 完成后统一进行）

| 顺序 | 行动 | 改代码？ |
|------|------|----------|
| 1 | 新增隐私政策并拿到公网 URL | 否 |
| 2 | 补齐「Notes for reviewers」+ 数据使用披露对齐 | 否 |
| 3 | description 收窄为纯翻译表述 | 是（`wxt.config.ts`） |
| 4 | 补 `minimum_chrome_version: '114'` | 是（`wxt.config.ts`） |
| 5 | 校正 `store-listing.md` 的 `commands` 条目 | 否（文档） |
| 6 | （可选）评估 `optional_host_permissions` 改造 | 是（需先更新 `decisions.md`） |

## 八、复核依据（证据来源）

- `.output/chrome-mv3/manifest.json`（构建产物，权限 / description / 缺失字段）
- `wxt.config.ts:1-43`（权限声明与 description 来源）
- `docs/store-listing.md`（现有上架材料）
- `docs/decisions.md:72-78`（`<all_urls>` 的保留理由与替代方案评估）
- `features/translate/ui/WorkbenchApp.tsx:591-602`（Chat / Agent 占位）
- 全仓检索：`eval(` / `new Function` / `createElement('script')` / `privacy*` / `optional_host_permissions` / `minimum_chrome_version` / `homepage_url` / `web_accessible_resources`
