# DualMind 浏览器插件 · 技术架构（V1）

完整计划原稿见：[.cursor/plans/dualmind_插件架构_b3d3a25e.plan.md](../.cursor/plans/dualmind_插件架构_b3d3a25e.plan.md)  
决策摘要见：[decisions.md](./decisions.md)  
代理入口（边界与汇报约定）见：[AGENTS.md](../AGENTS.md)

## 定位

网页场景 AI 助手。V1 以翻译切入；后续扩展摘要/聊天/写作，再后置浏览器操作。

## 技术栈

- WXT 0.21 + React + TypeScript + Tailwind
- Chrome / Edge MV3
- BYOK：OpenAI Compatible + 本地 Ollama
- Node.js >= 22

## 目录结构

```text
entrypoints/          # background / content / sidepanel / options
features/
  translate/          # 翻译用例与 prompt
  selection-toolbar/  # 划词浮层
providers/            # Provider 适配层（不碰 DOM；支持 chatStream）
shared/
  llm/                # runChat / runChatStream 薄封装
  errors.ts           # 统一错误码与用户文案
  messaging/          # 类型安全消息 + 流式 Port
  storage/            # 设置与会话
```

Feature 契约表见：[features.md](./features.md)

## 核心原则

1. 只有 Background Service Worker 发起 AI 请求
2. Provider 永不碰 DOM；Content 只负责选区与浮层 UI
3. 能力按 Feature 分包；Chat / Agent 平行扩展，不塞进 TranslateService
4. 权限按版本渐进；Ollama 显式声明本机 `11434` 端口
5. Feature 经 `shared/llm` 调模型；错误经 `shared/errors` 映射文案

## 数据流（划词翻译 · 流式）

Content / Side Panel → Port `dualmind-translate` → Background → `translateTextStream` → `runChatStream` → Provider SSE → chunk 回写 Session + Port → UI（可 abort）

一次性路径：`translate:run`（右键菜单等）仍可用。

## 里程碑状态

- [x] 脚手架
- [x] Provider（OpenAI Compatible + Ollama）
- [x] TranslateService + messaging
- [x] 划词工具栏
- [x] Side Panel 工作台
- [x] Options 设置页
