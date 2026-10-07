# 起草提交说明

根据当前 git 变更（先 `git status` / `git diff`）起草 commit message。

## 要求

- 遵循仓库已有风格；优先 Conventional Commits（`feat` / `fix` / `docs` / `refactor` 等）
- 1～2 句，写清「为什么」，不要只罗列文件名
- 用 HEREDOC 示例给出完整 `git commit -m "$(cat <<'EOF' ... EOF)"` 命令
- **不要**擅自执行 commit，除非用户明确要求提交
- 发现疑似密钥 / `.env` 时立刻警告并排除

用简体中文说明摘要；commit message 可用中文。

真正提交请用 `/save-commit` 或口令「保存并提交」（走个人 `auto-commit` skill）。
