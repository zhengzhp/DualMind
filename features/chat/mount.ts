/**
 * 网页摘要 / 问答的内容脚本挂载入口。
 *
 * 只做一件事：响应 Background 转发过来的「提取页面上下文」请求。
 * 提取是纯同步 DOM 操作，无需保持异步响应通道。
 */
import { browser } from 'wxt/browser';
import { extractChatContext } from './extract';
import type { ChatContextScope } from './types';

interface ChatExtractMessage {
  type: 'content:chat-extract';
  scope: ChatContextScope;
  maxChars: number;
}

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
