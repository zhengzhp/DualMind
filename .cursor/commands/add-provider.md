# 新增 Provider

按 DualMind Provider 适配层约定，新增或完善一个 AI Provider。

用户若在命令后写了供应商名 / Base URL / 鉴权方式，优先采用；否则先简短确认。

## 必须遵守

1. 实现 `providers/types.ts` 中的 `ChatProvider`（`listModels` / `chat` / `testConnection`）
2. 只改 `providers/` + `registry` + 必要时 Options UI；**不碰 DOM / Content Script**
3. 错误信息可读（连接失败、鉴权失败、模型不存在）
4. 请求仍只由 Background 发起
5. 更新设置页的 Provider 切换（若需要）
6. 用简体中文注释核心逻辑

完成后说明：如何在 Options 里配置与「检测连接」。
