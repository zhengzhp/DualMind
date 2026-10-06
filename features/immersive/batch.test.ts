import { describe, expect, it } from 'vitest';
import {
  MAX_CHARS_PER_BATCH,
  MAX_SEGMENTS_PER_BATCH,
  chunkSegments,
} from './batch';
import type { ImmersiveSegment } from './types';

function seg(id: string, length: number): ImmersiveSegment {
  return { id, text: 'x'.repeat(length) };
}

describe('chunkSegments', () => {
  it('空列表返回空批', () => {
    expect(chunkSegments([])).toEqual([]);
  });

  it('未超阈值时合并为单批', () => {
    const batches = chunkSegments([seg('a', 5), seg('b', 5)]);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('超出片段数阈值时切分', () => {
    const list = Array.from({ length: MAX_SEGMENTS_PER_BATCH + 1 }, (_, i) =>
      seg(`s${i}`, 1),
    );
    const batches = chunkSegments(list);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(MAX_SEGMENTS_PER_BATCH);
    expect(batches[1]).toHaveLength(1);
  });

  it('超出字符数阈值时切分', () => {
    const half = Math.floor(MAX_CHARS_PER_BATCH / 2) + 1;
    const batches = chunkSegments([seg('a', half), seg('b', half)]);
    expect(batches).toHaveLength(2);
  });

  it('超长的单个片段独占一批且不被截断', () => {
    const huge = MAX_CHARS_PER_BATCH * 2;
    const batches = chunkSegments([seg('a', huge), seg('b', 3)]);
    expect(batches).toHaveLength(2);
    expect(batches[0]?.[0]?.text).toHaveLength(huge);
  });

  it('保持原始顺序', () => {
    const list = [
      seg('a', MAX_CHARS_PER_BATCH),
      seg('b', 1),
      seg('c', 1),
    ];
    const batches = chunkSegments(list);
    expect(batches.flat().map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
});
