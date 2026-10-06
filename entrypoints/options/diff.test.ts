/**
 * Options 增量保存（diffSettings / parseHosts）的回归护栏。
 *
 * 回归背景（docs/decisions-v1.md）：Options 曾整对象提交草稿，用加载时的旧快照
 * 覆盖用户在侧栏 / 沉浸译入口刚写入的设置（目标语被反复写回 `en`）。
 * 这里锁定「只提交相对基线有变化的字段，嵌套对象只带变化的子字段」这一契约。
 *
 * 悬浮入口的两个字段（`pageFabEnabled` / `pageFabHiddenHosts`）尤其要盯：
 * 它们会被**入口菜单自己**写入（「本站不再显示」/「所有页不再显示」），
 * 若 diff 漏掉，就会退化成「用户点了隐藏但保存不上」——症状是点了没反应，
 * 且因为不报错而极难定位。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type AppSettings } from '@/shared/storage/types';
import { diffSettings, parseHosts } from './diff';

/** 允许只覆盖嵌套对象的部分字段（Partial 不会下钻，故单独放宽 openai / ollama） */
type SettingsOverrides = Partial<Omit<AppSettings, 'openai' | 'ollama'>> & {
  openai?: Partial<AppSettings['openai']>;
  ollama?: Partial<AppSettings['ollama']>;
};

/** 从默认设置派生一份草稿，嵌套对象做浅合并，避免用例互相污染 */
function base(overrides: SettingsOverrides = {}): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
    openai: { ...DEFAULT_SETTINGS.openai, ...(overrides.openai ?? {}) },
    ollama: { ...DEFAULT_SETTINGS.ollama, ...(overrides.ollama ?? {}) },
  };
}

/** 便捷包装：hosts 列表用基线值，只关心其它字段的用例不必重复传参 */
function diff(base0: AppSettings, draft: AppSettings = base0) {
  return diffSettings(
    base0,
    draft,
    draft.disabledHosts,
    draft.pageFabHiddenHosts,
  );
}

describe('diffSettings', () => {
  it('草稿与基线一致时返回空补丁', () => {
    const baseline = base();
    expect(diff(baseline)).toEqual({});
  });

  it('只改目标语言时只带该字段', () => {
    const baseline = base();
    const draft = base({ targetLanguage: 'en' });
    expect(diff(baseline, draft)).toEqual({ targetLanguage: 'en' });
  });

  it('嵌套 openai 只带变化的子字段，不含未改动的 baseUrl / apiKey', () => {
    const baseline = base();
    const draft = base({ openai: { model: 'deepseek-chat' } });

    const patch = diff(baseline, draft);
    expect(Object.keys(patch)).toEqual(['openai']);
    expect(patch.openai).toEqual({ model: 'deepseek-chat' });
  });

  it('嵌套 ollama 只带变化的 host', () => {
    const baseline = base();
    const draft = base({ ollama: { host: 'http://127.0.0.1:9999' } });

    const patch = diff(baseline, draft);
    expect(patch.ollama).toEqual({ host: 'http://127.0.0.1:9999' });
  });

  it('站点禁用列表变化时按解析结果提交', () => {
    const baseline = base();
    const draft = base();
    const patch = diffSettings(baseline, draft, ['a.com', 'b.com'], []);
    expect(patch.disabledHosts).toEqual(['a.com', 'b.com']);
  });

  it('站点禁用列表内容相同（顺序一致）时不提交', () => {
    const baseline = base({ disabledHosts: ['a.com', 'b.com'] });
    const draft = base({ disabledHosts: ['a.com', 'b.com'] });
    expect(diffSettings(baseline, draft, ['a.com', 'b.com'], [])).toEqual({});
  });

  it('多项同时改动时各字段独立提交', () => {
    const baseline = base();
    const draft = base({
      targetLanguage: 'ja',
      providerType: 'openai-compatible',
      openai: { model: 'gpt-4o-mini', apiKey: 'sk-x' },
    });

    const patch = diff(baseline, draft);
    expect(patch.targetLanguage).toBe('ja');
    expect(patch.providerType).toBe('openai-compatible');
    expect(patch.openai).toEqual({ apiKey: 'sk-x' });
  });

  it('全局开关变化时提交该字段（入口菜单「所有页不再显示」依赖它）', () => {
    const baseline = base();
    const draft = base({ pageFabEnabled: false });
    expect(diff(baseline, draft)).toEqual({ pageFabEnabled: false });
  });

  it('入口隐藏站点列表变化时提交（入口菜单「本站不再显示」依赖它）', () => {
    const baseline = base();
    const draft = base();
    const patch = diffSettings(baseline, draft, [], ['example.com']);
    expect(patch.pageFabHiddenHosts).toEqual(['example.com']);
  });

  it('入口隐藏站点列表内容相同则不提交', () => {
    const baseline = base({ pageFabHiddenHosts: ['example.com'] });
    const draft = base({ pageFabHiddenHosts: ['example.com'] });
    expect(diffSettings(baseline, draft, [], ['example.com'])).toEqual({});
  });

  it('「禁用站点」与「入口隐藏站点」互不牵连（两条列表语义不同）', () => {
    const baseline = base();
    const draft = base();
    // 只改入口隐藏列表，站点禁用列表应原样不动（不出现 disabledHosts 键）
    const patch = diffSettings(baseline, draft, [], ['a.com']);
    expect(patch).toEqual({ pageFabHiddenHosts: ['a.com'] });
    expect(patch.disabledHosts).toBeUndefined();
  });
});

describe('parseHosts', () => {
  it('按换行 / 逗号切分并过滤空白', () => {
    expect(parseHosts('mail.google.com\nexample.com, foo.test')).toEqual([
      'mail.google.com',
      'example.com',
      'foo.test',
    ]);
  });

  it('去掉首尾空白与空行', () => {
    expect(parseHosts('  a.com  \n\n , b.com,')).toEqual(['a.com', 'b.com']);
  });

  it('全空文本返回空数组', () => {
    expect(parseHosts('   \n  ')).toEqual([]);
  });
});
