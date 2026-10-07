# 保存并提交

执行个人 Agent Skill **`auto-commit`**：「保存」= `git commit`（落盘进度）。

## 做什么

1. 先读并遵循个人 store 的 `auto-commit` skill（完整流程与护栏以该 skill 为准）
2. **message 规则**同 [`commit-msg.md`](./commit-msg.md)：Conventional Commits、1～2 句写清为什么、可用中文、HEREDOC 提交
3. 起草后 **真正执行** `git commit`（本命令即用户明确要求提交）

## DualMind 护栏

- **不要**提交：`.output/`、临时 `_tmp-*`、含密钥的本地配置 / `.env`
- **不要**擅自 `pnpm build` / `compile` / e2e，也不要默认 `git push`（推远程用 `/push`）
- 选择性 `git add`，禁止盲加全仓库

无变更则不空提交；提交后用 `git status` 确认。
