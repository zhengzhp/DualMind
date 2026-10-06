import { describe, expect, it } from 'vitest';
import { hostnameFromUrl, isHostDisabled } from './siteAccess';

describe('hostnameFromUrl', () => {
  it('解析标准 URL 的 hostname', () => {
    expect(hostnameFromUrl('https://sub.example.com/a?b=1')).toBe(
      'sub.example.com',
    );
  });

  it('空串 / 非法 URL 返回空串', () => {
    expect(hostnameFromUrl('')).toBe('');
    expect(hostnameFromUrl('about:blank')).toBe('');
  });
});

describe('isHostDisabled', () => {
  it('精确命中即禁用', () => {
    expect(isHostDisabled(['example.com'], 'example.com')).toBe(true);
  });

  it('子域不误伤（精确匹配）', () => {
    expect(isHostDisabled(['example.com'], 'sub.example.com')).toBe(false);
  });

  it('空 hostname 不算禁用（即使列表里恰好有空串）', () => {
    expect(isHostDisabled([''], '')).toBe(false);
  });
});
