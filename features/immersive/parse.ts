/**
 * 解析模型返回的「编号分段」输出。
 *
 * 约定模型按 `[[1]]` `[[2]]` … 标记逐段输出译文；此模块只做纯字符串解析，
 * 不依赖 DOM / storage，便于单测与在 Background 复用。
 */

/**
 * 按 `[[n]]` 标记解析出 count 段译文，缺失的段返回空串。
 * 兼容「标记独占一行」与「标记与译文同行」两种写法。
 */
export function parseMarkedSegments(raw: string, count: number): string[] {
  const buffers = new Map<number, string[]>();
  if (!raw) return new Array<string>(count).fill('');

  let current = -1;
  // 例：`[[2]]` 或 `[[2]] 译文开头`
  const markerRe = /^\s*\[\[(\d+)\]\]\s*(.*)$/;

  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const matched = markerRe.exec(line);
    if (matched) {
      const index = Number(matched[1]) - 1;
      if (index >= 0 && index < count) {
        current = index;
        const inline = matched[2] ?? '';
        if (inline) appendBuffer(buffers, index, inline);
        continue;
      }
    }
    if (current >= 0) appendBuffer(buffers, current, line);
  }

  return Array.from({ length: count }, (_, index) =>
    (buffers.get(index) ?? []).join('\n').trim(),
  );
}

/** 把一行文本追加到指定段的缓冲（Map 取值避免 noUncheckedIndexedAccess 噪音） */
function appendBuffer(
  buffers: Map<number, string[]>,
  index: number,
  line: string,
): void {
  const buffer = buffers.get(index) ?? [];
  buffer.push(line);
  buffers.set(index, buffer);
}

/**
 * 解析分段译文的主入口：
 * 1) 优先按标记解析；
 * 2) 若完全没有标记（模型忽略了格式），退化为按空行切分，尽力而为；
 * 3) 两者都拿不到的段返回空串，由调用方走逐段补译。
 */
export function parseSegmentedOutput(raw: string, count: number): string[] {
  const marked = parseMarkedSegments(raw, count);
  if (marked.some((text) => text.length > 0)) return marked;

  if (!raw) return marked;
  const chunks = raw
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const fallback = new Array<string>(count).fill('');
  for (let i = 0; i < Math.min(count, chunks.length); i += 1) {
    fallback[i] = chunks[i] ?? '';
  }
  return fallback;
}
