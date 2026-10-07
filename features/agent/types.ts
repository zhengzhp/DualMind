/**
 * V3 Agent · 共享类型（工具 / 危险分级 / 内容脚本执行结果）
 * Background 环与 UI 在下一步接入；本文件先稳住契约。
 */

/** V3.0 工具集（与 docs/decisions.md 一致） */
export type AgentToolName =
  | 'snapshot'
  | 'click'
  | 'type'
  | 'fill'
  | 'select'
  | 'scroll'
  | 'wait'
  | 'extract_text'
  | 'finish';

/**
 * 危险分级
 * - safe：批准计划后可自动执行
 * - dangerous：执行前须二次确认
 * - blocked：拒绝自动执行（金融域等），不靠确认放行
 */
export type DangerLevel = 'safe' | 'dangerous' | 'blocked';

export interface DangerAssessment {
  level: DangerLevel;
  reasons: string[];
}

/** 快照中的可交互元素（以 index 寻址，避免脆弱 CSS） */
export interface SnapshotElement {
  index: number;
  tag: string;
  role?: string;
  /** 可访问名称 / 可见文案（截断） */
  name?: string;
  /** input type 等 */
  inputType?: string;
  placeholder?: string;
  /** 当前值（截断；密码不回传明文） */
  value?: string;
  href?: string;
  disabled?: boolean;
  checked?: boolean;
  /** select 的 option 文案（截断条数） */
  options?: string[];
}

export interface SnapshotPayload {
  url: string;
  title: string;
  elements: SnapshotElement[];
  truncated: boolean;
  totalCandidates: number;
}

export type AgentToolArgs =
  | { tool: 'snapshot'; maxElements?: number }
  | { tool: 'click'; index: number }
  | { tool: 'type'; index: number; text: string }
  | { tool: 'fill'; index: number; value: string }
  | { tool: 'select'; index: number; value: string }
  | {
      tool: 'scroll';
      index?: number;
      direction?: 'up' | 'down';
      amount?: number;
    }
  | {
      tool: 'wait';
      ms?: number;
      text?: string;
      timeoutMs?: number;
    }
  | { tool: 'extract_text'; index?: number; maxChars?: number }
  | { tool: 'finish'; summary: string; success?: boolean };

export interface AgentToolResult {
  ok: boolean;
  tool: AgentToolName;
  /** 给人与模型读的短摘要 */
  summary: string;
  error?: string;
  /** snapshot / extract 等结构化数据 */
  data?: unknown;
  /** 若执行涉及某快照元素，带回便于 BG 侧复核 */
  element?: SnapshotElement;
}

/** 内容脚本消息：Background → 页内执行已校验工具 */
export const AGENT_EXECUTE_MESSAGE = 'content:agent-execute' as const;

export interface AgentExecuteMessage {
  type: typeof AGENT_EXECUTE_MESSAGE;
  tool: AgentToolName;
  /** 已通过 tools.parseAgentToolCall 校验的参数（去掉 tool 判别字段，扁平传入） */
  args: Record<string, unknown>;
}

/** LLM 产出的步骤计划（批准后才进入 tool 环） */
export interface AgentPlan {
  steps: string[];
  notes?: string;
}

/** 任务阶段（UI / 时间线） */
export type AgentTaskPhase =
  | 'idle'
  | 'planning'
  | 'awaiting_plan'
  | 'running'
  | 'awaiting_danger'
  | 'done'
  | 'error'
  | 'aborted';

/** 步骤时间线条目 */
export interface AgentTimelineItem {
  id: string;
  at: number;
  kind: 'info' | 'plan' | 'tool' | 'result' | 'danger' | 'blocked' | 'error';
  summary: string;
  tool?: AgentToolName;
  reasons?: string[];
}
