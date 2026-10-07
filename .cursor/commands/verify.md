# 按改动选最小验证

根据用户描述的改动（或当前 diff），对照 `AGENTS.md`「改动 → 最小验证」给出**本回合**验证建议。

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
