/**
 * 页面上下文提取（内容脚本侧）。
 *
 * 安全边界：这里**只读 DOM**，不持有 API Key、不发起任何模型请求。
 * 采集复用共享层 `features/page-content/`，截断复用 `budget`。
 */
import { applyCharBudget } from '@/features/page-content/budget';
import {
  collectSegments,
  normalizeSegmentText,
} from '@/features/page-content/segmenter';
import type { ChatContextPayload, ChatContextScope } from './types';

export interface ExtractChatContextOptions {
  scope: ChatContextScope;
  /** 字符预算，来自 `chatPrefs.maxContextChars` */
  maxChars: number;
}

/** 读取当前选区文本（无选区 / 读取失败返回空串） */
function readSelectionText(): string {
  try {
    return normalizeSegmentText(window.getSelection()?.toString() ?? '');
  } catch {
    return '';
  }
}

function currentUrl(): string {
  try {
    return window.location.href;
  } catch {
    return '';
  }
}

function currentTitle(): string {
  try {
    return (document.title ?? '').trim();
  } catch {
    return '';
  }
}

/** 用共享采集层切分正文并按预算截断 */
function extractPageContent(maxChars: number): {
  segments: ChatContextPayload['segments'];
  totalChars: number;
  truncated: boolean;
} {
  const collected = collectSegments(document.body);
  const { kept, totalChars, truncated } = applyCharBudget(collected, maxChars);
  return {
    segments: kept.map((segment) => ({
      id: segment.id,
      text: segment.text,
    })),
    totalChars,
    truncated,
  };
}

/**
 * 提取上下文。
 *
 * - `selection`：优先取当前选区；**无选区时回退整页正文**，并在 `scope` 中
 *   如实回报为 `page`，避免 UI 误以为拿到的是选区内容。
 * - `page`：整页正文 + 预算截断。
 */
export function extractChatContext(
  options: ExtractChatContextOptions,
): ChatContextPayload {
  const base = { url: currentUrl(), title: currentTitle() };

  if (options.scope === 'selection') {
    const selected = readSelectionText();
    if (selected) {
      return {
        ...base,
        scope: 'selection',
        segments: [{ id: 'dmsel-1', text: selected }],
        totalChars: selected.length,
        truncated: false,
      };
    }
  }

  return {
    ...base,
    scope: 'page',
    ...extractPageContent(options.maxChars),
  };
}
