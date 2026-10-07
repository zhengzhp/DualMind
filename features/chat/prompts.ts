/**
 * 聊天提示词与消息组装。
 *
 * 组装在 Background 侧完成（对齐 `docs/architecture-v2.md` 的数据流）：
 * UI 只负责把「页面上下文 + 历史 + 本次提问」传过来，Prompt 细节不外泄。
 */
import type { ChatMessage } from '@/providers/types';
import type { ChatTurn } from '@/shared/storage/types';
import type { ChatContextPayload } from './types';

/** 多轮对话最多带入模型的历史条数（更早的丢弃，控制上下文与费用） */
export const MAX_HISTORY_TURNS = 20;

/** 「总结本页」的固定提问：与自由问答走同一条链路，避免另开一套消息 */
export const SUMMARY_QUESTION = '请总结当前网页的核心内容，说明主要观点与结论。';

/** 系统提示：约束「基于页面作答」，避免编造 */
const SYSTEM_PROMPT = [
  '你是 DualMind 的网页阅读助手，帮助用户理解当前正在阅读的网页。',
  '回答要求：',
  '1. 只依据提供的网页内容作答，不要编造网页中不存在的信息。',
  '2. 若网页内容不足以回答，直接说明「页面内容不足以回答该问题」，不要猜测。',
  '3. 引用具体内容时用 [编号] 标注对应段落，便于用户回查。',
  '4. 使用与用户提问相同的语言作答；结构清晰、简洁，避免空话。',
].join('\n');

/** 无页面上下文时的兜底说明（例如内容脚本未注入的页面） */
const NO_CONTEXT_NOTICE =
  '当前没有可用的网页内容（可能页面未加载完成或不在可读取范围内），请仅依据用户提问作答，并说明缺少页面上下文。';

/** 把上下文片段拼成带编号的文本，便于模型按 [n] 引用 */
export function formatContext(context: ChatContextPayload): string {
  const meta: string[] = [];
  if (context.title) meta.push(`页面标题：${context.title}`);
  if (context.url) meta.push(`页面地址：${context.url}`);
  const body = context.segments
    .map((segment, index) => `[${index + 1}] ${segment.text}`)
    .join('\n');
  const truncatedNote = context.truncated
    ? '\n（注：页面内容过长，以上仅为前若干段落）'
    : '';
  // 标题 / 地址都缺失时不要留下前导换行（会白占 Prompt 的 token）
  const header = meta.length > 0 ? `${meta.join('\n')}\n` : '';
  return `${header}网页内容：\n${body}${truncatedNote}`;
}

export interface BuildChatMessagesOptions {
  /** 页面上下文；为 null 表示无上下文可用 */
  context: ChatContextPayload | null;
  /** 历史消息（不含本次提问） */
  history: ChatTurn[];
  /** 本轮提问 */
  question: string;
}

/**
 * 组装 Provider 入参消息：
 * system（角色约束）→ system（页面上下文）→ 历史 → 本次提问。
 *
 * 历史中的空内容与失败轮次会被跳过：把失败文案当作模型上下文喂回去，
 * 只会污染后续回答。
 */
export function buildChatMessages(
  options: BuildChatMessagesOptions,
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content: options.context
        ? formatContext(options.context)
        : NO_CONTEXT_NOTICE,
    },
  ];

  const history = options.history.slice(-MAX_HISTORY_TURNS);
  for (const turn of history) {
    // 跨页分隔等 system 轮次只给 UI / 导出，不喂给模型
    if (turn.role === 'system') continue;
    if (!turn.content.trim()) continue;
    if (turn.role === 'assistant' && turn.error) continue;
    messages.push({ role: turn.role, content: turn.content });
  }

  messages.push({ role: 'user', content: options.question });
  return messages;
}
