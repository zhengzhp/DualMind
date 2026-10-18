/**
 * 本页 Agent 执行记录导出为 Markdown，并触发本机下载。
 *
 * 只导出**用户可见的时间线 + 计划 + 最终结论**，不含页面原文、快照或模型隐藏推理；
 * 与阅读助手共用 `shared/export` 的下载实现，不申请 downloads 权限。
 */
import {
  downloadTextFile,
  formatExportStamp,
  sanitizeFilenamePart,
} from '@/shared/export';
import type { AgentTimelineItem } from './types';

/** 时间线 kind 的中文标签：导出文档给非开发者看，不直接写 info / tool */
const KIND_LABEL: Record<AgentTimelineItem['kind'], string> = {
  info: '信息',
  plan: '计划',
  tool: '工具',
  result: '结果',
  danger: '危险确认',
  blocked: '已拒绝',
  error: '错误',
};

const RESULT_LABEL: Record<'success' | 'incomplete' | 'cancelled', string> = {
  success: '成功',
  incomplete: '未完成',
  cancelled: '已取消',
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `HH:mm:ss`（本地时区，配合步骤顺序阅读） */
function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** `yyyy-MM-dd HH:mm`（本地时区） */
function formatDisplayTime(timestamp: number): string {
  const date = new Date(timestamp);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export interface AgentTable {
  headers: string[];
  rows: string[][];
}

/** 一行 Markdown 表格 → 单元格；不含竖线或列数不足时返回 null */
function splitTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;
  const cells = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
  return cells.length >= 2 ? cells : null;
}

/** 分隔行：| --- | :---: | ---: | */
function isSeparatorRow(line: string): boolean {
  const cells = splitTableRow(line);
  if (!cells) return false;
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

/**
 * 从 Markdown 文本中取第一张表（表头 + 分隔行 + 数据行）。
 * 只认标准 GFM 表格；没有表格时返回 null，调用方据此隐藏「导出 CSV」。
 */
export function extractFirstMarkdownTable(markdown: string): AgentTable | null {
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i + 1 < lines.length; i += 1) {
    const headers = splitTableRow(lines[i] ?? '');
    if (!headers || !isSeparatorRow(lines[i + 1] ?? '')) continue;
    const rows: string[][] = [];
    for (let j = i + 2; j < lines.length; j += 1) {
      const row = splitTableRow(lines[j] ?? '');
      if (!row) break;
      while (row.length < headers.length) row.push('');
      rows.push(row.slice(0, headers.length));
    }
    return { headers, rows };
  }
  return null;
}

export type MarkdownBlock =
  | { type: 'text'; text: string }
  | { type: 'table'; table: AgentTable };

/**
 * 结论 → 文本 / 表格分段，供面板渲染成真表格。
 * 表格之间的普通文本原样保留（换行由展示层处理）。
 */
export function splitMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join('\n');
    if (text.trim()) blocks.push({ type: 'text', text });
    buffer = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const headers = splitTableRow(lines[i] ?? '');
    if (headers && isSeparatorRow(lines[i + 1] ?? '')) {
      flush();
      const rows: string[][] = [];
      let j = i + 2;
      for (; j < lines.length; j += 1) {
        const row = splitTableRow(lines[j] ?? '');
        if (!row) break;
        while (row.length < headers.length) row.push('');
        rows.push(row.slice(0, headers.length));
      }
      blocks.push({ type: 'table', table: { headers, rows } });
      // 外层循环还会 +1，这里回退一格
      i = j - 1;
      continue;
    }
    buffer.push(lines[i] ?? '');
  }
  flush();
  return blocks;
}

/** 从后往前找最近一张结果表：最终结论通常追加在时间线末尾 */
export function findAgentExportTable(
  items: AgentTimelineItem[],
): AgentTable | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (!item) continue;
    const table = extractFirstMarkdownTable(item.summary);
    if (table) return table;
  }
  return null;
}

/** 表格 → CSV（CRLF + UTF-8 BOM，Excel 直接打开不乱码） */
export function formatAgentCsv(table: AgentTable): string {
  const escape = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = [table.headers, ...table.rows].map((row) =>
    row.map(escape).join(','),
  );
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export interface AgentExportData {
  /** 绑定页展示文案（标题 · host） */
  pageLabel: string;
  /** 用户输入的目标 */
  goal: string;
  /** 批准的计划步骤（可选） */
  planSteps?: string[];
  /** 时间线条目（按发生顺序） */
  items: AgentTimelineItem[];
  /** 任务结果；null / 未传表示进行中或尚未结束 */
  result?: 'success' | 'incomplete' | 'cancelled' | null;
  /** 面板上可见的错误文案 */
  error?: string;
  /** 便于单测固定导出时间 */
  now?: number;
}

/** 执行记录 → Markdown 正文（纯函数） */
export function formatAgentExportMarkdown(data: AgentExportData): string {
  const now = data.now ?? Date.now();
  const lines: string[] = [
    '# DualMind 本页操作记录',
    '',
    `- 页面：${data.pageLabel.trim() || '（未绑定）'}`,
    `- 目标：${data.goal.trim() || '（未填写）'}`,
    `- 导出：${formatDisplayTime(now)}`,
    `- 结果：${data.result ? RESULT_LABEL[data.result] : '进行中'}`,
    '',
  ];

  if (data.planSteps && data.planSteps.length > 0) {
    lines.push('## 执行计划', '');
    data.planSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
    lines.push('');
  }

  lines.push('## 步骤记录', '');
  if (data.items.length === 0) {
    lines.push('（暂无步骤记录）');
  } else {
    for (const item of data.items) {
      const reasons = item.reasons?.length
        ? `（${item.reasons.join('；')}）`
        : '';
      const head = `- ${formatClock(item.at)} [${KIND_LABEL[item.kind]}]`;
      // finish 的结论常是多行 Markdown：直接拼进列表项会把后续行拆成同级条目，
      // 这里用缩进引用块保持「一条记录 = 一个块」。
      if (/\r?\n/.test(item.summary)) {
        lines.push(`${head}${reasons}`);
        for (const line of item.summary.split(/\r?\n/)) {
          lines.push(`  > ${line}`);
        }
        continue;
      }
      lines.push(`${head} ${item.summary}${reasons}`);
    }
  }

  if (data.error?.trim()) {
    lines.push('', '## 错误', '', data.error.trim());
  }

  lines.push('');
  return lines.join('\n');
}

export function buildAgentExportFilename(
  pageLabel: string,
  now = Date.now(),
): string {
  const page = sanitizeFilenamePart(pageLabel || 'page');
  return `dualmind-agent-${page}-${formatExportStamp(now)}.md`;
}

/** 生成并下载执行记录；下载失败由浏览器处理，不阻塞面板 */
export function downloadAgentExport(data: AgentExportData): void {
  downloadTextFile(
    buildAgentExportFilename(data.pageLabel, data.now),
    formatAgentExportMarkdown(data),
  );
}

export function buildAgentCsvFilename(
  pageLabel: string,
  now = Date.now(),
): string {
  const page = sanitizeFilenamePart(pageLabel || 'page');
  return `dualmind-agent-${page}-${formatExportStamp(now)}.csv`;
}

/**
 * 导出最近一张结果表为 CSV。
 * 没有表格时返回 false，由 UI 决定是否展示按钮（不导出空文件）。
 */
export function downloadAgentCsv(data: {
  pageLabel: string;
  items: AgentTimelineItem[];
  now?: number;
}): boolean {
  const table = findAgentExportTable(data.items);
  if (!table) return false;
  downloadTextFile(
    buildAgentCsvFilename(data.pageLabel, data.now),
    formatAgentCsv(table),
    'text/csv;charset=utf-8',
  );
  return true;
}
