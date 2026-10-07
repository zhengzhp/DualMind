/**
 * Agent 内容脚本挂载：响应 Background 转发的工具执行请求
 * 不主动操作页面；不持有 Key。
 */
import { browser } from 'wxt/browser';
import { sendMessage } from '@/shared/messaging/client';
import type { PageFabApi } from '../page-fab/types';
import { executeAgentTool } from './executor';
import { parseAgentToolCall } from './tools';
import {
  AGENT_EXECUTE_MESSAGE,
  type AgentExecuteMessage,
  type AgentToolResult,
} from './types';

/** 悬浮入口动作 id（E2E 可锚定） */
export const AGENT_FAB_ACTION_ID = 'agent-open';

function isExecuteMessage(raw: unknown): raw is AgentExecuteMessage {
  if (!raw || typeof raw !== 'object') return false;
  const m = raw as AgentExecuteMessage;
  return m.type === AGENT_EXECUTE_MESSAGE && typeof m.tool === 'string';
}

/**
 * 注册 `content:agent-execute` 监听。
 * 与 chat 上下文一样：disabledHosts 早退时本文件不会被挂载。
 */
export function mountAgentExecutor(): void {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isExecuteMessage(message)) return undefined;

    void (async () => {
      let result: AgentToolResult;
      try {
        // 再校验一遍，防止 BG 以外的伪造 / 过期契约
        const parsed = parseAgentToolCall(
          message.tool,
          JSON.stringify(message.args ?? {}),
        );
        if (!parsed.ok) {
          result = {
            ok: false,
            tool: message.tool,
            summary: parsed.error,
            error: parsed.error,
          };
        } else {
          result = await executeAgentTool(parsed.args);
        }
      } catch (err) {
        result = {
          ok: false,
          tool: message.tool,
          summary: err instanceof Error ? err.message : '执行失败',
          error: err instanceof Error ? err.message : String(err),
        };
      }
      sendResponse(result);
    })();

    // 异步响应
    return true;
  });
}

/**
 * 注册「请 Agent 操作本页」到共享悬浮入口。
 * 开侧栏 + 信箱由 Background 在手势窗口内完成。
 */
export function mountAgentFabAction(fab: PageFabApi): void {
  fab.registerAction({
    id: AGENT_FAB_ACTION_ID,
    label: '请 Agent 操作本页',
    title: '打开侧栏 Agent，在确认计划后操作当前页',
    icon: 'agent',
    onClick: async () => {
      await sendMessage('agent:open-panel', undefined);
    },
  });
}
