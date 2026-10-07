/**
 * 跨页确认后的会话分隔条（纯函数，可单测）。
 * 仅写入会话 turns 供 UI / 导出展示，组装模型消息时会跳过。
 */
import { hostnameFromUrl } from '@/shared/siteAccess';
import type { ChatTurn } from '@/shared/storage/types';

/** 构造一条 `kind: 'page-break'` 系统分隔 */
export function createPageBreakTurn(options: {
  id: string;
  url: string;
  title: string;
  createdAt?: number;
}): ChatTurn {
  const host = hostnameFromUrl(options.url) || options.url || '未知页面';
  const label = options.title.trim() || host;
  return {
    id: options.id,
    role: 'system',
    kind: 'page-break',
    content: `之后基于：${label}`,
    pageUrl: options.url,
    pageTitle: options.title,
    createdAt: options.createdAt ?? Date.now(),
  };
}

/** 是否为跨页分隔（兼容老数据：无 kind 则否） */
export function isPageBreakTurn(turn: ChatTurn): boolean {
  return turn.role === 'system' && turn.kind === 'page-break';
}
