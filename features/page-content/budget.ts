/**
 * 页面上下文截断预算（共享层）。
 *
 * 长文整页可能远超模型上下文，也会显著抬高费用与延迟。策略：**按段累加，
 * 超出预算即停止**（不切半段，避免把一句话劈成两半影响模型理解）。
 * 纯函数，便于单测。
 */

/** 预算结果 */
export interface CharBudgetResult<T> {
  /** 预算内保留的片段 */
  kept: T[];
  /** 截断前的字符总数 */
  totalChars: number;
  /** 是否发生了截断 */
  truncated: boolean;
}

/**
 * 按字符预算截断片段列表。
 *
 * 边界约定：
 * - `maxChars <= 0`：不保留任何片段，并标记为已截断（有内容时）。
 * - 首段本身就超预算：仍**至少保留该段**（否则整页空白，对用户更差），并标记截断。
 */
export function applyCharBudget<T extends { text: string }>(
  segments: readonly T[],
  maxChars: number,
): CharBudgetResult<T> {
  const totalChars = segments.reduce(
    (sum, segment) => sum + segment.text.length,
    0,
  );

  if (maxChars <= 0) {
    return { kept: [], totalChars, truncated: segments.length > 0 };
  }

  const kept: T[] = [];
  let used = 0;
  let truncated = false;

  for (const segment of segments) {
    const next = used + segment.text.length;
    if (next > maxChars) {
      // 首段就超预算时保留它，宁可超出也不返回空上下文
      if (kept.length === 0) {
        kept.push(segment);
      }
      truncated = true;
      break;
    }
    kept.push(segment);
    used = next;
  }

  return { kept, totalChars, truncated };
}
