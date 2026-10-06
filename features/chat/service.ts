/**
 * 网页问答服务（仅 Background 调用）。
 *
 * 薄封装：组装 messages → 走 `shared/llm/runChatStream`。
 * Feature 不得各自拼 Provider（见 `docs/features.md` 的 LLM 调用约定）。
 */
import { runChatStream } from '@/shared/llm/run';
import type { ChatTurn } from '@/shared/storage/types';
import { buildChatMessages } from './prompts';
import type { ChatContextPayload } from './types';

export interface AnswerQuestionOptions {
  context: ChatContextPayload | null;
  history: ChatTurn[];
  question: string;
  signal?: AbortSignal;
}

/**
 * 流式回答：逐段 yield 文本增量。
 * 取消通过 `signal` 传播到 Provider（上层 abort 后迭代会自动结束）。
 */
export async function* answerQuestion(
  options: AnswerQuestionOptions,
): AsyncGenerator<string> {
  const messages = buildChatMessages({
    context: options.context,
    history: options.history,
    question: options.question,
  });
  yield* runChatStream({ messages, signal: options.signal });
}
