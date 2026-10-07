/**
 * Agent 系统提示与计划生成（纯文本，不碰 DOM）
 */
import type { ChatMessage } from '@/providers/types';
import type { AgentPlan } from './types';

export function buildPlanMessages(options: {
  goal: string;
  pageUrl: string;
  pageTitle: string;
}): ChatMessage[] {
  const { goal, pageUrl, pageTitle } = options;
  return [
    {
      role: 'system',
      content: [
        '你是 DualMind 本页浏览器 Agent 的规划器。',
        '根据用户目标，列出在**当前页面**上可执行的简短步骤计划。',
        '可用能力：观察可交互元素、点击、填写、选择、滚动、等待、抽取文本。',
        '不要编造页面上不存在的按钮；不确定时写「先 snapshot 再决定」。',
        '禁止：跨标签页、下载管理、破解验证码、支付/转账操作。',
        '只输出一个 JSON 对象，不要 markdown 代码围栏，格式：',
        '{"steps":["步骤1","步骤2"],"notes":"可选说明"}',
        'steps 3～8 条，每条一句话。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `页面：${pageTitle || '(无标题)'}`,
        `URL：${pageUrl || '(未知)'}`,
        `目标：${goal}`,
      ].join('\n'),
    },
  ];
}

export function buildAgentSystemPrompt(): string {
  return [
    '你是 DualMind 本页浏览器 Agent。只用提供的 tools 操作**当前标签页**。',
    '规则：',
    '1. 开始或 DOM 可能变化后先调用 snapshot，用返回的 index 操作元素。',
    '2. 不要猜测 CSS；不要操作支付/转账；不要主动提交敏感表单除非用户目标明确要求且工具未被拦截。',
    '3. 普通填写可以继续；完成后调用 finish 并给出摘要。',
    '4. Shadow DOM / 跨域 iframe 可能失败，失败后换策略或 finish 说明限制。',
    '5. 每次只调用必要工具；观察后再行动。填写或选择改变元素后，先重新 snapshot 再使用 index；旧快照或目标变化时必须重新观察，不要复用旧确认。',
    '6. 页面导航会结束当前任务，不能沿用旧计划继续；支付动作无法通过用户确认放行。',
  ].join('\n');
}

export function buildAgentKickoffMessages(options: {
  goal: string;
  pageUrl: string;
  pageTitle: string;
  plan: AgentPlan;
}): ChatMessage[] {
  const steps = options.plan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return [
    { role: 'system', content: buildAgentSystemPrompt() },
    {
      role: 'user',
      content: [
        `页面：${options.pageTitle || '(无标题)'}`,
        `URL：${options.pageUrl || '(未知)'}`,
        `目标：${options.goal}`,
        '',
        '用户已批准以下计划，请开始执行（先 snapshot）：',
        steps,
        options.plan.notes ? `备注：${options.plan.notes}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
}

/**
 * 解析规划模型输出：优先 JSON，否则按行拆 bullet
 */
export function parseAgentPlan(raw: string): AgentPlan | null {
  const text = raw.trim();
  if (!text) return null;

  const jsonSlice = extractJsonObject(text);
  if (jsonSlice) {
    try {
      const parsed = JSON.parse(jsonSlice) as {
        steps?: unknown;
        notes?: unknown;
      };
      const steps = normalizeSteps(parsed.steps);
      if (steps.length > 0) {
        return {
          steps,
          ...(typeof parsed.notes === 'string' && parsed.notes.trim()
            ? { notes: parsed.notes.trim() }
            : {}),
        };
      }
    } catch {
      /* fall through */
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•\d)+.\s]+/, '').trim())
    .filter((l) => l.length > 0 && !l.startsWith('{'));
  if (lines.length === 0) return null;
  return { steps: lines.slice(0, 10) };
}

function normalizeSteps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, 10);
}

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith('{')) return inner;
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

/** 计划展示文案（UI 用，勿放进 service 以免侧栏打进 LLM） */
export function formatPlanForUi(plan: AgentPlan): string {
  const lines = plan.steps.map((s, i) => `${i + 1}. ${s}`);
  if (plan.notes) lines.push(`备注：${plan.notes}`);
  return lines.join('\n');
}
