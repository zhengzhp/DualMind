import { describe, expect, it } from 'vitest';
import {
  buildAgentCsvFilename,
  buildAgentExportFilename,
  extractFirstMarkdownTable,
  findAgentExportTable,
  formatAgentCsv,
  formatAgentExportMarkdown,
  splitMarkdownBlocks,
} from './export';
import type { AgentTimelineItem } from './types';

/** 固定本地时间，避免测试随时区漂移 */
const NOW = new Date(2026, 9, 19, 0, 30, 5).getTime();

function item(
  kind: AgentTimelineItem['kind'],
  summary: string,
  extra: Partial<AgentTimelineItem> = {},
): AgentTimelineItem {
  return {
    id: `${kind}-${summary}`,
    at: NOW,
    kind,
    summary,
    ...extra,
  };
}

describe('formatAgentExportMarkdown', () => {
  it('导出页头、计划与步骤记录', () => {
    const md = formatAgentExportMarkdown({
      pageLabel: '示例页 · example.com',
      goal: '把本页价格整理成排序清单',
      planSteps: ['观察页面', '提取价格', '排序'],
      items: [
        item('info', '正在根据目标生成步骤计划'),
        item('plan', '计划 3 步：观察页面 → 提取价格 → 排序'),
        item('tool', '准备 extract_text', { tool: 'extract_text' }),
        item('result', '已抽取页面文本 1200 字', { tool: 'extract_text' }),
      ],
      result: 'success',
      now: NOW,
    });

    expect(md).toContain('# DualMind 本页操作记录');
    expect(md).toContain('- 页面：示例页 · example.com');
    expect(md).toContain('- 目标：把本页价格整理成排序清单');
    expect(md).toContain('- 导出：2026-10-19 00:30');
    expect(md).toContain('- 结果：成功');
    expect(md).toContain('1. 观察页面');
    expect(md).toContain('3. 排序');
    expect(md).toContain('- 00:30:05 [计划] 计划 3 步');
    expect(md).toContain('- 00:30:05 [结果] 已抽取页面文本 1200 字');
  });

  it('空记录与进行中状态给出可读占位', () => {
    const md = formatAgentExportMarkdown({
      pageLabel: '',
      goal: '',
      items: [],
      now: NOW,
    });
    expect(md).toContain('- 页面：（未绑定）');
    expect(md).toContain('- 目标：（未填写）');
    expect(md).toContain('- 结果：进行中');
    expect(md).toContain('（暂无步骤记录）');
    expect(md).not.toContain('## 执行计划');
  });

  it('多行结论用缩进引用块，不拆散步骤列表', () => {
    const md = formatAgentExportMarkdown({
      pageLabel: '列表页',
      goal: '提取价格',
      items: [item('result', '## 价格清单\n- A ¥10\n- B ¥8')],
      result: 'success',
      now: NOW,
    });
    expect(md).toContain('- 00:30:05 [结果]\n  > ## 价格清单\n  > - A ¥10\n  > - B ¥8');
    expect(md).not.toContain('- 00:30:05 [结果] ##');
  });

  it('危险原因与错误单独成段', () => {
    const md = formatAgentExportMarkdown({
      pageLabel: '表单页',
      goal: '删掉草稿',
      items: [
        item('danger', '即将执行 click', { reasons: ['文案疑似删除', '不可撤销'] }),
        item('error', '工具执行失败'),
      ],
      result: 'incomplete',
      error: '网络连接失败',
      now: NOW,
    });
    expect(md).toContain('- 结果：未完成');
    expect(md).toContain('[危险确认] 即将执行 click（文案疑似删除；不可撤销）');
    expect(md).toContain('## 错误');
    expect(md).toContain('网络连接失败');
  });
});

describe('Markdown 表格 → CSV', () => {
  const markdown = [
    '## 参数对比',
    '',
    '| 项目 | 套餐 A | 套餐 B |',
    '| --- | ---: | :---: |',
    '| 价格 | 19 | 29 |',
    '| 流量 | 30G | 100G |',
    '',
    '以上为虚构数据。',
  ].join('\n');

  it('解析表头与数据行', () => {
    expect(extractFirstMarkdownTable(markdown)).toEqual({
      headers: ['项目', '套餐 A', '套餐 B'],
      rows: [
        ['价格', '19', '29'],
        ['流量', '30G', '100G'],
      ],
    });
  });

  it('没有表格时返回 null', () => {
    expect(extractFirstMarkdownTable('只有一段普通结论')).toBeNull();
    expect(extractFirstMarkdownTable('| 不是表格 |\n| 只是文本 |')).toBeNull();
  });

  it('从时间线末尾取最近一张表', () => {
    const items = [
      item('plan', '计划 2 步'),
      item('result', markdown),
      item('info', '任务结束'),
    ];
    expect(findAgentExportTable(items)?.rows).toHaveLength(2);
    expect(findAgentExportTable([item('info', '无表格')])).toBeNull();
  });

  it('CSV 转义逗号 / 引号，并带 BOM 与 CRLF', () => {
    const csv = formatAgentCsv({
      headers: ['名称', '备注'],
      rows: [
        ['A', '含,逗号'],
        ['B', '含"引号"'],
      ],
    });
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('名称,备注\r\n');
    expect(csv).toContain('A,"含,逗号"\r\n');
    expect(csv).toContain('B,"含""引号"""\r\n');
  });

  it('CSV 文件名使用 .csv 后缀', () => {
    expect(buildAgentCsvFilename('比价页', NOW)).toBe(
      'dualmind-agent-比价页-20261019-0030.csv',
    );
  });
});

describe('splitMarkdownBlocks', () => {
  it('把结论拆成文本 / 表格 / 文本', () => {
    const blocks = splitMarkdownBlocks(
      [
        '## 参数对比',
        '',
        '| 项目 | 套餐 A | 套餐 B |',
        '| --- | --- | --- |',
        '| 价格 | 19 | 29 |',
        '',
        '以上为虚构数据。',
      ].join('\n'),
    );
    expect(blocks.map((block) => block.type)).toEqual([
      'text',
      'table',
      'text',
    ]);
    const [first, table, last] = blocks;
    expect(first?.type === 'text' && first.text).toContain('参数对比');
    expect(table?.type === 'table' && table.table.headers).toEqual([
      '项目',
      '套餐 A',
      '套餐 B',
    ]);
    expect(last?.type === 'text' && last.text.trim()).toBe('以上为虚构数据。');
  });

  it('没有表格时只有一个文本块', () => {
    const blocks = splitMarkdownBlocks('只有结论，没有表格。');
    expect(blocks).toEqual([{ type: 'text', text: '只有结论，没有表格。' }]);
  });

  it('支持多张表', () => {
    const blocks = splitMarkdownBlocks(
      ['| A | B |', '| --- | --- |', '| 1 | 2 |', '', '| C | D |', '| --- | --- |', '| 3 | 4 |'].join(
        '\n',
      ),
    );
    expect(blocks.filter((block) => block.type === 'table')).toHaveLength(2);
  });
});

describe('buildAgentExportFilename', () => {
  it('清洗页面标题并带本地时间戳', () => {
    expect(buildAgentExportFilename('概览 · Pipio · pipio.io', NOW)).toBe(
      'dualmind-agent-概览 · Pipio · pipio.io-20261019-0030.md',
    );
  });

  it('非法字符替换、空标题回退 page', () => {
    expect(buildAgentExportFilename('a/b:c*d', NOW)).toBe(
      'dualmind-agent-a-b-c-d-20261019-0030.md',
    );
    expect(buildAgentExportFilename('', NOW)).toBe(
      'dualmind-agent-page-20261019-0030.md',
    );
  });
});
