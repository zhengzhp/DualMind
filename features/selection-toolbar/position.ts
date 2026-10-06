import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
  type VirtualElement,
} from '@floating-ui/dom';

/** 相对选区底部的纵向偏移 */
const OFFSET_Y = 8;
/** 距视口边缘最小间距 */
const EDGE_PADDING = 8;
/** 浮层最大宽度（与样式 .dm-card 的 max-width 保持一致） */
const MAX_WIDTH = 360;

export interface SelectionTracker {
  /** 选区变化后手动刷新定位 */
  update(): void;
  /** 停止跟随（滚动 / 缩放监听一并移除） */
  stop(): void;
}

/**
 * 让浮层跟随选区定位。
 *
 * 选区本身不是 DOM 元素，用 floating-ui 的「虚拟元素」承载其矩形；
 * autoUpdate 在滚动 / 缩放 / 尺寸变化时自动重算，并按中间件处理边缘翻转与越界平移，
 * 因此无需再手写「预估宽度 + 视口夹取」的经验值。
 */
export function trackSelection(
  floatingEl: HTMLElement,
  getRect: () => DOMRect | null,
): SelectionTracker {
  // 缓存最后一次有效矩形：点击浮层按钮后选区可能塌陷，避免定位跳回原点
  let lastRect: DOMRect | null = null;

  const reference: VirtualElement = {
    getBoundingClientRect: () =>
      getRect() ?? lastRect ?? new DOMRect(0, 0, 0, 0),
    contextElement: document.body,
  };

  const update = () => {
    const rect = getRect();
    if (rect) lastRect = rect;

    void computePosition(reference, floatingEl, {
      // 与浮层 position: fixed 一致，返回视口坐标
      strategy: 'fixed',
      placement: 'bottom-start',
      middleware: [
        offset(OFFSET_Y),
        flip({ padding: EDGE_PADDING }), // 下方空间不足时翻到选区上方
        shift({ padding: EDGE_PADDING }), // 左右越界时平移回视口内
        size({
          padding: EDGE_PADDING,
          apply({ availableWidth }) {
            floatingEl.style.maxWidth = `${Math.min(MAX_WIDTH, availableWidth)}px`;
          },
        }),
      ],
    }).then(({ x, y }) => {
      floatingEl.style.left = `${x}px`;
      floatingEl.style.top = `${y}px`;
    });
  };

  const stopAutoUpdate = autoUpdate(reference, floatingEl, update, {
    ancestorScroll: true, // 滚动跟随（而非滚动关闭）
    elementResize: true,
    animationFrame: false,
  });
  // 立即算一次，避免首帧出现在左上角
  update();

  return {
    update,
    stop: () => {
      stopAutoUpdate();
    },
  };
}
