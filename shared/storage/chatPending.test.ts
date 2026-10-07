import { describe, expect, it } from 'vitest';
import { evaluateChatPending } from './chatPendingEval';
import { CHAT_PENDING_TTL_MS } from './types';

describe('evaluateChatPending', () => {
  const action = { kind: 'summarize' as const, createdAt: 1_000 };

  it('空信箱', () => {
    expect(evaluateChatPending(null, 2_000)).toEqual({ status: 'empty' });
  });

  it('TTL 内有效', () => {
    expect(evaluateChatPending(action, action.createdAt + 1_000)).toEqual({
      status: 'ok',
      action,
    });
  });

  it('超过 TTL 视为过期', () => {
    expect(
      evaluateChatPending(action, action.createdAt + CHAT_PENDING_TTL_MS + 1),
    ).toEqual({ status: 'expired', action });
  });

  it('默认 TTL 为 120s', () => {
    expect(CHAT_PENDING_TTL_MS).toBe(120_000);
  });
});
