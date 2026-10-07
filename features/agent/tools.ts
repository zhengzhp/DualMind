/**
 * Agent 工具 schema（给 LLM）与参数校验（纯函数）
 */
import type { ToolDefinition } from '@/providers/types';
import type { AgentToolArgs, AgentToolName } from './types';

export const AGENT_TOOL_NAMES: readonly AgentToolName[] = [
  'snapshot',
  'click',
  'type',
  'fill',
  'select',
  'scroll',
  'wait',
  'extract_text',
  'finish',
] as const;

export const MAX_SNAPSHOT_ELEMENTS = 80;
export const MAX_TEXT_ARG_CHARS = 4000;
/**
 * 单次 `wait` 的上限（含 `ms` 与 `text` 两条路径，见 executor.runWait）。
 *
 * ⚠️ **必须明显小于 `service.TOOL_TIMEOUT_MS`（工具级预算）**。两者相等时，一次
 * 「等待文本且文本始终未出现」的默认调用就会吃满整个工具预算：page 侧 deadline
 * （executor 依 `expiresAt` 注册）会先一步取消会话 → 返回 `fatal`
 * → service 统一抛 `UNKNOWN` → 用户只看到兜底文案，且 `runWait` 自己那句
 * 「等待文本超时」**永远不可达**、任务被致命中止无法自适应（DM-V3-002）。
 * 因此这里留出余量，保证 wait 能自报超时并以非 fatal 结果交还给模型。
 */
export const MAX_WAIT_MS = 10_000;
export const DEFAULT_WAIT_MS = 500;

const NAME_SET = new Set<string>(AGENT_TOOL_NAMES);

/** OpenAI 风格 tools 列表，供 runChatWithTools */
export const AGENT_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'snapshot',
      description:
        '观测当前页可交互元素，返回带 index 的列表。操作前应先 snapshot；DOM 变化后重新 snapshot。',
      parameters: {
        type: 'object',
        properties: {
          maxElements: {
            type: 'integer',
            description: `最多返回多少个元素，默认 ${MAX_SNAPSHOT_ELEMENTS}，上限同默认`,
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'click',
      description: '点击快照中的元素（用 index）。提交 / 支付 / 删除类按钮可能被拦截或需用户确认。',
      parameters: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: 'snapshot 返回的元素 index' },
        },
        required: ['index'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'type',
      description: '在输入框追加文本（不清空已有内容）。密码框等可能需用户确认。',
      parameters: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          text: { type: 'string' },
        },
        required: ['index', 'text'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fill',
      description: '清空并填入输入框 / 可编辑区域的完整值。',
      parameters: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          value: { type: 'string' },
        },
        required: ['index', 'value'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'select',
      description: '在 <select> 上按 option 的 value 或可见文案选择。',
      parameters: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          value: { type: 'string', description: 'option value 或 label' },
        },
        required: ['index', 'value'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scroll',
      description: '滚动页面，或把某 index 元素滚入视口。',
      parameters: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: '若提供则 scrollIntoView' },
          direction: { type: 'string', enum: ['up', 'down'] },
          amount: {
            type: 'integer',
            description: '像素，默认 400；仅页面滚动时使用',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wait',
      description: '等待一段时间，或等到页面出现某段文本（有超时）。',
      parameters: {
        type: 'object',
        properties: {
          ms: { type: 'integer', description: `固定等待毫秒，上限 ${MAX_WAIT_MS}` },
          text: { type: 'string', description: '等待正文中出现该子串' },
          timeoutMs: {
            type: 'integer',
            description: `等待文本时的超时，默认与上限均为 ${MAX_WAIT_MS}`,
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'extract_text',
      description: '抽取某元素或整页可见文本（截断）。只读。',
      parameters: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: '省略则抽 body 可见文本' },
          maxChars: { type: 'integer', description: '默认 2000，上限 8000' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: '任务结束时调用，给出简短结论。调用后不再执行其他工具。',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: '给用户看的结果摘要' },
          success: { type: 'boolean', description: '是否达成目标，默认 true' },
        },
        required: ['summary'],
        additionalProperties: false,
      },
    },
  },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readInt(
  obj: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = obj[key];
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
    return Math.trunc(Number(v));
  }
  return undefined;
}

function readString(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

function clampText(s: string, max = MAX_TEXT_ARG_CHARS): string {
  return s.length <= max ? s : s.slice(0, max);
}

export type ParseAgentToolResult =
  | { ok: true; tool: AgentToolName; args: AgentToolArgs }
  | { ok: false; error: string };

/**
 * 解析模型 tool_call 的 name + arguments JSON
 */
export function parseAgentToolCall(
  name: string,
  argumentsJson: string,
): ParseAgentToolResult {
  if (!NAME_SET.has(name)) {
    return { ok: false, error: `未知工具：${name}` };
  }
  const tool = name as AgentToolName;

  let raw: unknown;
  try {
    raw = argumentsJson.trim() ? JSON.parse(argumentsJson) : {};
  } catch {
    return { ok: false, error: `工具 ${tool} 参数不是合法 JSON` };
  }
  const obj = asRecord(raw);
  if (!obj) {
    return { ok: false, error: `工具 ${tool} 参数须为对象` };
  }

  switch (tool) {
    case 'snapshot': {
      const max = readInt(obj, 'maxElements');
      return {
        ok: true,
        tool,
        args: {
          tool,
          ...(max !== undefined
            ? {
                maxElements: Math.min(
                  MAX_SNAPSHOT_ELEMENTS,
                  Math.max(1, max),
                ),
              }
            : {}),
        },
      };
    }
    case 'click': {
      const index = readInt(obj, 'index');
      if (index === undefined || index < 0) {
        return { ok: false, error: 'click 需要非负整数 index' };
      }
      return { ok: true, tool, args: { tool, index } };
    }
    case 'type': {
      const index = readInt(obj, 'index');
      const text = readString(obj, 'text');
      if (index === undefined || index < 0 || text === undefined) {
        return { ok: false, error: 'type 需要 index 与 text' };
      }
      return { ok: true, tool, args: { tool, index, text: clampText(text) } };
    }
    case 'fill': {
      const index = readInt(obj, 'index');
      const value = readString(obj, 'value');
      if (index === undefined || index < 0 || value === undefined) {
        return { ok: false, error: 'fill 需要 index 与 value' };
      }
      return { ok: true, tool, args: { tool, index, value: clampText(value) } };
    }
    case 'select': {
      const index = readInt(obj, 'index');
      const value = readString(obj, 'value');
      if (index === undefined || index < 0 || value === undefined) {
        return { ok: false, error: 'select 需要 index 与 value' };
      }
      return { ok: true, tool, args: { tool, index, value: clampText(value, 500) } };
    }
    case 'scroll': {
      const index = readInt(obj, 'index');
      const direction = readString(obj, 'direction');
      const amount = readInt(obj, 'amount');
      if (
        direction !== undefined &&
        direction !== 'up' &&
        direction !== 'down'
      ) {
        return { ok: false, error: 'scroll.direction 仅为 up | down' };
      }
      return {
        ok: true,
        tool,
        args: {
          tool,
          ...(index !== undefined && index >= 0 ? { index } : {}),
          ...(direction === 'up' || direction === 'down' ? { direction } : {}),
          ...(amount !== undefined
            ? { amount: Math.min(4000, Math.max(1, amount)) }
            : {}),
        },
      };
    }
    case 'wait': {
      const ms = readInt(obj, 'ms');
      const text = readString(obj, 'text');
      const timeoutMs = readInt(obj, 'timeoutMs');
      if (ms === undefined && (text === undefined || text === '')) {
        return { ok: false, error: 'wait 需要 ms 或 text' };
      }
      return {
        ok: true,
        tool,
        args: {
          tool,
          ...(ms !== undefined
            ? { ms: Math.min(MAX_WAIT_MS, Math.max(0, ms)) }
            : {}),
          ...(text ? { text: clampText(text, 200) } : {}),
          ...(timeoutMs !== undefined
            ? { timeoutMs: Math.min(MAX_WAIT_MS, Math.max(1, timeoutMs)) }
            : {}),
        },
      };
    }
    case 'extract_text': {
      const index = readInt(obj, 'index');
      const maxChars = readInt(obj, 'maxChars');
      return {
        ok: true,
        tool,
        args: {
          tool,
          ...(index !== undefined && index >= 0 ? { index } : {}),
          ...(maxChars !== undefined
            ? { maxChars: Math.min(8000, Math.max(1, maxChars)) }
            : {}),
        },
      };
    }
    case 'finish': {
      const summary = readString(obj, 'summary');
      if (summary === undefined || !summary.trim()) {
        return { ok: false, error: 'finish 需要非空 summary' };
      }
      const success = obj.success;
      return {
        ok: true,
        tool,
        args: {
          tool,
          summary: clampText(summary.trim(), 2000),
          ...(typeof success === 'boolean' ? { success } : {}),
        },
      };
    }
    default: {
      const _exhaustive: never = tool;
      return { ok: false, error: `未实现：${String(_exhaustive)}` };
    }
  }
}

/** 把校验后的 args 摊成内容脚本可接收的扁平对象（去掉 tool 字段） */
export function flattenToolArgs(args: AgentToolArgs): Record<string, unknown> {
  const { tool: _t, ...rest } = args;
  return rest;
}
