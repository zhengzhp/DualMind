# DualMind 浏览器插件 · 技术架构（V1）

完整计划原稿见：[.cursor/plans/dualmind_插件架构_b3d3a25e.plan.md](../.cursor/plans/dualmind_插件架构_b3d3a25e.plan.md)  
决策摘要见：[decisions.md](./decisions.md)

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
providers/            # Provider 适配层（不碰 DOM）
shared/
  messaging/          # 类型安全消息
  storage/            # 设置与会话
```

## 核心原则

1. 只有 Background Service Worker 发起 AI 请求
2. Provider 永不碰 DOM；Content 只负责选区与浮层 UI
3. 能力按 Feature 分包；Chat / Agent 平行扩展，不塞进 TranslateService
4. 权限按版本渐进；Ollama 显式声明本机 `11434` 端口

## 数据流（划词翻译）

Content 选区 → Messaging → Background → TranslateService → Provider → LLM → 回写 Session / 浮层

## 里程碑状态

- [x] 脚手架
- [x] Provider（OpenAI Compatible + Ollama）
- [x] TranslateService + messaging
- [x] 划词工具栏
- [x] Side Panel 工作台
- [x] Options 设置页
