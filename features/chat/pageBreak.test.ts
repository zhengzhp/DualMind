import { describe, expect, it } from 'vitest';
import { createPageBreakTurn, isPageBreakTurn } from './pageBreak';

describe('createPageBreakTurn', () => {
  it('用标题作主文案，并带上 pageUrl', () => {
    const turn = createPageBreakTurn({
      id: 'pb-1',
      url: 'https://example.com/b',
      title: 'B 站文章',
      createdAt: 100,
    });
    expect(turn.role).toBe('system');
    expect(turn.kind).toBe('page-break');
    expect(turn.content).toBe('之后基于：B 站文章');
    expect(turn.pageUrl).toBe('https://example.com/b');
    expect(turn.createdAt).toBe(100);
  });

  it('无标题时回退到 host', () => {
    const turn = createPageBreakTurn({
      id: 'pb-2',
      url: 'https://news.example.com/x',
      title: '  ',
    });
    expect(turn.content).toBe('之后基于：news.example.com');
  });
});

describe('isPageBreakTurn', () => {
  it('仅识别 system + page-break', () => {
    expect(
      isPageBreakTurn({
        id: '1',
        role: 'system',
        kind: 'page-break',
        content: 'x',
        createdAt: 0,
      }),
    ).toBe(true);
    expect(
      isPageBreakTurn({
        id: '2',
        role: 'user',
        content: 'hi',
        createdAt: 0,
      }),
    ).toBe(false);
  });
});
