/**
 * 通用本机导出工具（阅读助手 / Agent 共用）。
 *
 * 纯 DOM + Blob，不经 Background、不申请 downloads 权限；
 * 文件名片段与时间戳保持各功能一致，便于用户在一堆导出里辨认。
 */

/** 文件名片段：去掉路径非法字符，截断，空则回退 untitled */
export function sanitizeFilenamePart(raw: string, maxLen = 40): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
    .replace(/[. ]+$/g, '');
  return cleaned || 'untitled';
}

/** `yyyyMMdd-HHmm`（本地时区） */
export function formatExportStamp(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

/** 在扩展页（Side Panel / 工作台 / Options）触发本机下载 */
export function downloadTextFile(
  filename: string,
  text: string,
  mime = 'text/markdown;charset=utf-8',
): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
