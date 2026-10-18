/**
 * 表单控件统一样式（input / textarea / select / 自绘下拉的触发按钮）。
 *
 * 视觉语言见 docs/ui-refresh-plan.md §4：
 * - 默认 40px 高、10px 圆角、1px 发丝描边；
 * - 聚焦时边框转 accent + 2px 外圈（不再用品牌蓝铺底）；
 * - 只放「控件本身」的样式，宽度 / 布局由调用方通过 className 传入。
 */
export const fieldClass = [
  'w-full min-h-10 rounded-control border border-line bg-surface px-3 py-2 text-body text-ink',
  'outline-none transition placeholder:text-ink-2',
  'hover:border-line-strong',
  'focus:border-accent focus:ring-2 focus:ring-accent/20',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line',
].join(' ');

/**
 * 强调态表单控件：用于「当前正在生效」的关键设置，
 * 通过 accent 描边 + 浅色底 + 半粗字重，让它在一屏控件里一眼可辨。
 */
export const fieldClassEmphasis = [
  'w-full min-h-10 rounded-control border border-accent/40 bg-accent-soft px-3 py-2 text-body font-semibold text-ink',
  'outline-none transition placeholder:text-ink-2',
  'hover:border-accent/60',
  'focus:border-accent focus:ring-2 focus:ring-accent/20',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

/**
 * 轻量态：不画框、不铺底，靠字重与 hover 底色表达可点。
 * 用于模型横栏这类「信息为主、控件为辅」的位置，避免一排控件抢走主内容注意力。
 */
export const fieldClassQuiet = [
  'w-full min-h-8 rounded-control bg-transparent px-1 py-1 text-sm font-semibold text-ink',
  'outline-none transition placeholder:text-ink-2',
  'hover:bg-surface-2',
  'focus-visible:ring-2 focus-visible:ring-accent/20',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');
