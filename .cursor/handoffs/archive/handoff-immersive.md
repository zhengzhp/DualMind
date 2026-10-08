# 交接：V1.5 沉浸式全文双语翻译（测试阶段）

> **已归档（V1.5 已封板）**：仅历史背景，按需检索、勿整体阅读；当前交接见 [../../handoff-agent-v3.md](../../handoff-agent-v3.md)。
> 生成于 2026-10-06。用途：开新会话时只带本文件即可接着干活，无需回读上一会话的数千行 E2E 日志。
> 上一会话完整记录：`agent-transcripts/fa68f8cd-04ef-41c2-a98c-853148b9413c.jsonl`（可按关键词检索回溯）。

> **更新（2026-10-07，V1.5 封板）**：第 3 节的 P0「译文回显」**已修复**；测试计数已过时（见下）。
> 最新验收快照、新增测试与仍存缺口一律以 `docs/decisions-v1.md`「V1.5 封板 · 测试补充与验收快照（2026-10-07）」为准。
> 现为 **Vitest 16 文件 / 137 用例；E2E 29 passed / 1 skipped**。

## 1. 当前状态

代码已实现完毕（M0–M5 全部完成），本轮做的事是**测试与验收**。

| 项目 | 结果 |
|------|------|
| `tsc --noEmit` | ✅ 通过 |
| Vitest | ✅ 10 文件 / 85 用例 |
| Playwright E2E | ✅ 23 / 23（含新增沉浸译 2 条） |
| `pnpm build`（wxt build） | ✅ 通过 |
| lint / zip | 未跑（按仓库约定默认不跑） |

**唯一未决事项：P0「译文回显」缺陷（见第 3 节），本轮刻意只记录不修。**

## 2. 关键决策与约束

- **V1 / V1.5 已冻结，只修 bug 不加功能**。沉浸译属 V1.5，历史决策见 `docs/decisions-v1.md` / `docs/architecture-v1.md`。
- **Feature 隔离是硬约束**：`features/immersive/` 不写 `translateSession`、不复用 `translate:*` 消息、不动 `TranslateService`。
- **仅 Background 可调 LLM**；`providers/` 永不碰 DOM。
- **渲染原则**：只追加兄弟节点，不改写原文；「仅译文」靠源元素标记 + `<html>` 类名隐藏原文，撤销即还原（表格单元格保持双语）。
- 本轮**未扩大任何权限**。

## 3. 未决 P0：译文回显（模型抄写）

**现象**：整页翻译后，部分块的「译文」与原文完全一致，UI 却报「翻译完成」——最糟的失败形态（用户以为成功了）。

**探针结论（已复现，非猜测）**：直接对 Ollama 发同一 Prompt，得到清晰边界：

| 场景 | 结果 |
|------|------|
| 纯英文 6 段批量 | 6/6 正确出中文 |
| 纯英文 3 段 / 1 段 | 3/3、1/1 正确 |
| 单段英文单独请求 | 正确 |
| **EN+ZH+FR+ES+EN 混排批量** | **只有第 1 段被翻译，法语/西语段原样回显** |

→ 结论：**Prompt 本身没问题**，是 `qwen-coder-8k:latest`（实为 `qwen2.5-coder:7b`，代码模型）在**多语混排批量**下会「抄写」；`translator.ts` 对此毫无校验。

**建议修法（按性价比排序，尚未实施）**：

1. **回显检测 + 单段兜底**：批内某段 `translation.trim() === source.trim()` 即判定未翻译，回退到已验证可靠的单段路径 `translateSingle`；仍失败则该段标记未翻译。（核心修复）
2. **批次内过滤已属目标语言的片段**：复用现成的 `features/translate/detectLang.ts`，别把中文段喂给模型——它正是诱发整批抄写的因素之一。
3. **按语言分组批次 / 下调 `MAX_SEGMENTS_PER_BATCH`（12 → 4~6）**：实测批次越小、语言越单一，正确率越高。
4. **模型推荐**：Options / 文档里为沉浸译标注推荐通用 instruct 模型；检测到 `-coder` 时提示翻译质量可能不佳。
5. **UI 兜底**：未翻译片段加淡显或角标；`Feature`、`Learn more` 这类短片段同样处理。

**回归护栏**：`e2e/immersive.e2e.ts` 已断言「≥5 块含中文」「主段落含中文」。修 P0 时请保持该断言，并补一条「译文 ≠ 原文」的用例。

## 4. 可复制命令

```bash
cd /Users/zhengzp/ai/DualMind
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"   # Node 22（本机默认是 18，pnpm 会报 engine 警告）

./node_modules/.bin/tsc --noEmit            # 类型检查
./node_modules/.bin/vitest run              # 单测（859ms）

# E2E：必须先重新构建，否则跑的是旧产物（这是踩过的坑）
./node_modules/.bin/wxt build
export PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright"
export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=mac-arm64          # 仅沙箱 shell 需要，见下
./node_modules/.bin/playwright test --reporter=list
./node_modules/.bin/playwright test e2e/immersive.e2e.ts    # 单跑沉浸译
```

**踩坑记录**：

- E2E **不进 CI**，依赖真实本地 Ollama（`http://127.0.0.1:11434`，模型 `qwen-coder-8k:latest`）。
- `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=mac-arm64` 只在**沙箱化 terminal** 里需要：沙箱把 `os.arch()` 报成 x64，Playwright 会去找不存在的 `chrome-mac-x64`；且 Chromium 在沙箱内会因 `xattr` 受限直接 SIGABRT。**自己的终端不需要这个变量**。
- 直接 `curl` Ollama 的 `/v1/chat/completions` 是排查模型行为的快通道，比开浏览器快得多。
- `.output/` 与用户正在运行的 `pnpm dev`（写 `chrome-mv3-dev`）互不冲突，可放心 `wxt build`。

## 5. 文件地图

**新增**

- `features/immersive/`：`types.ts`、`segmenter.ts`、`parse.ts`、`batch.ts`、`prompts.ts`、`translator.ts`、`client.ts`、`renderer.ts`、`controller.ts`、`dom.ts`、`mount.ts`、`ui/ImmersiveControl.tsx`，及 3 个单测
- `e2e/immersive.e2e.ts`：整页翻译 + 布局验收 + 禁用站点

**修改（沉浸译相关）**

- `entrypoints/background.ts`（Port 监听、命令路由、右键菜单）、`entrypoints/content.ts`（挂载）、`entrypoints/options/App.tsx`（设置区）
- `shared/storage/types.ts` + `settings.ts`（`local:immersivePrefs`）、`shared/messaging/protocol.ts`（`IMMERSIVE_PORT`）
- `features/translate/ui/WorkbenchApp.tsx`（侧栏嵌入控制区）

**本轮修的测试侧缺陷（非产品逻辑）**

- `e2e/fixtures.ts`：`seedSettings` 现在会一并写入 `local:migrations`。**不加会被产品迁移改写种子的 `toolbarTrigger: 'auto'`，导致 9 条划词用例全挂。** 取值由 `shared/storage/migrations.ts` 的 `MIGRATION_IDS` 派生（`Object.values`），新增迁移会自动覆盖，无需手工同步。
- `e2e/options.e2e.ts`：`刷新列表` 加 `exact: true`，避免与下拉空态提示文案冲突触发 strict mode。

**布局 E2E 的做法（复用时注意）**

`installFixture()` 先清空 `document.body`，但**必须保留 `DUALMIND-*` 的 shadow 宿主**（否则连内容脚本一起被清掉），再插入覆盖 `h1/p/ul/blockquote/pre>code/table/a` 的英文 fixture。断言：块紧跟源元素、单元格块落在单元格内、不遮挡原文、`pre>code` 不被翻译、无横向滚动、原文段落宽度零变化、还原后 `body.innerHTML` 逐字节一致。

**已知覆盖缺口**：布局用例是注入式 fixture，真实复杂布局（Grid/Flex 卡片流、粘性表头、站点自带样式冲突）未覆盖。
