# 按改动选最小验证

根据用户描述的改动（或当前 diff），对照下方**「改动 → 最小验证」对照表**给出**本回合**验证建议。

## 改动 → 最小验证（对照表 · 权威正文）

按改动类型选**最小**验证；全量 `compile` / `test:e2e` 仍推迟到 V3 发布闸门（见 `docs/decisions.md`）。
**Ask first 不变**：下表是「该跑什么 / 请用户验什么」的菜单，Agent **仍须先征得用户同意**再执行任何 test / build / compile / e2e。

| 改动类型 | 建议验证（征得同意后） | 不要默认做 | 请用户验证 |
|----------|------------------------|------------|------------|
| 纯函数 / storage / prompts | `pnpm test`（相关文件即可） | build / e2e / compile | 一般无需 |
| UI 文案 / Tailwind / 布局 | 通常不跑命令 | e2e | Side Panel / Options / 浮层对应路径 |
| messaging / Feature 契约 | 相关单测 | 全量 e2e | 一条主路径（发消息 / 划词 / 摘要等） |
| Content Script / DOM 注入 | 相关单测（若有） | 无头硬跑 Side Panel | 目标页实机点一次 |
| 扩展加载 / `sidePanel.open()` | 提醒改用 `pnpm test:e2e:headed` | 无头当有头用 | 有头 E2E 或人工开侧栏 |
| 权限 / manifest | 征得同意后 `pnpm build`，核对产物 manifest | 擅自扩权 | Options + 一条需权限的路径 |

## 环境与验证纪律（权威正文）

- 不擅自杀用户正在运行的进程（如 `pnpm dev`）；需要时**给命令让用户执行**。
- 验证优先用 prod 产物（`.output/chrome-mv3`），避免污染用户 dev 环境。
- 临时脚本命名 `_tmp-*`，用完即删；收尾时确认 `git status` 无残留。
- E2E 默认**无头**（`pnpm test:e2e`）；涉及**真实 Side Panel / 需肉眼观察界面**时，
  **主动提醒用户**改用 `pnpm test:e2e:headed`（`E2E_HEADED=1`），详见 `AGENTS.md` 与 `docs/decisions.md`。
  - 无头下 `e2e/selection-panel-toggle.e2e.ts` 的真实侧栏用例会自动 skip，只有有头模式才执行。
  - 无头依赖 `channel: 'chromium'` 走完整 Chromium 新无头模式（headless shell 不支持加载扩展）。
- 需要访问外网（查文档 / 装包 / 下载）时走**本地代理服务器**转发；具体地址与端口以 `proxy-web-access` skill 为准，
  不在仓库写死。直连失败或超时时先确认代理是否启用，不要反复重试直连。

## 输出格式（简短）

1. **改动类型**：归入对照表哪一行（可多行）
2. **建议命令**：征得同意后可跑的最小命令（写全，如 `pnpm test path/to/file.test.ts`）
3. **不要跑**：明确列出应跳过的重命令（全量 e2e / compile / zip 等）
4. **请用户验证**：Chrome 中具体点击路径（无则写「无需」）
5. **E2E 提醒**：若涉及真实 Side Panel / 肉眼观察，主动提醒 `pnpm test:e2e:headed`

## 约束

- **Ask first 不变**：本命令只产出菜单，**不要擅自执行** test / build / compile / e2e，除非用户在本回合明确要求执行
- 全量闸门仍按 `docs/decisions.md` 推迟到 V3
- 需要更细手工步骤时引导用户再用 `/test-plan`

用简体中文输出。
