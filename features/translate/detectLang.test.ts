import { describe, expect, it } from 'vitest';
import {
  classifySourceLang,
  isTargetLanguage,
  resolveAutoTargetLanguage,
} from './detectLang';

describe('classifySourceLang', () => {
  it('纯英文', () => {
    expect(classifySourceLang('Hello world')).toBe('en');
  });

  it('纯中文', () => {
    expect(classifySourceLang('你好世界')).toBe('zh');
  });

  it('中英混排', () => {
    expect(classifySourceLang('hello 世界')).toBe('mixed');
    expect(classifySourceLang('使用 React 开发')).toBe('mixed');
  });

  it('单个拉丁字母不算英文 → other', () => {
    expect(classifySourceLang('A')).toBe('other');
    expect(classifySourceLang('x')).toBe('other');
  });

  it('含数字的混排仍判为 mixed', () => {
    expect(classifySourceLang('hello 世界 123')).toBe('mixed');
  });

  it('空串 / 纯符号 → other', () => {
    expect(classifySourceLang('')).toBe('other');
    expect(classifySourceLang('   ')).toBe('other');
    expect(classifySourceLang('12345')).toBe('other');
  });
});

describe('resolveAutoTargetLanguage', () => {
  it('英文 → 中文', () => {
    expect(resolveAutoTargetLanguage('Hello world')).toBe('zh-CN');
  });

  it('中文 → 英文', () => {
    expect(resolveAutoTargetLanguage('你好世界')).toBe('en');
  });

  it('混排 → 中文', () => {
    expect(resolveAutoTargetLanguage('hello 世界')).toBe('zh-CN');
  });

  it('无法判断 → 英文', () => {
    expect(resolveAutoTargetLanguage('12345')).toBe('en');
  });
});

describe('isTargetLanguage', () => {
  it('中文目标 + 纯中文原文 → 无需翻译', () => {
    expect(isTargetLanguage('你好世界', 'zh-CN')).toBe(true);
    expect(isTargetLanguage('你好世界', 'zh-TW')).toBe(true);
  });

  it('中文目标 + 英文原文 → 需要翻译', () => {
    expect(isTargetLanguage('Hello world', 'zh-CN')).toBe(false);
  });

  it('英文目标 + 纯英文原文 → 无需翻译', () => {
    expect(isTargetLanguage('Hello world', 'en')).toBe(true);
  });

  it('英文目标 + 中文原文 → 需要翻译', () => {
    expect(isTargetLanguage('你好世界', 'en')).toBe(false);
  });

  it('其余语言无法可靠判断，一律视为需要翻译', () => {
    expect(isTargetLanguage('こんにちは', 'ja')).toBe(false);
    expect(isTargetLanguage('Bonjour', 'fr')).toBe(false);
    // 混排不能算作任一目标语言
    expect(isTargetLanguage('hello 世界', 'zh-CN')).toBe(false);
  });
});
