/**
 * Agent 信箱判定（纯函数，可单测）
 */
import {
  AGENT_PENDING_TTL_MS,
  type AgentPendingAction,
} from './types';

export type ConsumeAgentPendingResult =
  | { status: 'empty' }
  | { status: 'ok'; action: AgentPendingAction }
  | { status: 'expired'; action: AgentPendingAction };

export function evaluateAgentPending(
  action: AgentPendingAction | null,
  now = Date.now(),
  ttlMs = AGENT_PENDING_TTL_MS,
): ConsumeAgentPendingResult {
  if (!action) return { status: 'empty' };
  if (now - action.createdAt > ttlMs) {
    return { status: 'expired', action };
  }
  return { status: 'ok', action };
}
