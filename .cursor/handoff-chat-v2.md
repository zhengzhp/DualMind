# 交接：V2 网页摘要 / 网页问答（功能已可用，待实机验收）

> 生成于 2026-10-07，承接 V1.5 交接（[handoff-immersive.md](./handoff-immersive.md)）之后。
> 用途：开新会话只带本文件即可接着干，无需回读上一会话记录。
> 上一会话完整记录：`agent-transcripts/65765c36-a4d0-4614-a93c-a0e4e0c215f1.jsonl`（可按关键词检索回溯）。

> **当前进度**：V2 主链路（摘要 + 问答 + 会话持久化 + 右键入口）代码全部落地，`tsc` / 单测双绿。
> **未做**：实机验收、E2E、`wxt build`。**3 个提交尚未 push**（见第 1 节）。
> 权威契约以 `docs/features.md` 为准，决策以 `docs/decisions.md` 为准；本文件只是导航 + 坑位。

## 1. 当前状态

| 项目 | 结果 |
|------|------|
| `tsc --noEmit` | ✅ 0 错误 |
| Vitest | ✅ **19 文件 / 169 用例**（其中本轮新增 **32 条**：`chatSessions` 18 / `prompts` 7 / `budget` 7） |
| `pnpm build`（wxt build） | ⬜ **未跑**（按 `docs/decisions.md` 后置到 V3 后） |
| E2E | ⬜ **未跑**，且 chat 用例**尚未编写**（第 6 步） |
| 实机（Chrome）验收 | ⬜ **未做** —— 见第 6 节「请用户验证」 |
| git | 工作区**干净**；`main` **领先 `origin/main` 3 个提交，未 push** |

### 提交清单（本轮，最新在上）

| commit | 内容 | push |
|--------|------|------|
| `e4b9e61` | feat(chat): 右键菜单「总结本页」，经 storage 信箱交给侧栏执行 | ❌ 未 push |
| `baecbac` | feat(chat): 接入 Chat 面板，聊天 Tab 由占位替换为可用 UI | ❌ 未 push |
| `2cce185` | feat(chat): 落地 V2 摘要/聊天契约、会话存储与流式 Port | ❌ 未 push |
| `83f4452` | docs(plans): 新增文档版本化切换 SOP | ✅ 已 push |
| `06fa9be` | refactor(page-content): 抽出沉浸译与聊天共用的正文采集层 | ✅ 已 push |
| `e426850` | docs: 按版本拆分 V1/V2 文档并登记 V2 契约 | ✅ 已 push |

> 3 个 chat 提交共 **23 文件 / +2101 行**。要 push 前建议先在 Chrome 里过一遍第 6 节流程。

## 2. V2 计划进度（6 步）

| 步骤 | 内容 | 状态 |
|------|------|------|
| 前置 | V1/V2 文档拆分（活文档沿用旧名，归档加 `-v1` 后缀） | ✅ `e426850` |
| 第 2 步 | `features/page-content/` 等价重构（`segmenter` 从 immersive 抽出） | ✅ `06fa9be` |
| 第 3 步 | `chat:*` 消息协议 + `local:chatPrefs` / `local:chatSessions` + Background Port | ✅ `2cce185` |
| 第 4 步 | `features/chat/prompts.ts` + `service.ts`（消息组装 + `runChatStream`） | ✅ 已并入 `2cce185` |
| 第 5 步 | UI：`ChatPanel` + `SessionList` + `useChat`，接入「聊天」Tab | ✅ `baecbac` |
| 附加（计划外） | 右键菜单「总结本页」+ `local:chatPending` 信箱 | ✅ `e4b9e61` |
| 第 6 步 | 测试：单测 ✅ / **E2E ⬜ 未写** | ⏳ 部分完成 |

> 原 V2 计划**没有落成文件**（只存在于上一会话与 `docs/decisions.md` 的决策表里）；本节的步骤表就是它的落地快照。

## 3. 关键决策与约束（改代码前必读）

沿用 V1 铁律，V2 新增约束：

- **仅 Background 调 LLM / Ollama**；`providers/` 永不碰 DOM；Content Script 只读 DOM，不持有 API Key、不直连模型。
- **Feature 隔离**：`features/chat/` 不写 `translateSession`、不复用 `translate:*`、不动 `TranslateService`。反之亦然。
- **权限不扩大**：复用现有 `<all_urls>` content script，未引入 `scripting` / `activeTab`。右键菜单复用已有 `contextMenus` 权限。
- **正文不落 storage**：页面正文只随消息保存已发送的上下文片段，不作为独立快照持久化。
- **共享提取层不是 Feature**：`features/page-content/` 无消息前缀、不写 storage，被 `chat` 与 `immersive` 共用。
- **会话容量**：50 会话 / 每会话 200 条，超限淘汰最旧。纯逻辑在 `shared/storage/chatSessions.ts`（可单测）。
- **上下文预算**：`maxContextChars` 默认 12000，按段累加截断（不切半段；首段超预算至少保留一段）。
- **会话切换与在途流式**：新建 / 切换会话**中断**在途流式；所有异步回写先比对会话 id，**迟到回包直接丢弃**。
- **右键菜单入口**：Background 写信箱 `local:chatPending`（消费即清 + TTL 30s），由**常驻的 `WorkbenchApp`** 消费并切到聊天 Tab 再下发 —— `ChatPanel` 仅在聊天 Tab 挂载，用户停在「翻译」Tab 时会漏事件。

> 新增了 3 条决策到 `docs/decisions.md`（上下文读取时机 / 会话切换与迟到回包 / 右键菜单信箱），改契约时同步更新。

## 4. 契约速查

**消息**（`shared/messaging/protocol.ts`）

```
chat:prefs:get | chat:prefs:save
chat:sessions:list | chat:sessions:get | chat:sessions:upsert | chat:sessions:delete | chat:sessions:clear
chat:context            # BG → 活动标签页转发 content:chat-extract，取选区 / 整页正文
content:chat-extract    # BG → Content（tabs.sendMessage），返回 ChatContextPayload | null
```

**Port**：`dualmind-chat`（`CHAT_PORT`）
`start{requestId,context,history,question}` / `abort{requestId}` → `chunk{text,accumulated}` / `done{content}` / `error{code,message}`

**storage**

| key | 形状 | 说明 |
|-----|------|------|
| `local:chatPrefs` | `{ contextScope: 'page'\|'selection', maxContextChars }` | 默认 `page` / 12000 |
| `local:chatSessions` | `ChatSession[]` | 全局列表，每条含 `pageUrl` / `pageTitle` / `turns` |
| `local:chatPending` | `ChatPendingAction \| null` | 右键信箱，取过即清，TTL 30s |

> 命名坑：Provider 入参类型 `ChatMessage` 已存在于 `providers/types.ts`（`{role,content}`）；入库形状刻意叫 **`ChatTurn`**（多 id / 时间戳 / error）。别混用。

## 5. 未决产品问题（等用户拍板，勿擅自选）

1. **会话与页面的语义未强绑定**：会话记录了 `pageUrl` / `pageTitle`，但重开旧会话后提问，上下文取的是**当前活动标签页**，未必是会话当初那页。现状只在面板显示「会话来源」提示，不拦不确认。
   - 候选：按 `pageUrl` 不匹配就禁用发送 / 不匹配时提示「仍要继续？」/ 忽略（现状）。
2. **右键菜单与 `disabledHosts`**：菜单项全站可见，在内容脚本被禁用的站点上点它只会得到「未能读取页面内容」。要不要按站点隐藏/禁用菜单项。

## 6. 请用户验证（实机，我无法替代）

前置：`pnpm dev` → 已配好 Provider（OpenAI 兼容或本地 Ollama）→ **刷新目标网页**（内容脚本新增了 `content:chat-extract` 监听，不刷新跑不到）。

1. **聊天主链路**：侧栏 → 「聊天」Tab → 「总结本页」→ 是否流式逐字返回；「停止」是否即时中断。
2. **上下文状态行**：应显示「整页 · N 段」；切到「选区」并在页面选中文字后点「重新读取」→ 应显示「选区」。
3. **历史持久化**：提问后关闭侧栏再打开 → 「历史」里会话仍在。
4. **右键菜单**：右键「用 DualMind 总结本页」→ 侧栏是否**自动打开 + 自动切聊天 Tab + 自动提问**，且**只触发一次**。
5. **布局**：侧栏消息区限高 `max-h-[46vh]` 是否合适（输入框未钉底，见第 8 节）。
6. 全页工作台（`/workspace.html`）同路径走一遍，检查消息区是否撑满高度。

> 涉及**真实 Side Panel** 的验证，若要跑 E2E 请用 **`pnpm test:e2e:headed`**（`E2E_HEADED=1`）—— 无头下真实侧栏用例会自动 skip。

## 7. 可复制命令

```bash
cd /Users/zhengzp/ai/DualMind
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"   # 本机默认 node 是 18，仓库要求 >=22

./node_modules/.bin/tsc --noEmit          # 类型检查（本轮每步都跑，0 错误）
./node_modules/.bin/vitest run            # 单测（19 文件 / 169 用例）

# E2E：必须先重新构建，否则跑的是旧产物（踩过的坑）
./node_modules/.bin/wxt build
./node_modules/.bin/playwright test --reporter=list
```

**踩坑（沿用 V1.5 交接，仍有效）**：

- E2E **不进 CI**，依赖真实本地 Ollama（`http://127.0.0.1:11434`）。
- `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=mac-arm64` 只在**沙箱化 terminal** 里需要：沙箱把 `os.arch()` 报成 x64，Playwright 会去找不存在的 `chrome-mac-x64`。**自己的终端不需要**。
- `.output/` 与用户正在跑的 `pnpm dev`（写 `chrome-mv3-dev`）互不冲突，可放心 `wxt build`。
- 直接 `curl` Ollama 的 `/v1/chat/completions` 是排查模型行为的快通道，比开浏览器快得多。

## 8. 文件地图与已知缺口

**新增（chat）**

- `features/chat/`：`types.ts`（运行时类型 + 持久化形状转出）、`prompts.ts`（系统提示 / 上下文拼装 / 历史裁剪）、`service.ts`（`answerQuestion`）、`client.ts`（Port 客户端）、`extract.ts`（内容脚本侧提取）、`mount.ts`（注册监听）、`ui/{ChatPanel.tsx,SessionList.tsx,useChat.ts}`，及 `prompts.test.ts`
- `features/page-content/budget.ts`（+ `.test.ts`）：字符预算截断，chat 与 immersive 共用

**新增（shared 侧）**

- `shared/storage/chatSessions.ts`（+ `.test.ts`）：容量裁剪 / 摘要 / `updateTurn`（纯函数，18 条用例）
- `shared/storage/types.ts`：`ChatPrefs` / `ChatTurn` / `ChatSession` / `ChatSessionSummary` / `ChatPendingAction`
- `shared/storage/settings.ts`：`chatPrefsItem` / `chatSessionsItem` / `chatPendingItem` + 9 个异步封装
- `shared/messaging/protocol.ts`：8 条 `chat:*` + `CHAT_PORT` + 两组 Port 消息类型

**修改**

- `entrypoints/background.ts`：`forwardChatContext()` + 8 个 handler + `attachChatPort()`（多 `requestId` 并发、独立 abort、主动取消不回错误）+ 菜单项 `dualmind-chat-summarize`
- `entrypoints/content.ts`：`mountChatContext()`
- `features/translate/ui/WorkbenchApp.tsx`：chat Tab 接入面板；**副标题随 Tab 变化**（原先在聊天页仍显示「翻译」）；常驻消费右键信箱

**已知覆盖缺口 / 技术债**

| 项 | 说明 |
|----|------|
| `extract.ts` 无单测 | 依赖真实 DOM；逻辑已尽量下沉到 `budget.ts`（7 条用例）。仓库未引入 jsdom |
| `chatPending` 无单测 | 依赖 `wxt/utils/storage`，仓库未做 storage mock（`migrations.test.ts` 只测纯函数） |
| `chat:context` 的活动标签页查找 | 沿用 immersive 的 `tabs.query({active,currentWindow})`，无头多标签下不可靠（V1 已记录的盲区） |
| 侧栏消息区限高 `max-h-[46vh]` | Side Panel 外层是 `min-h-screen`（无固定视口高度），`flex-1` 会被内容撑开。想「输入框钉底」需改成 `h-screen overflow-hidden`，但那会连带改翻译 Tab 的滚动行为 —— 属跨 Tab 改动，未擅自做 |
| 上下文每会话只读一次 | 页面中途变化（SPA 路由切换）不会自动重读，需用户点「重新读取」 |
| `ChatPendingAction` TTL 30s | 值是我拍的；若侧栏打开慢于 30s 会被判过期而丢弃，表现为「右键没反应」 |
| V2 里程碑 | `docs/architecture-v2.md` 仍标「进行中」；封板时记得连同 `docs/store-listing.md` 的权限用途一起复核 |

## 9. 下一步（按优先级）

1. **实机验收**（第 6 节）—— 这是「未验证」清单里唯一必须人工做的。
2. **push 3 个提交**（验收通过后）。
3. **第 6 步 E2E**：写 chat 用例（`e2e/` 下）。注意 `e2e/fixtures.ts` 的 `seedSettings` 需一并写 `local:migrations`（否则产品迁移会改写种子的 `toolbarTrigger`，V1.5 踩过，9 条划词用例全挂）。
4. **拍板第 5 节两个未决产品问题**，写进 `docs/decisions.md` 再实现。
5. V2 封板时：按 [dualmind-docs-versioning.plan.md](./plans/dualmind-docs-versioning.plan.md) 走文档版本化 SOP（届时归档 `-v2`）。
