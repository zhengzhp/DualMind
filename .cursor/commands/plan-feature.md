# 规划功能

针对用户在命令后描述的需求，先做方案再动手（默认不要直接改代码，除非用户明确说「直接实现」）。

## 步骤

1. 对照 `docs/decisions.md`（**当前权威 = V3 已立项**）：是否落在 V3.0 范围？扩大范围或 V3.1+ / PDF 等视为越界，先提示并再立项；已封板的 V1～V2 仅 bugfix（见 `docs/decisions-v2.md` / `docs/decisions-v1.md`）
2. 指出会动到的目录：`entrypoints/` / `features/` / `providers/` / `shared/`
3. 给出 3～6 步实现计划与风险点
4. 列出需要用户确认的 1～2 个关键决策（若有）

## 约束提醒

- 仅 Background 调 AI；Provider 不碰 DOM
- Chat / Agent 能力不得混进翻译服务（Chat 走 `features/chat/`，消息前缀 `chat:*`）
- 不随意扩大扩展权限
- 验证节奏见 `.cursor/commands/verify.md`「改动 → 最小验证」；**Ask first** 仍适用于 test / build / compile

用简体中文输出。
