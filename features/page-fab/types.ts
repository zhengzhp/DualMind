/**
 * 页面悬浮入口（Page FAB）· 域内类型
 *
 * 设计取向：入口壳**不认识**任何具体能力（沉浸译 / 网页总结 / 未来功能），
 * 只认识「动作」这个抽象。各 feature 在挂载时自行注册动作，从而做到：
 * - 新增能力 = 新增一次 registerAction，不改入口壳；
 * - 能力之间零耦合（入口壳不 import 任何 feature）。
 */

/** 动作的视觉语调：决定动作项配色与主按钮状态点颜色 */
export type PageFabTone = 'idle' | 'busy' | 'active' | 'warning' | 'error';

/** 内置图标名（SVG 在 `dom.ts` 里内联，避免入口壳依赖图标库 / 网络资源） */
export type PageFabIconName = 'immersive' | 'summarize' | 'agent';

/** 某个动作当前的展示状态（由动作自己在 `getView()` 里给出） */
export interface PageFabActionView {
  tone: PageFabTone;
  /**
   * 覆盖默认文案。
   * 用于「同一个动作在激活后语义翻转」的场景：沉浸译未翻译时是「沉浸译」，
   * 已翻译后应显示「显示原文」——用户才知道再点一次是还原而不是再翻一遍。
   */
  label?: string;
  /** 动作项右侧的次要状态文案（如「翻译中 3/12」「已翻译」） */
  status?: string;
  /** 悬浮提示；省略时退回动作定义里的 title */
  title?: string;
  /**
   * 是否点亮主按钮上的状态点。
   * 省略时由 tone 推导（非 idle 即点亮），只有需要「静默运行」的动作才显式关掉。
   */
  indicator?: boolean;
}

/** 一个可注册的动作 */
export interface PageFabAction {
  /** 唯一标识，同时写入 DOM 的 `data-action`，供样式与 E2E 选择器定位 */
  id: string;
  /** 动作项主文案（可被 `getView().label` 覆盖） */
  label: string;
  /** 默认悬浮提示 */
  title?: string;
  /** 图标名；省略则不显示图标 */
  icon?: PageFabIconName;
  /**
   * 点击动作。抛出的错误由入口壳统一捕获并浮层提示，
   * 动作内部无需自己处理 UI 反馈（沉浸译这类自带错误态的动作可直接吞掉）。
   */
  onClick: () => void | Promise<void>;
  /** 返回当前展示状态；省略即恒为 idle（无状态动作） */
  getView?: () => PageFabActionView;
}

/** 注册成功后拿到的句柄：用于主动刷新状态 / 注销 */
export interface PageFabActionHandle {
  /** 状态发生变化时调用（入口壳只重渲染该动作，不重建整个菜单） */
  update: () => void;
  dispose: () => void;
}

/** 入口壳暴露给各 feature 的能力 */
export interface PageFabApi {
  registerAction: (action: PageFabAction) => PageFabActionHandle;
}
