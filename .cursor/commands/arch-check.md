# 架构检查

对照 DualMind V1 架构，检查当前改动或 @ 引用的代码是否合规。

## 检查清单

对照 `AGENTS.md`（Always / Never）与下列项：

- [ ] AI 请求是否只在 Background
- [ ] Feature 是否经 `shared/llm`（而非各自拼 Provider）
- [ ] 错误是否走 `shared/errors`（含 code，文案不泄露 Key）
- [ ] API Key 是否只存 `chrome.storage` / `wxt/utils/storage`，且不进 Content Script
- [ ] Provider 是否与 DOM 解耦
- [ ] 新功能是否落在正确的 `features/<name>/` 并更新 `docs/features.md`
- [ ] 是否无意扩大 `host_permissions` / 自动化权限
- [ ] 是否把 Chat/Agent 逻辑塞进翻译链路
- [ ] 是否与 `docs/decisions.md` / V1 产品边界冲突

## 输出

列出违规项（含文件）与建议改法；全部通过则明确写「架构检查通过」。

用简体中文。
