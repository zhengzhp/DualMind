import { describe, expect, it } from 'vitest';
import { applyCharBudget } from './budget';

const seg = (id: string, text: string) => ({ id, text });

describe('applyCharBudget', () => {
  it('未超预算时全部保留且不标记截断', () => {
    const result = applyCharBudget([seg('1', 'abc'), seg('2', 'de')], 10);
    expect(result.kept.map((item) => item.id)).toEqual(['1', '2']);
    expect(result.totalChars).toBe(5);
    expect(result.truncated).toBe(false);
  });

  it('恰好等于预算时全部保留', () => {
    const result = applyCharBudget([seg('1', 'abc'), seg('2', 'de')], 5);
    expect(result.kept).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });

  it('超预算时停止追加并标记截断（不切半段）', () => {
    const result = applyCharBudget(
      [seg('1', 'aaaa'), seg('2', 'bbbb'), seg('3', 'cccc')],
      6,
    );
    expect(result.kept.map((item) => item.id)).toEqual(['1']);
    expect(result.totalChars).toBe(12);
    expect(result.truncated).toBe(true);
  });

  it('首段即超预算时仍保留该段（避免空上下文）', () => {
    const result = applyCharBudget([seg('1', 'a'.repeat(20))], 5);
    expect(result.kept).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it('预算为 0 时不保留片段，有内容则标记截断', () => {
    const result = applyCharBudget([seg('1', 'abc')], 0);
    expect(result.kept).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  it('空输入返回空结果且不标记截断', () => {
    const result = applyCharBudget([], 100);
    expect(result.kept).toEqual([]);
    expect(result.totalChars).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('保留片段的顺序与输入一致', () => {
    const result = applyCharBudget(
      [seg('1', 'a'), seg('2', 'b'), seg('3', 'c')],
      2,
    );
    expect(result.kept.map((item) => item.id)).toEqual(['1', '2']);
  });
});
