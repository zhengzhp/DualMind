/**
 * 网页助手会话导出为 Markdown，并触发浏览器本机下载。
 * 纯函数 + DOM 下载；不经 Background、不扩权限。
 */
import type { ChatSession, ChatTurn } from '@/shared/storage/types';

/** 文件名片段：去掉路径非法字符，截断，空则回退 untitled */
export function sanitizeFilenamePart(raw: string, maxLen = 40): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
    .replace(/[. ]+$/g, '');
  return cleaned || 'untitled';
}

/** `yyyyMMdd-HHmm`（本地时区） */
export function formatExportStamp(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

function formatDisplayTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function formatTurn(turn: ChatTurn): string {
  if (turn.role === 'system' && turn.kind === 'page-break') {
    const url = turn.pageUrl?.trim() || '';
    const lines = ['### —— 页面切换 ——', '', turn.content.trim() || '（换页）'];
    if (url) lines.push('', `- 地址：${url}`);
    return lines.join('\n');
  }
  const roleLabel = turn.role === 'user' ? '用户' : '助手';
  const body = turn.content.trim() || '（空）';
  const lines = [`### ${roleLabel}`, '', body];
  if (turn.error) {
    lines.push('', `> 失败：${turn.error}`);
  }
  return lines.join('\n');
}

/** 单会话 → Markdown 正文 */
export function formatSessionMarkdown(session: ChatSession): string {
  const title = session.title.trim() || '未命名会话';
  const pageTitle = session.pageTitle.trim() || '未记录页面';
  const pageUrl = session.pageUrl.trim() || '（无地址）';
  const header = [
    `# ${title}`,
    '',
    `- 来源：${pageTitle}`,
    `- 地址：${pageUrl}`,
    `- 更新：${formatDisplayTime(session.updatedAt)}`,
    '',
    '## 对话',
    '',
  ];

  if (session.turns.length === 0) {
    return [...header, '（本会话尚无消息）', ''].join('\n');
  }

  const turns = session.turns.map(formatTurn).join('\n\n');
  return [...header, turns, ''].join('\n');
}

/**
 * 多会话合并为一个 Markdown（按 updatedAt 降序）。
 * 会话之间用水平线分隔。
 */
export function formatAllSessionsMarkdown(sessions: ChatSession[]): string {
  const ordered = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  if (ordered.length === 0) {
    return '# DualMind 网页助手 · 全部会话\n\n（无会话）\n';
  }

  const parts = [
    '# DualMind 网页助手 · 全部会话',
    '',
    `共 ${ordered.length} 个会话 · 导出时间 ${formatDisplayTime(Date.now())}`,
    '',
  ];

  for (let i = 0; i < ordered.length; i += 1) {
    const session = ordered[i];
    if (!session) continue;
    if (i > 0) {
      parts.push('---', '');
    }
    // 去掉单会话文档自带的一级标题井号层次冲突：整包已有总标题，
    // 各会话仍保留 `# 标题`，阅读时结构清晰。
    parts.push(formatSessionMarkdown(session).trimEnd(), '');
  }

  return parts.join('\n');
}

export function buildSessionExportFilename(
  session: ChatSession,
  now = Date.now(),
): string {
  const title = sanitizeFilenamePart(session.title);
  return `dualmind-chat-${title}-${formatExportStamp(now)}.md`;
}

export function buildAllSessionsExportFilename(now = Date.now()): string {
  return `dualmind-chat-all-${formatExportStamp(now)}.md`;
}

/** 在扩展页（Side Panel / 工作台）触发本机下载 */
export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
