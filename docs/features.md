# DualMind Feature 契约表

> 新能力先填本表再写码，避免 messaging / storage 膨胀成杂货铺。  
> 代理入口见 [AGENTS.md](../AGENTS.md)。

## V1 会话边界

- **translateSession**：仅当前一次选区 / 工作台会话（含流式中间态）
- **不做**：跨页历史、云同步、多会话列表

## Feature 一览

| Feature | 目录 | 入口消息 / Port | 写入 storage | UI 入口 | 状态 |
|---------|------|-----------------|--------------|---------|------|
| translate | `features/translate/` | `translate:run`（一次性）；Port `dualmind-translate`（流式 + abort） | `local:translateSession`；Side Panel 快速切换经 `settings:save` / `provider:listModels` | 划词浮层、Side Panel 翻译页（可切换 Provider/模型）、右键菜单 | V1 可用 |
| selection-toolbar | `features/selection-toolbar/` | 经上述 translate Port / `selection:push` / `sidepanel:open` | 不直接写 Key；经 BG 更新 session | Content Shadow DOM 浮层（稳定骨架 + floating-ui 定位；外部点击 / Esc / 关闭按钮收起） | V1 可用 |
| chat | （未建） | 待定，须独立消息前缀 `chat:*` | 待定，禁止复用 translateSession 语义 | Side Panel 占位 | V1 不做 |
| agent | （未建） | 待定，须独立权限与强确认 | 待定 | Side Panel 占位 | V1 不做 |

## LLM 调用约定

- 仅 Background 调用 `shared/llm/run.ts`（`runChat` / `runChatStream`）
- Feature 不得直接 `createProviderFromSettings`（Background 的 listModels / test 除外）
- Provider 永不碰 DOM；错误经 `shared/errors` 统一码与文案

## 新增 Feature 检查清单

1. 是否落在 `features/<name>/`（prompts / service / types）
2. 是否新增独立消息前缀，而非塞进 `translate:*`
3. 是否误把逻辑放进 `TranslateService`
4. 是否需要扩大 `host_permissions`（需 Ask first）
5. 是否更新本表与 `docs/decisions.md`
