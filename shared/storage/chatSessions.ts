/**
 * 聊天会话的纯逻辑（无 wxt / DOM 依赖，故可直接单测）。
 *
 * 只负责容量裁剪、列表摘要与增删改；真正的 storage 读写放在 `settings.ts`。
 * 之所以要设上限：`chrome.storage.local` 有配额，而长文问答会持续增长。
 */
import type { ChatSession, ChatSessionSummary, ChatTurn } from './types';

/** 会话容量上限（超限淘汰最旧的） */
export const CHAT_SESSION_LIMITS = {
  /** 最多保留的会话数 */
  maxSessions: 50,
  /** 单个会话最多保留的消息条数 */
  maxTurnsPerSession: 200,
} as const;

export type ChatSessionLimits = {
  maxSessions: number;
  maxTurnsPerSession: number;
};

/** 由首条用户消息推导会话标题（折叠空白并截断） */
export function deriveSessionTitle(text: string, maxLength = 40): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '新会话';
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}…`
    : normalized;
}

/** 裁剪消息条数：只保留最近 maxTurns 条 */
export function trimTurns(turns: ChatTurn[], maxTurns: number): ChatTurn[] {
  if (maxTurns <= 0) return [];
  if (turns.length <= maxTurns) return turns;
  return turns.slice(turns.length - maxTurns);
}

/**
 * 插入或更新一个会话，并按容量上限淘汰最旧者。
 * 返回新数组（不修改入参），便于单测与 React 状态比较。
 */
export function mergeChatSession(
  sessions: ChatSession[],
  session: ChatSession,
  limits: ChatSessionLimits = CHAT_SESSION_LIMITS,
): ChatSession[] {
  const normalized: ChatSession = {
    ...session,
    turns: trimTurns(session.turns, limits.maxTurnsPerSession),
  };
  const merged = [
    ...sessions.filter((item) => item.id !== session.id),
    normalized,
  ];
  // 统一按更新时间倒序，超出上限即丢弃尾部（最旧）
  merged.sort((a, b) => b.updatedAt - a.updatedAt);
  return merged.slice(0, Math.max(limits.maxSessions, 0));
}

/** 删除指定会话 */
export function removeSessionById(
  sessions: ChatSession[],
  id: string,
): ChatSession[] {
  return sessions.filter((item) => item.id !== id);
}

/** 输出按更新时间倒序的列表摘要（不含消息体） */
export function toChatSessionSummaries(
  sessions: ChatSession[],
): ChatSessionSummary[] {
  return [...sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((session) => ({
      id: session.id,
      title: session.title,
      pageUrl: session.pageUrl,
      pageTitle: session.pageTitle,
      turnCount: session.turns.length,
      updatedAt: session.updatedAt,
    }));
}

/**
 * 按 id 更新某条消息（流式增量写入、失败标注都用它）。
 * 找不到 id 时原样返回，避免流式回包晚于会话切换导致错写。
 */
export function updateTurn(
  turns: ChatTurn[],
  id: string,
  patch: Partial<Omit<ChatTurn, 'id' | 'role'>>,
): ChatTurn[] {
  return turns.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn));
}
