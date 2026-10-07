# 推送到远程

本命令 = 用户明确要求 **`git push`**（把已 commit 的本地提交推到跟踪远程）。

## 做什么

1. 先确认状态：`git status -sb`、当前分支、是否跟踪远程（`@{u}`）、ahead/behind
2. **有未提交改动** → 提醒可用 `/save-commit`；仍只 push 已有 commits，不擅自 commit
3. **无本地领先提交** → 不空跑 push，说明已与远程同步（或仅 behind）
4. 执行推送：
   - 已有 upstream → `git push`
   - 尚无 upstream → `git push -u origin HEAD`（首次建立跟踪）
5. 结束后再 `git status -sb` 确认

## 护栏

- **禁止** `--force` / `--force-with-lease` / 改写历史，除非用户在本轮对话里**明确**要求
- **禁止** force push 到 `main` / `master`；即使用户要求也先警告并确认分支名
- **不要**改 `git config`、不要换 remote URL、不要 `origin repo delete`
- **不要**擅自 `pnpm build` / `compile` / e2e
- 认证失败时说明错误；若目标是 `origin.cursor.com`，再考虑 `origin` skill 登录修复，勿反复盲推

## DualMind 提示

- 当前默认远程多为 GitHub `origin`；推送需本机已有有效凭据
- 若 HTTPS push 因 HTTP/2 异常失败，可改试：`git -c http.version=HTTP/1.1 push`（不默认使用，仅作失败后的备选）
