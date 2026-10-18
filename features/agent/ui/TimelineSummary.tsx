import { useMemo } from 'react';
import { splitMarkdownBlocks } from '../export';

/**
 * 时间线结论的轻量渲染：只把 Markdown 表格变成真表格，其余文本保留换行。
 *
 * 为什么不做完整 Markdown 渲染：Agent 结论里真正高频的只有表格（比价 / 筛选 / 链接收集），
 * 为它引入一个 Markdown 渲染依赖不划算；导出文件仍保留原始 Markdown，供用户拿去做后续处理。
 */

/** 去掉**展示用**的行内标记；导出文件不受影响 */
function cleanInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '');
}

/** 表格单元格：Markdown 链接 / 裸 URL 渲染成可点链接 */
function TableCell({ value }: { value: string }) {
  const trimmed = value.trim();
  const mdLink = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(trimmed);
  const url = mdLink?.[2] ?? (/^https?:\/\//.test(trimmed) ? trimmed : null);
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="break-all text-accent underline underline-offset-2"
      >
        {mdLink?.[1] ?? url}
      </a>
    );
  }
  return <>{cleanInline(value)}</>;
}

export function TimelineSummary({
  text,
  className = '',
}: {
  text: string;
  /** 语义色（危险 / 错误等）只作用于文本段，表格保持中性 */
  className?: string;
}) {
  const blocks = useMemo(() => splitMarkdownBlocks(text), [text]);
  return (
    <>
      {blocks.map((block, index) =>
        block.type === 'table' ? (
          <div key={index} className="my-1.5 overflow-x-auto">
            <table className="w-full border-collapse text-left text-label leading-[18px]">
              <thead>
                <tr>
                  {block.table.headers.map((header, cell) => (
                    <th
                      key={cell}
                      className="border-b border-line px-1.5 py-1 font-semibold text-ink-2"
                    >
                      {cleanInline(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cellValue, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="border-b border-line/70 px-1.5 py-1 align-top text-ink-2"
                      >
                        <TableCell value={cellValue} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <span
            key={index}
            className={`whitespace-pre-wrap break-words ${className}`}
          >
            {cleanInline(block.text)}
          </span>
        ),
      )}
    </>
  );
}
