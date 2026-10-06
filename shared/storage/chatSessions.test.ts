import { describe, expect, it } from 'vitest';
import {
  CHAT_SESSION_LIMITS,
  deriveSessionTitle,
  mergeChatSession,
  removeSessionById,
  toChatSessionSummaries,
  trimTurns,
  updateTurn,
} from './chatSessions';
import type { ChatSession, ChatTurn } from './types';

/** 造一个会话，只指定关心的字段 */
function session(
  id: string,
  options: {
    updatedAt?: number;
    turns?: ChatTurn[];
    title?: string;
  } = {},
): ChatSession {
  const turns = options.turns ?? [];
  return {
    id,
    title: options.title ?? `会话 ${id}`,
    pageUrl: `https://example.com/${id}`,
    pageTitle: `页面 ${id}`,
    turns,
    createdAt: 0,
    updatedAt: options.updatedAt ?? 0,
  };
}

function turn(id: string, content: string): ChatTurn {
  return { id, role: 'user', content, createdAt: 0 };
}

describe('deriveSessionTitle', () => {
  it('折叠空白并去首尾空白', () => {
    expect(deriveSessionTitle('  Hello\n\t world  ')).toBe('Hello world');
  });

  it('空文本退回「新会话」', () => {
    expect(deriveSessionTitle('   ')).toBe('新会话');
  });

  it('超长文本按 maxLength 截断并加省略号', () => {
    const title = deriveSessionTitle('a'.repeat(60), 10);
    expect(title).toBe(`${'a'.repeat(10)}…`);
  });
});

describe('trimTurns', () => {
  it('未超上限时原样返回', () => {
    const turns = [turn('1', 'a'), turn('2', 'b')];
    expect(trimTurns(turns, 5)).toBe(turns);
  });

  it('超上限时只保留最近 N 条', () => {
    const turns = [turn('1', 'a'), turn('2', 'b'), turn('3', 'c')];
    expect(trimTurns(turns, 2).map((item) => item.id)).toEqual(['2', '3']);
  });

  it('上限为 0 时清空', () => {
    const turns = [turn('1', 'a')];
    expect(trimTurns(turns, 0)).toEqual([]);
  });
});

describe('mergeChatSession', () => {
  it('新会话被插入', () => {
    const merged = mergeChatSession([], session('a'));
    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe('a');
  });

  it('同 id 会话被更新而非重复插入', () => {
    const merged = mergeChatSession(
      [session('a', { title: '旧' })],
      session('a', { title: '新' }),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.title).toBe('新');
  });

  it('超出 maxSessions 时淘汰 updatedAt 最旧者', () => {
    const existing = [
      session('old', { updatedAt: 1 }),
      session('mid', { updatedAt: 5 }),
      session('new', { updatedAt: 9 }),
    ];
    const merged = mergeChatSession(existing, session('latest', { updatedAt: 10 }), {
      maxSessions: 3,
      maxTurnsPerSession: 10,
    });
    expect(merged.map((item) => item.id)).toEqual(['latest', 'new', 'mid']);
  });

  it('写入时按 maxTurnsPerSession 裁剪消息条数', () => {
    const turns = Array.from({ length: 5 }, (_, i) => turn(String(i), `t${i}`));
    const merged = mergeChatSession([], session('a', { turns }), {
      maxSessions: 10,
      maxTurnsPerSession: 2,
    });
    expect(merged[0]!.turns.map((item) => item.id)).toEqual(['3', '4']);
  });

  it('默认上限与常量一致（50 会话 / 200 条）', () => {
    expect(CHAT_SESSION_LIMITS).toEqual({
      maxSessions: 50,
      maxTurnsPerSession: 200,
    });
  });
});

describe('removeSessionById', () => {
  it('删除指定会话且不动其他', () => {
    const removed = removeSessionById([session('a'), session('b')], 'a');
    expect(removed.map((item) => item.id)).toEqual(['b']);
  });

  it('id 不存在时原样返回', () => {
    const sessions = [session('a')];
    expect(removeSessionById(sessions, 'zzz')).toHaveLength(1);
  });
});

describe('toChatSessionSummaries', () => {
  it('按 updatedAt 倒序并统计消息条数', () => {
    const summaries = toChatSessionSummaries([
      session('old', { updatedAt: 1, turns: [turn('1', 'a')] }),
      session('new', {
        updatedAt: 9,
        turns: [turn('1', 'a'), turn('2', 'b')],
      }),
    ]);
    expect(summaries.map((item) => item.id)).toEqual(['new', 'old']);
    expect(summaries[0]!.turnCount).toBe(2);
  });

  it('摘要不含消息体', () => {
    const [summary] = toChatSessionSummaries([session('a', { turns: [turn('1', 'x')] })]);
    expect(summary).not.toHaveProperty('turns');
  });
});

describe('updateTurn', () => {
  it('只更新命中的那条消息', () => {
    const turns: ChatTurn[] = [
      { id: 'a', role: 'user', content: '问', createdAt: 0 },
      { id: 'b', role: 'assistant', content: '', createdAt: 0 },
    ];
    const next = updateTurn(turns, 'b', { content: '答' });
    expect(next[0]!.content).toBe('问');
    expect(next[1]!.content).toBe('答');
  });

  it('可标注失败文案', () => {
    const turns: ChatTurn[] = [
      { id: 'b', role: 'assistant', content: '', createdAt: 0 },
    ];
    const next = updateTurn(turns, 'b', { error: '请求失败' });
    expect(next[0]!.error).toBe('请求失败');
  });

  it('id 不存在时原样返回（避免流式回包晚于会话切换而错写）', () => {
    const turns: ChatTurn[] = [
      { id: 'a', role: 'user', content: '问', createdAt: 0 },
    ];
    const next = updateTurn(turns, 'zzz', { content: '越权写入' });
    expect(next).toEqual(turns);
  });
});
