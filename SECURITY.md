# Security Policy

## 支持范围

当前维护 `main` 分支与 **1.1.x** 版本。更早版本仅按需修复严重问题。

## 报告安全问题

请**不要**用公开 issue 报告安全漏洞。使用 GitHub 的私密报告入口：

<https://github.com/zhengzhp/DualMind/security/advisories/new>

报告中请尽量包含：

- 受影响版本 / 浏览器版本
- 复现步骤与影响（例如：是否能读取 API Key、是否绕过 Agent 确认）
- 最小复现页面或代码片段（**不要**附真实 API Key）

我会尽量在 7 天内确认，并在修复后于 Release Notes 中致谢（如你愿意具名）。

## 重点关注

- **API Key 边界**：Key 是否只在 Background 读取、是否可能被 Content Script / 页面脚本拿到
- **Agent 权限边界**：是否可绕过步骤计划批准、危险动作二次确认，或执行资金类动作
- **提示注入**：页面内容是否能让 Agent 执行批准计划之外的动作
- **远程代码 / CSP**：是否引入远程脚本、动态 `eval` 或不受控的 `innerHTML`
- **权限扩张**：manifest 是否出现 `debugger` / `scripting` / `tabs` / `activeTab` 等未声明能力

## 不在范围

- 模型输出质量、翻译准确度
- 用户自建 / 第三方 OpenAI 兼容端点自身的安全性
- 需要用户先安装恶意扩展或已取得本机控制权的前提

## 披露

修复发布前请不要公开细节；发布后欢迎公开讨论。
