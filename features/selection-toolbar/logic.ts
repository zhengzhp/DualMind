import type { ToolbarTrigger } from '@/shared/storage/types';

/** 浮层预估宽度，用于右缘避让 */
export const TOOLBAR_ESTIMATED_WIDTH = 280;
/** 浮层预估高度余量，用于底缘避让 */
export const TOOLBAR_BOTTOM_MARGIN = 120;
/** 距视口左缘最小间距 */
export const TOOLBAR_EDGE_PADDING = 8;
/** 相对选区底部的纵向偏移 */
export const TOOLBAR_OFFSET_Y = 8;

export interface ViewportSize {
  width: number;
  height: number;
}

export interface SelectionBox {
  left: number;
  bottom: number;
}

/**
 * 根据选区矩形与视口计算浮层锚点（fixed 坐标）
 */
export function computeToolbarPosition(
  rect: SelectionBox,
  viewport: ViewportSize,
): { x: number; y: number } {
  const maxX = Math.max(
    TOOLBAR_EDGE_PADDING,
    viewport.width - TOOLBAR_ESTIMATED_WIDTH,
  );
  const x = Math.min(Math.max(TOOLBAR_EDGE_PADDING, rect.left), maxX);
  const y = Math.min(rect.bottom + TOOLBAR_OFFSET_Y, viewport.height - TOOLBAR_BOTTOM_MARGIN);
  return { x, y };
}

/**
 * 失选后是否应收起浮层（无译文且非 loading）
 */
export function shouldHideToolbar(params: {
  hasSelection: boolean;
  loading: boolean;
  hasTranslation: boolean;
}): boolean {
  return !params.hasSelection && !params.loading && !params.hasTranslation;
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
