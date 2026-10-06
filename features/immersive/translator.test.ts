import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/providers/types';

// 隔离模型调用：用 hoisted 保证 vi.mock 提升后仍可引用同一 mock
const { runChat } = vi.hoisted(() => ({ runChat: vi.fn() }));

vi.mock('@/shared/llm/run', () => ({ runChat }));

import { translateBatch } from './translator';

/** 取出 user 提示（messages[1]）的纯文本 */
function userText(messages: ChatMessage[]): string {
  return String(messages[1]?.content ?? '');
}

beforeEach(() => {
  runChat.mockReset();
});

describe('translateBatch 回显兜底（P0）', () => {
  it('批量回显 → 逐段补译成功，标记非未翻译', async () => {
    const segments = [
      { id: 'a', text: 'Bonjour le monde' },
      { id: 'b', text: 'Hola mundo' },
    ];
    runChat.mockImplementation(async ({ messages }: { messages: ChatMessage[] }) => {
      const user = userText(messages);
      // 批量请求含 [[2]]：模拟代码模型原样抄写
      if (user.includes('[[2]]')) return { content: user };
      // 单段补译：返回真正译文
      return { content: `[[1]]\n译:${user.replace('[[1]]\n', '')}` };
    });

    const results = await translateBatch(segments, 'zh-CN');
    expect(results).toEqual([
      { id: 'a', text: '译:Bonjour le monde' },
      { id: 'b', text: '译:Hola mundo' },
    ]);
  });

  it('单段补译仍回显 → 标记 untranslated，不伪装成功', async () => {
    const segments = [
      { id: 'a', text: 'Bonjour' },
      { id: 'b', text: 'Hola' },
    ];
    runChat.mockImplementation(async ({ messages }: { messages: ChatMessage[] }) => ({
      content: userText(messages),
    }));

    const results = await translateBatch(segments, 'zh-CN');
    expect(results).toEqual([
      { id: 'a', text: 'Bonjour', untranslated: true },
      { id: 'b', text: 'Hola', untranslated: true },
    ]);
  });

  it('单段输入即回显 → 标记 untranslated', async () => {
    runChat.mockImplementation(async ({ messages }: { messages: ChatMessage[] }) => ({
      content: userText(messages),
    }));

    const results = await translateBatch([{ id: 'a', text: 'Bonjour' }], 'zh-CN');
    expect(results).toEqual([
      { id: 'a', text: 'Bonjour', untranslated: true },
    ]);
  });

  it('正常批量译文不误判', async () => {
    runChat.mockImplementation(async () => ({
      content: '[[1]]\n你好\n[[2]]\n世界',
    }));

    const results = await translateBatch(
      [
        { id: 'a', text: 'Hello' },
        { id: 'b', text: 'World' },
      ],
      'zh-CN',
    );
    expect(results).toEqual([
      { id: 'a', text: '你好' },
      { id: 'b', text: '世界' },
    ]);
  });
});
