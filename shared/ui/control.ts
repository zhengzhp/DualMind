/**
 * 按表面统一控件高度（P1.13）：
 * - 侧栏（窄面板）用 32px，保证一屏能放下更多内容；
 * - 全页工作台（大屏）用 40px，与设置页 / 表单控件一致。
 *
 * 只返回高度类，颜色 / 圆角 / 字重仍由调用方决定。
 */
export type ControlSurface = 'sidepanel' | 'workspace';

export function controlHeight(surface: ControlSurface): string {
  return surface === 'workspace' ? 'h-10' : 'h-8';
}
