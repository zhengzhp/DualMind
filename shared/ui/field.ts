/**
 * 表单控件统一样式（input / textarea / select / 自绘下拉的触发按钮）。
 *
 * 目的：Options 页与 Workbench（Side Panel / 全页）此前各写一套内联样式，
 * 视觉不一致；这里收敛成唯一来源。
 *
 * 注意：只放「控件本身」的样式，不要放宽度 / 布局相关的 class
 * （如 `flex-1` / `min-w-0`），由调用方通过 `className` 传入。
 */
export const fieldClass = [
  'w-full rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900',
  'outline-none transition placeholder:text-brand-700/40',
  'hover:border-brand-500/30',
  'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-brand-100',
].join(' ');

/**
 * 强调态表单控件：用于「当前正在生效」的关键设置（如工作台的模型选择器），
 * 通过加粗边框 + 品牌色浅底 + 半粗字重，让它在一屏控件里一眼可辨。
 */
export const fieldClassEmphasis = [
  'w-full rounded-xl border-2 border-brand-500 bg-brand-50/70 px-3 py-2 text-sm font-semibold text-brand-900',
  'outline-none transition placeholder:text-brand-700/40',
  'hover:bg-brand-50',
  'focus:ring-2 focus:ring-brand-500/25',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');
