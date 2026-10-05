# 生成测试计划

为用户指定的功能（或当前改动）输出可执行的手工 / 自动化测试计划。

## DualMind 关注点

- 划词工具栏：自动显示 / 仅 Alt+Shift+K；禁用站点
- Side Panel：承接选区、重译、语言切换
- Options：Ollama 连接检测与模型列表；OpenAI Compatible Key/Base URL
- 错误态：Ollama 未启动、模型未 pull、空选区、无 Key

## 输出格式

清单式 Test plan，每项可勾选：`[ ] 步骤 — 期望结果`

默认不写代码；若用户要求补测试文件再实现。用简体中文。
