# 推送到远程

本命令 = 用户明确要求 **`git push`**（把已 commit 的本地提交推到跟踪远程）。

## 默认执行方式：沙盒外 + 本机代理

推送**默认在沙盒外、经本机 SOCKS5 代理**执行（默认远程多为 GitHub，直连常超时）：

- **沙盒外**：调用 Shell 时带 `required_permissions: ["all"]`（关闭沙盒）。
  原因：沙盒内访问不到本机代理端口与境外 git 主机。
- **经代理**：单次 `-c http.proxy=…`，**不改** git config；`socks5h` 让 DNS 也走代理。
  代理地址 / 探测流程以 `proxy-web-access` skill 为准（默认 `127.0.0.1:1080`；
  该地址是个人配置，**勿在本仓库另立来源**，变更时改 skill）。

```bash
# 已有 upstream
git -c http.proxy=socks5h://127.0.0.1:1080 push

# 首次建立跟踪
git -c http.proxy=socks5h://127.0.0.1:1080 push -u origin HEAD
```

- **例外**：远程为**国内 / 内网可达**地址时直连 `git push`，不必绕代理。

## 做什么

1. 确认状态：`git status -sb`、当前分支、是否跟踪远程（`@{u}`）、ahead/behind
2. **有未提交改动** → 提醒可用 `/save-commit`；仍只 push 已有 commits，不擅自 commit
3. **无本地领先提交** → 不空跑 push，说明已与远程同步（或仅 behind）
4. 按上文**沙盒外 + 代理**执行推送
5. 结束后再 `git status -sb` 确认

## 护栏

- **禁止** `--force` / `--force-with-lease` / 改写历史，除非用户在本轮对话里**明确**要求
- **禁止** force push 到 `main` / `master`；即使用户要求也先警告并确认分支名
- **不要**改 `git config`（含持久化 proxy）、不要换 remote URL、不要 `origin repo delete`
- **不要**擅自 `pnpm build` / `compile` / e2e
- 代理不可用 → **如实报告并停下**（见 `proxy-web-access`），**禁止**静默改直连反复盲推
- 认证失败时说明错误；若目标是 `origin.cursor.com`，再考虑 `origin` skill 登录修复

## DualMind 提示

- 当前默认远程多为 GitHub `origin`；推送需本机已有有效凭据
- 若 HTTPS push 因 HTTP/2 异常失败，备选：
  `git -c http.version=HTTP/1.1 -c http.proxy=socks5h://127.0.0.1:1080 push`（不默认使用）
