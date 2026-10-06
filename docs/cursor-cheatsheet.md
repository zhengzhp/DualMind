# Cursor 常用命令速查

> DualMind 项目文档 · macOS 优先 · 版本差异处以客户端 `⌘⇧P` → Keyboard Shortcuts 为准  
> 官方参考：[Keyboard Shortcuts](https://cursor.com/docs/reference/keyboard-shortcuts)

---

## 一分钟记忆卡

| 快捷键 | 作用 |
|--------|------|
| `⌘L` / `⌘I` | 打开侧边 AI 面板 |
| `⌘K` | Inline Edit |
| `⌘E` | Agent 布局 |
| `⌘.` | 模式菜单（Ask / Agent / Plan…） |
| `⌘/` | 切换模型 |
| `Tab` | 接受 Tab 补全 |
| `⌘⇧P` | 命令面板 |
| `@` | 引用上下文 |
| `/` | 斜杠命令 |

Windows：多数将 `⌘` 换成 `Ctrl`。

---

## 核心快捷键

### 全局

| 功能 | macOS |
|------|-------|
| 切换 AI 侧栏 | `⌘I` / `⌘L` |
| Agent 布局 | `⌘E` |
| 模式菜单 | `⌘.` |
| 切换模型 | `⌘/` |
| Cursor 设置 | `⌘⇧J` |
| 通用设置 | `⌘,` |
| 命令面板 | `⌘⇧P` |
| 语音模式 | `⌘⇧Space` |

### 聊天输入

| 功能 | macOS |
|------|-------|
| 发送 / 轻推 | `Enter` |
| 强制立即发送 | `⌘Enter` |
| 排队消息 | `CtrlEnter` |
| 取消生成 | `⌘⇧Backspace` |
| 切换 Agent 模式 | `⇧Tab` |
| 新对话 | `⌘N` / `⌘R` |
| 新标签对话 | `⌘T` |
| 上/下一段对话 | `⌘[` / `⌘]` |
| 关闭对话 | `⌘W` |
| 接受全部改动 | `⌘Enter`（有建议时） |
| 拒绝全部改动 | `⌘Backspace` |

### 选区

| 功能 | macOS |
|------|-------|
| 选区加入 Chat | `⌘⇧L` |
| 选区 Inline Edit | `⌘⇧K` |
| 选区开新 Chat | `⌘L` |
| Tab 建议按词接受 | `⌘→` |

---

## `@` 引用

输入 `@` 后可选：文件、文件夹、Code、Codebase、Docs、Web、Git、历史对话等（以菜单为准）。

---

## 内置 `/` 命令（客户端 / CLI 常见）

| 命令 | 作用 |
|------|------|
| `/summarize` | 压缩对话上下文 |
| `/side` / `/btw` | 侧边小问，不打断主任务 |
| `/goal` | 长期目标 |
| `/plan` | Plan 模式 |
| `/ask` | 只读提问 |
| `/clear` | 新开对话 |
| `/fork` | 分叉当前对话 |
| `/rewind` | 回到之前某条消息 |

具体列表以输入 `/` 后的下拉为准。

---

## 本项目自定义 `/` 命令

定义位置：[`.cursor/commands/`](../.cursor/commands/)。在 Agent 输入框键入 `/` 即可选用。

| 命令 | 文件 | 用途 |
|------|------|------|
| `/review` | `review.md` | 代码审查（含 DualMind 架构检查） |
| `/explain` | `explain.md` | 解释代码与调用链 |
| `/plan-feature` | `plan-feature.md` | 按 V1 边界规划功能 |
| `/fix` | `fix.md` | 排查并最小修复 |
| `/add-provider` | `add-provider.md` | 新增 AI Provider |
| `/arch-check` | `arch-check.md` | 架构合规检查 |
| `/commit-msg` | `commit-msg.md` | 起草 commit message（默认不直接提交） |
| `/test-plan` | `test-plan.md` | 生成手工测试清单 |

### 用法示例

```text
/review @entrypoints/background.ts
/plan-feature 增加网页沉浸式双语对照
/fix Ollama 检测连接一直失败
/add-provider DeepSeek，Base URL 兼容 OpenAI
/arch-check
/commit-msg
```

命令名后的文字会作为额外上下文传给提示词。

### 如何新增自定义命令

1. 在 `.cursor/commands/` 新建 `命令名.md`（kebab-case）
2. 文件正文即提示词（建议纯 Markdown）
3. 在 Agent 输入 `/` 验证是否出现
4. 同步更新本表

---

## 设置与规则

| 入口 | 位置 |
|------|------|
| Cursor 设置 | `⌘⇧J` |
| 快捷键 | `⌘R` `⌘S` 或搜 Keyboard Shortcuts |
| 项目规则 | `.cursor/rules/*.mdc`（始终 / 按 glob 注入） |
| 代理入口 | `AGENTS.md`（优先级、Always / Ask first / Never、完成报告） |
| 决策 / 架构 | `docs/decisions.md`、`docs/architecture-v1.md` |
| 自定义 `/` 命令 | `.cursor/commands/*.md` |

---

## Agent 建议工作流

1. 大需求先 `/plan-feature` 或切 Plan 模式  
2. 用 `@` 挂上相关文件与规则  
3. 实现后 `/arch-check` 或 `/review`  
4. `/test-plan` 自测 → `/commit-msg` → 确认后再提交
