import { describe, expect, it } from 'vitest';
import type { ChatTurn } from '@/shared/storage/types';
import { MAX_HISTORY_TURNS, buildChatMessages, formatContext } from './prompts';
import type { ChatContextPayload } from './types';

const context: ChatContextPayload = {
  scope: 'page',
  url: 'https://example.com/post',
  title: '示例文章',
  segments: [
    { id: 's1', text: '第一段内容' },
    { id: 's2', text: '第二段内容' },
  ],
  totalChars: 10,
  truncated: false,
};

function userTurn(id: string, content: string): ChatTurn {
  return { id, role: 'user', content, createdAt: 0 };
}

function assistantTurn(id: string, content: string, error?: string): ChatTurn {
  return { id, role: 'assistant', content, createdAt: 0, error };
}

describe('formatContext', () => {
  it('带编号输出片段，并含标题与地址', () => {
    const text = formatContext(context);
    expect(text).toContain('页面标题：示例文章');
    expect(text).toContain('页面地址：https://example.com/post');
    expect(text).toContain('[1] 第一段内容');
    expect(text).toContain('[2] 第二段内容');
  });

  it('截断时附精简说明', () => {
    const text = formatContext({ ...context, truncated: true });
    expect(text).toContain('以上仅为前若干段落');
  });

  it('缺失标题 / 地址时不产生空行残留', () => {
    const text = formatContext({ ...context, title: '', url: '' });
    expect(text.startsWith('网页内容：')).toBe(true);
  });
});

describe('buildChatMessages', () => {
  it('结构为：角色 system → 上下文 system → 历史 → 本次提问', () => {
    const messages = buildChatMessages({
      context,
      history: [userTurn('1', '这是网页吗？'), assistantTurn('2', '是的')],
      question: '它的结论是什么？',
    });

    expect(messages.map((message) => message.role)).toEqual([
      'system',
      'system',
      'user',
      'assistant',
      'user',
    ]);
    expect(messages[1]!.content).toContain('[1] 第一段内容');
    expect(messages[messages.length - 1]!.content).toBe('它的结论是什么？');
  });

  it('无上下文时给出显式兜底说明，而非空 system', () => {
    const messages = buildChatMessages({
      context: null,
      history: [],
      question: '你好',
    });
    expect(messages[1]!.content).toContain('没有可用的网页内容');
  });

  it('跳过空内容与失败的助手轮次（避免污染上下文）', () => {
    const messages = buildChatMessages({
      context: null,
      history: [
        userTurn('1', '   '),
        assistantTurn('2', '正常回答'),
        assistantTurn('3', '失败文案', '请求失败'),
        userTurn('4', '追问'),
      ],
      question: '继续',
    });
    const contents = messages.map((message) => message.content);
    expect(contents).not.toContain('失败文案');
    expect(contents).toContain('正常回答');
    expect(contents).toContain('追问');
  });

  it('历史超过上限时只保留最近 MAX_HISTORY_TURNS 条', () => {
    const history = Array.from({ length: MAX_HISTORY_TURNS + 5 }, (_, i) =>
      userTurn(String(i), `第 ${i} 轮`),
    );
    const messages = buildChatMessages({
      context: null,
      history,
      question: '最新问题',
    });
    // 2 条 system + 20 条历史 + 1 条提问
    expect(messages).toHaveLength(MAX_HISTORY_TURNS + 3);
    expect(messages[2]!.content).toBe('第 5 轮');
  });
});
