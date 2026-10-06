/**
 * 悬浮入口的位置计算（纯函数，便于单测）。
 *
 * 位置模型是「贴边 + y」而不是绝对 `x/y`：
 * - 横向**贴边吸附**：吸附到最近的左 / 右边缘。静止（peek）时按钮收窄成 `peekWidth`
 *   的窄把手、**外缘与视口边缘对齐**（不越界、不出屏）；指针移入 / 面板展开 / 拖拽中
 *   才长成完整圆形，且是**朝页面内侧生长**（见 `fabAnchor`）。
 *   因此这里不再需要「藏进视口外」的偏移，也不再需要「把面板推回视口内」的补偿量 ——
 *   面板 / 提示挂在贴边侧，壳的边缘就是视口边缘，它们天然在屏内。
 * - 纵向只持久化 y，视口变化时夹回安全区，既不会顶到浏览器界面，也不会跑出屏幕点不到。
 *
 * 两套几何的分工（鼠标 / 触控是两种手指精度，用同一套常量必然有一端难用）：
 * - 桌面有悬停，可以「先收窄成把手、移入再长出来」，于是静止时几乎不占正文；
 * - 触屏没有悬停，只能盲点，`peekWidth === size`（**不启用把手**）——
 *   十几像素的把手用手指根本点不中（Material 建议触控目标 ≥48dp）。
 */

/** 与主按钮相关的全部几何参数 */
export interface FabGeometry {
  /** 按钮完全展开时的边长（px） */
  size: number;
  /**
   * 静止（peek）时把手的宽度（px）。
   * 等于 `size` 即不启用把手形态（触屏档）。取值范围 `(0, size]`。
   */
  peekWidth: number;
  /** 纵向安全边距（px）：上边与下边各留这么多，也是最小可拖范围 */
  margin: number;
  /** 位移超过该阈值才判定为「拖拽」而不是「点击」（px） */
  dragThreshold: number;
}

/**
 * 鼠标 / 触控板：40px，静止收成 12px 窄把手。
 *
 * 12px 是「看得见、够得着」与「不遮正文」的折中：
 * - 8px 试过，实机反馈「注意不到」—— 只有 8px 宽时整体读起来像页面上的白条，
 *   而不是一个控件；加上把手内部还要放抓手点，8px 连点都塞不下；
 * - 再宽就会开始挤压正文（把手是要一直挂着的），也会盖住贴边的小按钮 / 滚动条，
 *   因此停在 12px，靠**对比与符号**（见 dom.ts 的 .dm-pf-grip）而不是靠宽度去显眼。
 */
export const DEFAULT_GEOM: FabGeometry = {
  size: 40,
  peekWidth: 12,
  margin: 16,
  dragThreshold: 4,
};

/**
 * 粗指针（触屏）：48px、**不启用把手**、阈值放宽到 10px。
 *
 * 触屏没有「悬停」，把手只能靠点击展开，而十几像素的命中区不可接受；
 * 阈值同步放宽：手指按下时的抖动远大于鼠标，4px 会让「点击」频繁被误判成拖拽。
 */
export const COARSE_GEOM: FabGeometry = {
  size: 48,
  peekWidth: 48,
  margin: 16,
  dragThreshold: 10,
};

/** 按指针类型选几何（`coarse` = 触屏 / 手写笔） */
export function geometryForPointer(coarse: boolean): FabGeometry {
  return coarse ? COARSE_GEOM : DEFAULT_GEOM;
}

/**
 * 该几何是否启用「窄把手」静止形态。
 *
 * 样式用它决定「静止时画把手还是画完整圆形」：把手是独立的窄形状，
 * 不是把圆形裁一刀（裁出来的是一段在贴边处宽度趋近 0 的弧，看起来像图标坏了）。
 */
export function hasPeek(geo: FabGeometry = DEFAULT_GEOM): boolean {
  return geo.peekWidth < geo.size;
}

/** 吸附方向 */
export type FabSide = 'left' | 'right';

/** 落点（与 storage 的 `PageFabPos` 结构一致） */
export interface FabPos {
  side: FabSide;
  y: number;
}

export interface FabViewport {
  width: number;
  height: number;
}

/** 贴左时壳的 `left`：贴边侧与视口左边缘对齐 */
export function minFabX(): number {
  return 0;
}

/** 贴右时壳的 `left`：壳只有把手宽，右边缘与视口右边缘对齐 */
export function maxFabX(
  viewportWidth: number,
  geo: FabGeometry = DEFAULT_GEOM,
): number {
  return viewportWidth - geo.peekWidth;
}

/** 贴底时按钮顶边的 y（默认右下角） */
export function bottomFabY(
  viewportHeight: number,
  geo: FabGeometry = DEFAULT_GEOM,
): number {
  return Math.max(geo.margin, viewportHeight - geo.size - geo.margin);
}

/**
 * 把 y 夹进「视口内可达范围」。
 * 非有限值（脏数据 / NaN）视为「未设置」，落到默认的贴底位置，
 * 而不是产生 `NaN px` 这种让按钮彻底消失的样式。
 */
export function clampFabY(
  y: number,
  viewportHeight: number,
  geo: FabGeometry = DEFAULT_GEOM,
): number {
  const maxY = bottomFabY(viewportHeight, geo);
  if (!Number.isFinite(y)) return maxY;
  return Math.min(Math.max(y, geo.margin), maxY);
}

/**
 * 把拖拽中的 x 夹进可达范围。
 *
 * 这里的 `x` 是**按钮（`size` 宽）的左边缘**，不是壳的：拖拽时按钮是完整圆形，
 * 必须整体留在视口内（拖到边缘就看不见按钮的话，用户会以为把它弄丢了）。
 * 松手后由 `resolveFabPos` + `fabAnchor` 折算成贴边位，那时才收窄成把手。
 */
export function clampFabX(
  x: number,
  viewportWidth: number,
  geo: FabGeometry = DEFAULT_GEOM,
): number {
  const maxX = viewportWidth - geo.size;
  if (!Number.isFinite(x)) return maxX;
  return Math.min(Math.max(x, minFabX()), maxX);
}

/** 默认落点：右下角（横向按几何决定贴合比例） */
export function defaultFabPos(
  viewport: FabViewport,
  geo: FabGeometry = DEFAULT_GEOM,
): FabPos {
  return { side: 'right', y: bottomFabY(viewport.height, geo) };
}

/**
 * 松手时的落点：按按钮中心相对视口中线就近吸附，并夹回视口内。
 *
 * `x` 是**按钮左边缘**（拖拽坐标系），因此 `x + size / 2` 就是按钮的几何中心 ——
 * 用中心点而非左边缘判定，能避免按钮宽一点就总被吸到左边。
 */
export function resolveFabPos(
  x: number,
  y: number,
  viewport: FabViewport,
  geo: FabGeometry = DEFAULT_GEOM,
): FabPos {
  const centerX = x + geo.size / 2;
  const side: FabSide = centerX < viewport.width / 2 ? 'left' : 'right';
  return { side, y: clampFabY(y, viewport.height, geo) };
}

/**
 * 把落点换算成壳的 `left` / `top`（用于 `position: fixed` 的样式）。
 *
 * 壳的贴边侧边缘与视口边缘对齐；按钮是壳的绝对定位子元素、朝页面内侧生长
 * （见 `dom.ts` 的 `.dm-pf[data-side]  .dm-pf-trigger`），
 * 所以「壳贴边」= 「按钮展开后也贴边且不出屏」，一条规则两头都成立。
 */
export function fabAnchor(
  pos: FabPos,
  viewport: FabViewport,
  geo: FabGeometry = DEFAULT_GEOM,
): { left: number; top: number } {
  const left = pos.side === 'left' ? minFabX() : maxFabX(viewport.width, geo);
  return { left, top: clampFabY(pos.y, viewport.height, geo) };
}

/** 位移是否已超过拖拽阈值（用欧氏距离，斜向拖动同样灵敏） */
export function isDragGesture(
  dx: number,
  dy: number,
  geo: FabGeometry = DEFAULT_GEOM,
): boolean {
  return Math.hypot(dx, dy) >= geo.dragThreshold;
}
