import { describe, expect, it } from 'vitest';
import { evaluateAgentPending } from './agentPendingEval';

describe('evaluateAgentPending', () => {
  it('空信箱 / 未过期 / 过期', () => {
    expect(evaluateAgentPending(null)).toEqual({ status: 'empty' });
    const action = { kind: 'open' as const, createdAt: 1_000 };
    expect(evaluateAgentPending(action, 1_000 + 1_000)).toEqual({
      status: 'ok',
      action,
    });
    expect(evaluateAgentPending(action, 1_000 + 200_000)).toEqual({
      status: 'expired',
      action,
    });
  });
});
