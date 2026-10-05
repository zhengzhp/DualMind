# 代码审查

对当前对话中 @ 引用的文件，或用户在命令后补充的路径/选区，做一次聚焦审查。

## 审查重点

1. 正确性与边界（空值、loading、错误态）
2. 是否违反 DualMind 架构与 `AGENTS.md` 的 **Never** 清单：
   - Content Script 是否直连 LLM / 持有 API Key
   - Provider 是否碰了 DOM
   - 新逻辑是否错误塞进 `TranslateService`，或 Chat/Agent 混入翻译链路
3. TypeScript / React 可读性与中文注释是否覆盖核心逻辑
4. 权限与安全（密钥、host_permissions 膨胀）

## 输出格式

- **结论**：通过 / 需修改
- **问题列表**：按严重程度（高/中/低）列出，每项含文件路径与建议改法
- **不必改**：明确写出可忽略项，避免过度工程

遵守 `AGENTS.md`、`docs/decisions.md` 与 `.cursor/rules/`。用简体中文回复。
