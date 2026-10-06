/**
 * 网页摘要 / 网页问答 · 域内运行时类型
 *
 * 与翻译完全隔离：不写 `translateSession`，不复用 `translate:*` 消息。
 * 入库形状（session / turn / prefs）定义在 `shared/storage/types.ts`，
 * 这里只放**不入库**的运行时类型，并统一对外转出常用形状。
 */
import type { ChatContextScope } from '@/shared/storage/types';

export type {
  ChatContextScope,
  ChatSession,
  ChatSessionSummary,
  ChatTurn,
} from '@/shared/storage/types';

/** 待送模型的一段网页内容（由共享采集层产出） */
export interface ChatContextSegment {
  id: string;
  text: string;
}

/**
 * 从页面提取到的上下文载荷。
 * 只在「内容脚本 → Background → UI」之间传递，**不落 storage**。
 */
export interface ChatContextPayload {
  /** 实际生效的范围：请求 selection 但页面无选区时会回退为 page */
  scope: ChatContextScope;
  url: string;
  title: string;
  segments: ChatContextSegment[];
  /** 截断前的字符总数，供 UI 提示「内容已精简」 */
  totalChars: number;
  /** 是否因字符预算被截断 */
  truncated: boolean;
}
