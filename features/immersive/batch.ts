/**
 * 分批策略（纯逻辑）。
 * 只依赖片段数量与字符数，不碰 DOM / 网络，便于单测。
 */
import type { ImmersiveSegment } from './types';

/** 单批最多片段数：段数过多容易让模型漏译 */
export const MAX_SEGMENTS_PER_BATCH = 12;

/** 单批最多字符数：控制上下文规模与失败重试粒度 */
export const MAX_CHARS_PER_BATCH = 1800;

/**
 * 把片段列表按阈值切成多批，保持原始顺序。
 * 单个超长片段会独占一批（不拆分原文，避免语义被截断）。
 */
export function chunkSegments(
  segments: ImmersiveSegment[],
): ImmersiveSegment[][] {
  const batches: ImmersiveSegment[][] = [];
  let current: ImmersiveSegment[] = [];
  let chars = 0;

  for (const segment of segments) {
    const length = segment.text.length;
    const wouldOverflow =
      current.length > 0 &&
      (current.length >= MAX_SEGMENTS_PER_BATCH ||
        chars + length > MAX_CHARS_PER_BATCH);

    if (wouldOverflow) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(segment);
    chars += length;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}
