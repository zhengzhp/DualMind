/**
 * 右键 / FAB「总结本页」信箱判定（纯函数，可单测）。
 */
import {
  CHAT_PENDING_TTL_MS,
  type ChatPendingAction,
} from './types';

export type ConsumeChatPendingResult =
  | { status: 'empty' }
  | { status: 'ok'; action: ChatPendingAction }
  | { status: 'expired'; action: ChatPendingAction };

/** 判定信箱条目是否仍有效（可注入 now / ttl） */
export function evaluateChatPending(
  action: ChatPendingAction | null,
  now = Date.now(),
  ttlMs = CHAT_PENDING_TTL_MS,
): ConsumeChatPendingResult {
  if (!action) return { status: 'empty' };
  if (now - action.createdAt > ttlMs) {
    return { status: 'expired', action };
  }
  return { status: 'ok', action };
}
