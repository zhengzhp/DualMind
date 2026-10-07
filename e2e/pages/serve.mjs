#!/usr/bin/env node
/**
 * V3.0 封板测试页静态服务器（Node 内置 http，无新增依赖）
 *
 * 为什么需要它（而不是 file://）：
 * - T2 的支付路径启发式按 URL **path** 判定（`/checkout`、`/payment`…），file:// 没有 path 语义
 * - T6 的**跨源** iframe 需要两个不同 origin；同一份 root 监两个端口即可（host 相同、port 不同 = 不同 origin）
 * - T3 的 pushState / replaceState 整页导航需要 http(s) 环境
 *
 * 用法：
 *   node e2e/pages/serve.mjs
 *   DM_PAGES_PORT=4173 DM_PAGES_CROSS_PORT=4174 node e2e/pages/serve.mjs
 *
 * 只监听 127.0.0.1，不对外暴露；页面全部为虚构数据，不含任何真实凭据（ENV-02）。
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** 站点根目录：两个端口共用同一份文件，从而构造「跨源」 */
const ROOT = path.join(here, 'site');

/** 主端口（Agent 绑定的内容页 / 手工验收入口） */
const MAIN_PORT = Number(process.env.DM_PAGES_PORT ?? 4173);
/** 跨源端口（仅供 T6 的跨域 iframe 使用） */
const CROSS_PORT = Number(process.env.DM_PAGES_CROSS_PORT ?? 4174);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * URL path → 磁盘文件。
 * 支持 `/checkout` 这类「无扩展名」路径（映射到 `checkout.html`），
 * 以便命中 danger.ts 的 FINANCIAL_PATH_RE。
 */
function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const normalized = path.posix.normalize(decoded);
  // 防目录穿越：normalize 后仍以 ../ 开头即拒绝
  if (normalized.startsWith('..')) return null;

  let rel = normalized.replace(/^\/+/, '');
  if (rel === '') rel = 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  if (!path.extname(rel)) rel += '.html';

  const file = path.join(ROOT, rel);
  // 双保险：解析结果必须仍在 ROOT 之内
  if (!file.startsWith(ROOT)) return null;
  return file;
}

/**
 * 请求处理：两个端口共用同一份逻辑。
 * 注意：**不要**对同一个 http.Server 连续 listen() 两次 ——
 * 本机 Node 24 下第二次监听会顶掉第一次，只剩后一个端口在听（实测踩过）。
 * 因此这里为每个端口各建一个独立实例。
 */
const handle = async (req, res) => {
  const file = resolveFile(req.url ?? '/');
  if (!file) {
    res.writeHead(403, { 'Content-Type': MIME['.txt'] });
    res.end('forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
      // 测试页会频繁改动，禁用缓存避免验证到旧页面
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': MIME['.html'] });
    res.end(
      `<!doctype html><meta charset="utf-8"><h1>404</h1><p>没有这个测试页：${path.basename(file)}</p>` +
        '<p><a href="/">返回测试页目录</a></p>',
    );
  }
};

for (const port of [MAIN_PORT, CROSS_PORT]) {
  const server = createServer(handle);
  server.on('error', (err) => {
    console.error(`[dm-test-pages] 端口 ${port} 启动失败：${err.code ?? err}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`[dm-test-pages] http://127.0.0.1:${port}/`);
  });
}
console.log(
  `[dm-test-pages] 主站 http://127.0.0.1:${MAIN_PORT}/ ；跨源 http://127.0.0.1:${CROSS_PORT}/`,
);
console.log('[dm-test-pages] Ctrl+C 停止');
