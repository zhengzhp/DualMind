/**
 * 悬浮入口的「注意力分级」（纯函数，便于单测）。
 *
 * 出发点：入口默认就该是**存在但不抢注意力**的。但「不抢注意力」有多个来源
 * （常态、正在滚动、有状态、已展开），如果每条都写成一个 CSS 选择器去覆盖
 * `opacity`，特异性会互相打架，最后变成「滚动时该淡到 0.15 却被常态的 0.55 赢掉」
 * 这类只能靠调 `!important` 收场的局面。
 *
 * 因此收敛成**单一数值**：由本模块算出唯一的 `opacity`，`dom.ts` 只把它写进
 * `--dm-pf-idle-opacity`。CSS 侧只剩两条规则 —— 用变量、以及 hover/focus 恢复 1
 * （后置且特异性更高，稳赢变量）。
 */

/** 常态：能看清、但不抢注意力（静止形态是 12px 窄把手，本就比完整圆形轻，故可高于圆形态） */
export const IDLE_OPACITY = 0.85;
/** 滚动中：阅读时最该让位，压到几乎只剩存在感（停止滚动后自动恢复常态） */
export const SCROLL_OPACITY = 0.15;
/** 有状态 / 已展开：必须完整可见 */
export const FULL_OPACITY = 1;

export interface AttentionState {
  /** 动作面板是否展开 */
  open: boolean;
  /** 是否处于「刚刚滚动过」的窗口内 */
  scrolling: boolean;
  /** 是否有动作处于非 idle 状态（跑着活 / 出错 / 待处理） */
  indicator: boolean;
}

/**
 * 决定当前不透明度。优先级（从高到低）：
 *
 * 1. 已展开 → 1。用户正在读菜单，任何淡出都是 bug。
 * 2. 有状态 → 1。有活在跑 / 有错误待处理时必须显眼，否则用户看不到反馈。
 * 3. 滚动中 → 0.15。让开正文。
 * 4. 常态 → 0.85。把手只有 12px 宽，视觉权重本来就低；而**浅色填充再叠一层透明度会
 *    直接化进白底**（旧值 0.42 实机反馈「注意不到」），因此常态值以「一眼能看见」为准，
 *    让位交给滚动档去表达。
 *
 * 展开与有状态都排在滚动之前：**滚动不清除反馈**（滚一下就把错误藏起来会很坑）。
 */
export function resolveOpacity(state: AttentionState): number {
  if (state.open || state.indicator) return FULL_OPACITY;
  if (state.scrolling) return SCROLL_OPACITY;
  return IDLE_OPACITY;
}

/**
 * 「是否滑出成完整圆形」的判定（与不透明度同源，避免两处各判一遍）。
 *
 * 静止时按钮是贴边的窄把手（最不占正文）；只有下面四种情况才长成完整圆形：
 * - `hover`：指针在入口上 —— 用户想点它了；
 * - `open`：面板已展开 —— 面板/提示是挂在按钮上的，把手宽度撑不起它们；
 * - `dragging`：拖拽中 —— 手里抓的是一个完整按钮，中途缩成把手会像「抓空了」；
 * - `indicator`：有状态（跑着活 / 出错）—— 否则「出错了」这件事只有把鼠标移上去才看得见；
 *   滚动**不**参与：滚动中本来就该让位，而滚动时也没有指针停在里面。
 */
export interface RevealState {
  /** 动作面板是否展开 */
  open: boolean;
  /** 指针是否停在入口上（悬停意图的前置条件） */
  hover: boolean;
  /** 是否正在拖拽 */
  dragging: boolean;
  /** 是否有动作处于非 idle 状态 */
  indicator: boolean;
}

export function resolveRevealed(state: RevealState): boolean {
  return state.hover || state.open || state.dragging || state.indicator;
}
