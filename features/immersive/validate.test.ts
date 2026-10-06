import { describe, expect, it } from 'vitest';
import { looksLikeEcho, normalizeForCompare } from './validate';

describe('normalizeForCompare', () => {
  it('压缩空白并去首尾', () => {
    expect(normalizeForCompare('  a\n\n b  ')).toBe('a b');
  });
});

describe('looksLikeEcho', () => {
  it('完全相同 → 回显', () => {
    expect(looksLikeEcho('Hello world', 'Hello world')).toBe(true);
  });

  it('仅空白 / 换行差异也算回显', () => {
    expect(looksLikeEcho('Hello\n  world', ' Hello world ')).toBe(true);
  });

  it('真实译文不算回显', () => {
    expect(looksLikeEcho('你好，世界', 'Hello world')).toBe(false);
  });

  it('空译文不算回显（交由缺失分支处理）', () => {
    expect(looksLikeEcho('', 'Hello world')).toBe(false);
    expect(looksLikeEcho('   ', 'Hello world')).toBe(false);
  });
});
