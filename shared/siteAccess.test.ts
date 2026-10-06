import { describe, expect, it } from 'vitest';
import { hostnameFromUrl, isHostDisabled, shouldShowPageFab } from './siteAccess';

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

describe('shouldShowPageFab', () => {
  const enabled = { pageFabEnabled: true, pageFabHiddenHosts: [] };

  it('默认（开启 + 空列表）显示', () => {
    expect(shouldShowPageFab(enabled, 'example.com')).toBe(true);
  });

  it('全局关掉后任何站点都不显示', () => {
    expect(
      shouldShowPageFab({ ...enabled, pageFabEnabled: false }, 'example.com'),
    ).toBe(false);
  });

  it('命中站点列表则不显示', () => {
    expect(
      shouldShowPageFab(
        { ...enabled, pageFabHiddenHosts: ['example.com'] },
        'example.com',
      ),
    ).toBe(false);
  });

  it('列表中的站点不影响其它站点（逐站判断，不是全局）', () => {
    const settings = { ...enabled, pageFabHiddenHosts: ['example.com'] };
    expect(shouldShowPageFab(settings, 'other.com')).toBe(true);
  });

  it('子域不误伤（与 disabledHosts 同一套精确匹配语义）', () => {
    const settings = { ...enabled, pageFabHiddenHosts: ['example.com'] };
    expect(shouldShowPageFab(settings, 'sub.example.com')).toBe(true);
  });

  it('空 hostname（内部页 / 非法地址）不因列表里的空串而隐藏', () => {
    expect(shouldShowPageFab({ ...enabled, pageFabHiddenHosts: [''] }, '')).toBe(
      true,
    );
  });

  it('与 isHostDisabled 相互独立：站点禁用列表不影响本判定的输入语义', () => {
    // 入口只关心自己的两个字段；调用方若传错字段（如把 disabledHosts 传进来）
    // 也不会静默通过 —— 这里锁住「只看 pageFab*」这一事实
    const settings = { ...enabled, pageFabHiddenHosts: [] };
    expect(shouldShowPageFab(settings, 'disabled.example.com')).toBe(true);
  });
});
