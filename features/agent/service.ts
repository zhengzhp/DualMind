/**
 * Background：Agent 计划闸门 + tool-calling 环（不碰 DOM）
 */
import type { ChatMessage, ToolCall } from '@/providers/types';
import { AppError, toUserMessage } from '@/shared/errors';
import { runChat, runChatWithTools } from '@/shared/llm/run';
import type { AgentPortServerMessage } from '@/shared/messaging/protocol';
import { classifyDanger } from './danger';
import {
  buildAgentKickoffMessages,
  buildPlanMessages,
  parseAgentPlan,
} from './prompts';
import {
  AGENT_TOOL_DEFINITIONS,
  flattenToolArgs,
  parseAgentToolCall,
} from './tools';
import type {
  AgentExecutionGuard,
  AgentTimelineItem,
  AgentToolArgs,
  AgentToolName,
  AgentToolResult,
  SnapshotElement,
  SnapshotPayload,
} from './types';

export const TOOL_TIMEOUT_MS = 15_000;

export type PlanDecision = 'approved' | 'rejected' | 'aborted';
export type DangerDecision = 'confirmed' | 'rejected' | 'aborted';

export interface AgentTaskGate {
  waitPlanApproval(): Promise<PlanDecision>;
  waitDangerConfirm(stepId: string): Promise<DangerDecision>;
}

export interface RunAgentTaskOptions {
  taskId: string;
  goal: string;
  pageUrl: string;
  pageTitle: string;
  maxSteps: number;
  signal: AbortSignal;
  gate: AgentTaskGate;
  post: (msg: AgentPortServerMessage) => void;
  /** 向内容脚本执行已校验工具 */
  executeTool: (
    tool: AgentToolName,
    args: Record<string, unknown>,
    guard: AgentExecutionGuard,
  ) => Promise<AgentToolResult>;
}

function item(
  kind: AgentTimelineItem['kind'],
  summary: string,
  extra?: Partial<AgentTimelineItem>,
): AgentTimelineItem {
  return {
    id: `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: Date.now(),
    kind,
    summary,
    ...extra,
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new AppError(toUserMessage('ABORTED'), 'ABORTED');
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  signal: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new AppError(`工具执行超时（${ms}ms）`, 'UNKNOWN'));
    }, ms);
  });
  const onAbort = () => {
    rejectAbort();
  };
  let rejectAbort: () => void = () => {};
  const abortPromise = new Promise<never>((_, reject) => {
    rejectAbort = () =>
      reject(new AppError(toUserMessage('ABORTED'), 'ABORTED'));
  });
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    return await Promise.race([promise, timeout, abortPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

/**
 * 跑完一次 Agent 任务（计划 → 批准 → tool 环）
 */
export async function runAgentTask(options: RunAgentTaskOptions): Promise<void> {
  const { taskId, goal, pageUrl, pageTitle, maxSteps, signal, gate, post } =
    options;

  const emitPhase = (
    phase: import('./types').AgentTaskPhase,
    message?: string,
  ) => {
    post({ type: 'phase', taskId, phase, message });
  };

  const emitTimeline = (entry: AgentTimelineItem) => {
    post({ type: 'timeline', taskId, item: entry });
  };

  emitPhase('planning', '正在生成计划…');
  emitTimeline(item('info', '正在根据目标生成步骤计划'));

  const planRaw = await runChat({
    messages: buildPlanMessages({ goal, pageUrl, pageTitle }),
    signal,
  });
  throwIfAborted(signal);

  const plan = parseAgentPlan(planRaw.content);
  if (!plan || plan.steps.length === 0) {
    throw new AppError(
      '模型未返回可用计划。请确认当前模型可用，或换一个支持指令遵循的模型。',
      'EMPTY_RESPONSE',
    );
  }

  post({ type: 'plan', taskId, plan });
  emitPhase('awaiting_plan', '请确认计划后再执行');
  emitTimeline(
    item('plan', `计划 ${plan.steps.length} 步：${plan.steps.join(' → ')}`),
  );

  const planDecision = await gate.waitPlanApproval();
  throwIfAborted(signal);
  if (planDecision !== 'approved') {
    emitPhase(planDecision === 'aborted' ? 'aborted' : 'idle', '已取消计划');
    if (planDecision === 'aborted') {
      throw new AppError(toUserMessage('ABORTED'), 'ABORTED');
    }
    post({
      type: 'done',
      taskId,
      summary: '用户未批准计划',
      success: false,
      cancelled: true,
    });
    return;
  }

  emitPhase('running', '计划已批准，开始执行');
  emitTimeline(item('info', '计划已批准，开始本页操作'));

  const messages: ChatMessage[] = buildAgentKickoffMessages({
    goal,
    pageUrl,
    pageTitle,
    plan,
  });

  let lastElements: SnapshotElement[] = [];
  let snapshotId: string | undefined;
  let currentUrl = pageUrl;
  /**
   * 连续「模型未返回任何 tool_calls」的轮数。
   * 模型不支持 tool calling 时（例如把 tools 当纯文本忽略），会一直给文本而
   * 不调用工具；此处只容忍一次（用于「先思考再行动」的模型），连续两次即判定
   * 不支持并明确失败，避免无意义地反复催促到轮数上限。
   */
  let noToolRounds = 0;

  for (let round = 0; round < maxSteps; round += 1) {
    throwIfAborted(signal);

    const result = await runChatWithTools({
      messages,
      tools: AGENT_TOOL_DEFINITIONS,
      tool_choice: 'auto',
      signal,
    });
    throwIfAborted(signal);

    if (result.content?.trim()) {
      emitTimeline(
        item('info', truncate(result.content.trim(), 240)),
      );
    }

    const toolCalls = result.tool_calls ?? [];
    if (toolCalls.length === 0) {
      noToolRounds += 1;
      if (noToolRounds >= 2) {
        // 连续两轮零 tool_calls：判定模型不支持 tools，明确失败而非无限催促
        throw new AppError(toUserMessage('TOOLS_UNSUPPORTED'), 'TOOLS_UNSUPPORTED');
      }
      // 首次无工具：催促一次，给「先思考再行动」的模型一个机会
      messages.push({
        role: 'assistant',
        content: result.content || '',
      });
      messages.push({
        role: 'user',
        content:
          '请继续：调用 snapshot/click/fill 等工具推进目标，或调用 finish 结束并说明结果。',
      });
      continue;
    }
    noToolRounds = 0;

    messages.push({
      role: 'assistant',
      content: result.content || '',
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      throwIfAborted(signal);
      const outcome = await handleOneToolCall({
        call,
        taskId,
        currentUrl,
        lastElements,
        snapshotId,
        signal,
        gate,
        post,
        emitPhase,
        emitTimeline,
        executeTool: options.executeTool,
      });

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(outcome.toolPayload),
      });

      if (outcome.snapshotElements) {
        lastElements = outcome.snapshotElements;
        snapshotId = outcome.snapshotId;
      }
      if (outcome.pageUrl) currentUrl = outcome.pageUrl;

      if (outcome.finished) {
        emitPhase('done');
        post({
          type: 'done',
          taskId,
          summary: outcome.finishSummary || '任务结束',
          success: outcome.finishSuccess !== false,
        });
        return;
      }
    }
  }

  emitPhase('done', '已达最大步数');
  post({
    type: 'done',
    taskId,
    summary: `已达到最大步数（${maxSteps}），任务停止。可缩小目标后重试。`,
    success: false,
  });
}

interface ToolCallOutcome {
  toolPayload: unknown;
  finished?: boolean;
  finishSummary?: string;
  finishSuccess?: boolean;
  snapshotElements?: SnapshotElement[];
  snapshotId?: string;
  pageUrl?: string;
}

async function handleOneToolCall(ctx: {
  call: ToolCall;
  taskId: string;
  currentUrl: string;
  lastElements: SnapshotElement[];
  snapshotId?: string;
  signal: AbortSignal;
  gate: AgentTaskGate;
  post: (msg: AgentPortServerMessage) => void;
  emitPhase: (phase: import('./types').AgentTaskPhase, message?: string) => void;
  emitTimeline: (entry: AgentTimelineItem) => void;
  executeTool: RunAgentTaskOptions['executeTool'];
}): Promise<ToolCallOutcome> {
  const parsed = parseAgentToolCall(
    ctx.call.function.name,
    ctx.call.function.arguments || '{}',
  );
  if (!parsed.ok) {
    ctx.emitTimeline(item('error', parsed.error));
    return { toolPayload: { ok: false, error: parsed.error } };
  }

  const args = parsed.args;
  const element =
    'index' in args && typeof args.index === 'number'
      ? ctx.lastElements.find((e) => e.index === args.index) ?? null
      : null;

  const danger = classifyDanger({
    tool: args.tool,
    args,
    element,
    pageUrl: ctx.currentUrl,
  });

  ctx.emitTimeline(
    item('tool', `准备 ${args.tool}${formatArgsBrief(args)}`, {
      tool: args.tool,
      reasons: danger.reasons,
    }),
  );

  if (danger.level === 'blocked') {
    const summary = danger.reasons.join('；') || '已阻断';
    ctx.emitTimeline(
      item('blocked', summary, { tool: args.tool, reasons: danger.reasons }),
    );
    return {
      toolPayload: {
        ok: false,
        blocked: true,
        error: summary,
      },
    };
  }

  if (danger.level === 'dangerous') {
    const stepId = `danger-${ctx.call.id}`;
    ctx.emitPhase('awaiting_danger', '危险动作待确认');
    ctx.post({
      type: 'awaiting_danger',
      taskId: ctx.taskId,
      stepId,
      tool: args.tool,
      summary: `即将执行 ${args.tool}${formatArgsBrief(args)}`,
      reasons: danger.reasons,
    });
    ctx.emitTimeline(
      item('danger', `等待确认：${danger.reasons.join('；')}`, {
        tool: args.tool,
        reasons: danger.reasons,
      }),
    );

    const decision = await ctx.gate.waitDangerConfirm(stepId);
    throwIfAborted(ctx.signal);
    if (decision !== 'confirmed') {
      ctx.emitPhase('running', '已跳过危险动作');
      return {
        toolPayload: {
          ok: false,
          cancelled: true,
          error: '用户拒绝了该危险动作',
        },
      };
    }
    ctx.emitPhase('running');
  }

  throwIfAborted(ctx.signal);
  const execResult = await withTimeout(
    ctx.executeTool(args.tool, flattenToolArgs(args), {
      snapshotId: ctx.snapshotId,
      expectedElement: element ?? undefined,
      dangerConfirmed: danger.level === 'dangerous',
    }),
    TOOL_TIMEOUT_MS,
    ctx.signal,
  );
  throwIfAborted(ctx.signal);
  if (execResult.fatal) {
    throw new AppError(execResult.error || execResult.summary, 'UNKNOWN');
  }

  ctx.emitTimeline(
    item(execResult.ok ? 'result' : 'error', execResult.summary, {
      tool: args.tool,
    }),
  );

  const outcome: ToolCallOutcome = {
    toolPayload: {
      ok: execResult.ok,
      summary: execResult.summary,
      error: execResult.error,
      data: execResult.data,
    },
  };

  if (args.tool === 'snapshot' && execResult.ok && execResult.data) {
    const data = execResult.data as SnapshotPayload;
    outcome.snapshotElements = data.elements;
    outcome.snapshotId = data.snapshotId;
    if (data.url) outcome.pageUrl = data.url;
  }

  if (args.tool === 'finish' && execResult.ok) {
    const data = execResult.data as { success?: boolean; summary?: string };
    outcome.finished = true;
    outcome.finishSummary = data?.summary || execResult.summary;
    outcome.finishSuccess = data?.success !== false;
  }

  return outcome;
}

function formatArgsBrief(args: AgentToolArgs): string {
  if ('index' in args && typeof args.index === 'number') {
    return ` [#${args.index}]`;
  }
  if (args.tool === 'finish') return '';
  return '';
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
