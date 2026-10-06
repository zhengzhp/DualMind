/**
 * 网页摘要 / 问答的内容脚本挂载入口。
 *
 * 只做一件事：响应 Background 转发过来的「提取页面上下文」请求。
 * 提取是纯同步 DOM 操作，无需保持异步响应通道。
 */
import { browser } from 'wxt/browser';
import { sendMessage } from '@/shared/messaging/client';
import type { PageFabApi } from '../page-fab/types';
import { extractChatContext } from './extract';
import type { ChatContextScope } from './types';

interface ChatExtractMessage {
  type: 'content:chat-extract';
  scope: ChatContextScope;
  maxChars: number;
}

/** 悬浮入口上的「总结本页」动作 id（同时是 E2E 选择器锚点） */
export const CHAT_SUMMARIZE_ACTION_ID = 'chat-summarize';

export function mountChatContext(): void {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const type = (message as { type?: string })?.type;
    if (type !== 'content:chat-extract') return undefined;

    const { scope, maxChars } = message as ChatExtractMessage;
    try {
      sendResponse(extractChatContext({ scope, maxChars }));
    } catch {
      // 提取失败不应让 Background 侧挂起：回 null，由 UI 提示「无可用上下文」
      sendResponse(null);
    }
    return undefined;
  });
}

/**
 * 把「总结本页」注册到共享悬浮入口。
 *
 * 内容脚本只发指令：开侧栏 + 投递信箱都由 Background 完成
 * （`sidePanel.open()` 必须在用户手势有效期内调用，而手势经 sendMessage 同步可达）。
 * 未注入内容脚本的页面（chrome:// 等）本身就没有入口，无需额外降级。
 */
export function mountChatFabAction(fab: PageFabApi): void {
  fab.registerAction({
    id: CHAT_SUMMARIZE_ACTION_ID,
    label: '总结本页',
    title: '用 AI 概括当前网页要点，并在侧栏展开对话',
    icon: 'summarize',
    onClick: async () => {
      await sendMessage('chat:summarize-page', undefined);
    },
  });
}
