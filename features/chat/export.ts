/**
 * 阅读助手会话导出为 Markdown，并触发浏览器本机下载。
 * 纯函数 + DOM 下载；不经 Background、不扩权限。
 */
import {
  formatExportStamp,
  sanitizeFilenamePart,
} from '@/shared/export';
import type { ChatSession, ChatTurn } from '@/shared/storage/types';

// 文件名 / 时间戳 / 下载是跨功能通用能力，实现在 shared/export；
// 这里保持旧导出名，避免 useChat 与既有测试改动。
export {
  downloadTextFile,
  formatExportStamp,
  sanitizeFilenamePart,
} from '@/shared/export';

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
    return '# DualMind 阅读助手 · 全部会话\n\n（无会话）\n';
  }

  const parts = [
    '# DualMind 阅读助手 · 全部会话',
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
