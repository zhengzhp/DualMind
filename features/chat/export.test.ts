import { describe, expect, it } from 'vitest';
import type { ChatSession, ChatTurn } from '@/shared/storage/types';
import {
  buildAllSessionsExportFilename,
  buildSessionExportFilename,
  formatAllSessionsMarkdown,
  formatExportStamp,
  formatSessionMarkdown,
  sanitizeFilenamePart,
} from './export';

function turn(
  id: string,
  role: ChatTurn['role'],
  content: string,
  error?: string,
): ChatTurn {
  return { id, role, content, createdAt: 1, error };
}

function session(partial: Partial<ChatSession> & Pick<ChatSession, 'id'>): ChatSession {
  const now = 1_700_000_000_000;
  return {
    title: '示例会话',
    pageUrl: 'https://example.com/a',
    pageTitle: '示例页',
    turns: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('sanitizeFilenamePart', () => {
  it('去掉路径非法字符并截断', () => {
    expect(sanitizeFilenamePart('a/b:c*d?.md', 20)).toBe('a-b-c-d-.md');
    expect(sanitizeFilenamePart('x'.repeat(50), 10)).toHaveLength(10);
  });

  it('空串回退 untitled', () => {
    expect(sanitizeFilenamePart('   ')).toBe('untitled');
    expect(sanitizeFilenamePart('...')).toBe('untitled');
  });
});

describe('formatExportStamp', () => {
  it('格式为 yyyyMMdd-HHmm', () => {
    // 固定本地时区下的某一刻：用构造函数指定本地分量
    const stamp = formatExportStamp(new Date(2026, 9, 7, 7, 5).getTime());
    expect(stamp).toBe('20261007-0705');
  });
});

describe('formatSessionMarkdown', () => {
  it('含标题、来源与对话轮次', () => {
    const md = formatSessionMarkdown(
      session({
        id: 's1',
        title: '关于 AI',
        turns: [
          turn('t1', 'user', '总结一下'),
          turn('t2', 'assistant', '要点如下'),
        ],
      }),
    );
    expect(md).toContain('# 关于 AI');
    expect(md).toContain('- 来源：示例页');
    expect(md).toContain('- 地址：https://example.com/a');
    expect(md).toContain('### 用户');
    expect(md).toContain('总结一下');
    expect(md).toContain('### 助手');
    expect(md).toContain('要点如下');
  });

  it('空会话写明尚无消息', () => {
    const md = formatSessionMarkdown(session({ id: 'empty', turns: [] }));
    expect(md).toContain('（本会话尚无消息）');
  });

  it('助手失败轮如实写入，不伪装成功', () => {
    const md = formatSessionMarkdown(
      session({
        id: 'err',
        turns: [turn('t1', 'assistant', '半截', '网络超时')],
      }),
    );
    expect(md).toContain('半截');
    expect(md).toContain('> 失败：网络超时');
  });

  it('缺失标题 / 页面时有回退文案', () => {
    const md = formatSessionMarkdown(
      session({
        id: 'bare',
        title: '  ',
        pageTitle: '',
        pageUrl: '',
      }),
    );
    expect(md).toContain('# 未命名会话');
    expect(md).toContain('- 来源：未记录页面');
    expect(md).toContain('- 地址：（无地址）');
  });
});

describe('formatAllSessionsMarkdown', () => {
  it('按 updatedAt 降序并用水平线分隔', () => {
    const older = session({
      id: 'old',
      title: '旧会话',
      updatedAt: 100,
      turns: [turn('t1', 'user', '旧问')],
    });
    const newer = session({
      id: 'new',
      title: '新会话',
      updatedAt: 200,
      turns: [turn('t2', 'user', '新问')],
    });
    const md = formatAllSessionsMarkdown([older, newer]);
    expect(md).toContain('# DualMind 网页助手 · 全部会话');
    expect(md).toContain('共 2 个会话');
    expect(md.indexOf('# 新会话')).toBeLessThan(md.indexOf('# 旧会话'));
    expect(md).toContain('---');
  });

  it('空列表不抛错', () => {
    expect(formatAllSessionsMarkdown([])).toContain('（无会话）');
  });
});

describe('export filenames', () => {
  it('单条与全部文件名符合约定', () => {
    const now = new Date(2026, 9, 7, 8, 30).getTime();
    expect(
      buildSessionExportFilename(
        session({ id: 's', title: '你好/世界' }),
        now,
      ),
    ).toBe('dualmind-chat-你好-世界-20261007-0830.md');
    expect(buildAllSessionsExportFilename(now)).toBe(
      'dualmind-chat-all-20261007-0830.md',
    );
  });
});
