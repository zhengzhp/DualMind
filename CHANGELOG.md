# Changelog

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

- 仓库门面整理：MIT License、README 徽章 / 架构图 / 商店链接、开发文档拆分、临时与草稿资产清理。

## [1.1.0] - 2026-10-19

### Added

- 本页 Agent 执行记录导出：计划 + 时间线 + 结论导出 Markdown，表格可另存 CSV。
- 工作台视觉层级重构：语义 token、内置 IBM Plex 字体、深色模式、跳转主内容。
- 5 张商店截图与 README 截图同步。

### Changed

- Agent 空态示例改为差异化场景；结论中的 Markdown 表格在面板内渲染为真表格。

### Fixed

- 权限与商店文案口径对齐；本机导出不新增 `downloads` 权限。

详见 [release-notes-v1.1.0.md](docs/release-notes-v1.1.0.md)。

## [1.0.0] - 2026-10-08

### Added

- 首个正式版：划词翻译、Side Panel / 全页工作台、沉浸式整页双语翻译。
- 只读阅读助手：整页摘要与当前页问答。
- 可选的本页操作 Agent：计划批准 + 危险动作二次确认，零新增权限。
- BYOK：OpenAI 兼容端点 + 本地 Ollama；API Key 仅 Background 读取。

详见 [release-notes-v1.0.0.md](docs/release-notes-v1.0.0.md)。
