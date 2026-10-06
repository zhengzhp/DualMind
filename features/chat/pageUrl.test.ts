import { describe, expect, it } from 'vitest';
import { isSamePageUrl, normalizePageUrl } from './pageUrl';

describe('normalizePageUrl', () => {
  it('保留 origin / pathname / search', () => {
    expect(normalizePageUrl('https://example.com/a/b?x=1')).toBe(
      'https://example.com/a/b?x=1',
    );
  });

  it('忽略 hash（站内锚点仍视为同页）', () => {
    expect(normalizePageUrl('https://example.com/post#section')).toBe(
      'https://example.com/post',
    );
  });

  it('空串返回空串', () => {
    expect(normalizePageUrl('')).toBe('');
  });

  it('无法解析的字符串原样返回', () => {
    expect(normalizePageUrl('not-a-url')).toBe('not-a-url');
  });
});

describe('isSamePageUrl', () => {
  it('仅 hash 不同 → 视为同一页', () => {
    expect(
      isSamePageUrl('https://example.com/post', 'https://example.com/post#c1'),
    ).toBe(true);
  });

  it('query 不同 → 视为不同页（SPA 参数化路由）', () => {
    expect(
      isSamePageUrl('https://example.com/post?id=1', 'https://example.com/post?id=2'),
    ).toBe(false);
  });

  it('path 不同 → 视为不同页', () => {
    expect(
      isSamePageUrl('https://example.com/a', 'https://example.com/b'),
    ).toBe(false);
  });

  it('任一侧为空 → 视为未知（false）', () => {
    expect(isSamePageUrl('', 'https://example.com')).toBe(false);
    expect(isSamePageUrl('https://example.com', '')).toBe(false);
  });
});
