# DualMind Feature 契约表

> 新能力先填本表再写码，避免 messaging / storage 膨胀成杂货铺。  
> 代理入口见 [AGENTS.md](../AGENTS.md)。

## V1 会话边界

- **translateSession**：仅当前一次选区 / 工作台会话（含流式中间态）
- **不做**：跨页历史、云同步、多会话列表

## V1.5 会话边界（沉浸式全文翻译）

- **immersivePrefs**（`local:immersivePrefs`）：展示模式（双语 / 仅译文）、自动翻译开关
- 页面译文**不写 storage**：只存在于当前标签页的 DOM，随页面关闭而消失
- **禁止**复用 `translateSession` / `translate:*`：沉浸译属独立 feature，见下表

## Feature 一览

| Feature | 目录 | 入口消息 / Port | 写入 storage | UI 入口 | 状态 |
|---------|------|-----------------|--------------|---------|------|
| translate | `features/translate/` | `translate:run`（一次性）；Port `dualmind-translate`（流式 + abort） | `local:translateSession`；工作台快速切换经 `settings:save` / `provider:listModels` | 划词浮层、Side Panel / 全页工作台翻译页（可切换 Provider/模型）、右键菜单；未传 `targetLanguage` 时中英互切（`detectLang`） | V1 可用 |
| selection-toolbar | `features/selection-toolbar/` | 经上述 translate Port / `selection:push` / `sidepanel:toggle` | 不直接写 Key；经 BG 更新 session | Content Shadow DOM 浮层（稳定骨架 + floating-ui 定位；外部点击 / Esc / 关闭按钮收起；侧边栏开关） | V1 可用 |
| immersive | `features/immersive/` | Port `dualmind-immersive`（批量 + abort）；`immersive:command` / `immersive:status`（BG 转发到当前活动标签页）；`immersive:prefs:get` / `immersive:prefs:save` | `local:immersivePrefs`（仅偏好）；译文只留 DOM | 页面右下角悬浮按钮、右键「翻译整页」、Side Panel 翻译页「沉浸翻译」控制区 | V1.5 可用 |
| chat | （未建） | 待定，须独立消息前缀 `chat:*` | 待定，禁止复用 translateSession 语义 | Side Panel 占位 | V1 不做 |
| agent | （未建） | 待定，须独立权限与强确认 | 待定 | Side Panel 占位 | V1 不做 |

全页工作台（`entrypoints/workspace/`）不是独立 Feature：无新消息前缀，UI 复用 `features/translate/ui`，与 Side Panel 共用 `translateSession`。

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
