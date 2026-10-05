import type { ToolbarTrigger } from '@/shared/storage/types';

/**
 * 选区变化后是否应收起浮层。
 * 翻译进行中不打断；其余情况（选区已塌陷）收起，避免浮层残留。
 */
export function shouldDismissOnSelectionChange(params: {
  hasSelection: boolean;
  loading: boolean;
}): boolean {
  return !params.hasSelection && !params.loading;
}

/**
 * mouseup 时是否应展示浮层（不含快捷键路径）
 */
export function shouldShowOnMouseUp(params: {
  toolbarTrigger: ToolbarTrigger;
  selectionText: string;
}): boolean {
  if (!params.selectionText.trim()) return false;
  return params.toolbarTrigger === 'auto';
}

/**
 * 快捷键路径：有选区才显示并自动翻译
 */
export function shouldShowOnShortcut(selectionText: string): boolean {
  return Boolean(selectionText.trim());
}
