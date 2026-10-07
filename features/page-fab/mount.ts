/**
 * 页面悬浮入口（Page FAB）· 挂载与交互
 *
 * 交互契约（见 docs/decisions-v2.md「页面悬浮入口」）：
 * - 静止时只有一个贴边的窄把手（鼠标档 8px），**不主动打扰**页面；
 *   指针移入 / 键盘聚焦 / 面板展开 / 拖拽中才滑出成完整圆形；
 * - 指针移入并停留 150ms（hover 意图）展开动作面板；
 *   面板**粘住、不因移出而收起**，关闭路径是：再点按钮（切换）/ 点面板外 / `×` / `Esc` / 滚动；
 * - 点击主按钮 = 切换展开状态（触屏与键盘的主路径）；
 * - 按住拖动可换位置，松手就近吸附到左/右边缘并**全局记忆**（`local:pageFabPos`）；
 * - 拖动与点击用位移阈值区分，拖完不会误触发动作。
 */
import { type ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { formatErrorForUi } from '@/shared/errors';
import { getPageFabPos, savePageFabPos } from '@/shared/storage/settings';
import { sendMessage } from '@/shared/messaging/client';
import { createActionItem, createFabDom, createFabStyles, applyGeometry, renderActionItem, renderTriggerTone, setAttentionOpacity, setFabHidden, setMenuOpen, setMenuView, setToast, type FabDom } from './dom';
import { resolveOpacity, resolveRevealed } from './attention';
import {
  clampFabX,
  clampFabY,
  defaultFabPos,
  fabAnchor,
  geometryForPointer,
  isDragGesture,
  resolveFabPos,
  type FabGeometry,
  type FabPos,
  type FabSide,
} from './position';
import type {
  PageFabAction,
  PageFabActionHandle,
  PageFabActionView,
  PageFabApi,
} from './types';

/** hover 意图判定时长：太短会划过就弹，太长会显得迟钝 */
const HOVER_INTENT_MS = 150;
/** 错误提示展示时长 */
const TOAST_MS = 3200;
/** 拖拽后抑制 click 的保护窗口（正常几毫秒内就会收到 click） */
const SUPPRESS_CLICK_MS = 400;
/**
 * 停止滚动多久后恢复常态不透明度。
 * 太短会在惯性滚动中反复闪烁，太长会显得「划不动它、它也一直不出来」。
 */
const SCROLL_IDLE_MS = 600;

const IDLE_VIEW: PageFabActionView = { tone: 'idle' };

interface RegisteredAction {
  action: PageFabAction;
  item: HTMLButtonElement;
  view: PageFabActionView;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  /**
   * 按下瞬间**按钮**（`size` 宽）的左 / 上边缘。
   *
   * 不用壳的盒子：壳只有把手那么宽，而按钮是贴着壳的贴边侧向外生长的，
   * 两者左边缘差一个 `size - peekWidth`。拖拽全程只关心按钮本身在哪，
   * 换算成壳的坐标交给 `applyPos` / `shellLeftFor`。
   */
  startLeft: number;
  startTop: number;
  moved: boolean;
}

export async function mountPageFab(
  ctx: ContentScriptContext,
): Promise<PageFabApi> {
  const viewport = () => ({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  /**
   * 触屏与鼠标是两套手指精度：触屏全露 48px、拖拽阈值放宽（见 COARSE_GEOM）。
   * 用 `matchMedia` 而非 UA 判断：UA 在桌面触屏 / 平板外接鼠标时都会说谎，
   * 而「主指针是否粗糙」正是这里真正关心的条件。
   */
  const coarseQuery = window.matchMedia('(pointer: coarse)');
  let geo: FabGeometry = geometryForPointer(coarseQuery.matches);

  // 先读落点再建 UI：避免先画在默认位置再「跳」到记忆位置
  const stored = await getPageFabPos().catch(() => null);
  let pos: FabPos = stored ?? defaultFabPos(viewport(), geo);

  const ui = await createShadowRootUi(ctx, {
    name: 'dualmind-page-fab',
    position: 'overlay',
    alignment: 'top-left',
    // 低于划词浮层（2147483646）：划词时浮层应压在入口之上
    zIndex: 2147483645,
    onMount(container) {
      const root = document.createElement('div');
      root.id = 'dualmind-page-fab-root';
      const style = document.createElement('style');
      style.textContent = createFabStyles();
      container.append(style, root);
      return root;
    },
  });

  ui.mount();
  const fab: FabDom = createFabDom();
  ui.mounted!.append(fab.wrap);

  const actions: RegisteredAction[] = [];
  let open = false;
  let dragging = false;
  let suppressClick = false;
  /** 指针是否停在入口上（滑出成完整圆形的条件之一，也参与 hover 起意） */
  let hovering = false;
  /** 是否处于「刚刚滚动过」的窗口内（注意力分级用） */
  let scrolling = false;
  let hoverTimer: number | undefined;
  let toastTimer: number | undefined;
  let suppressTimer: number | undefined;
  let scrollTimer: number | undefined;
  let hideTimer: number | undefined;
  let drag: DragState | null = null;

  /* ------------------------------ 位置 ------------------------------ */

  /**
   * 按钮左边缘 → 壳的 `left`。
   *
   * 壳的贴边侧边缘就是按钮的锚点：贴右时按钮从壳的左外侧伸出去，贴左时从右外侧伸出去。
   * 拖拽全程只跟踪按钮本身的位置（那才是用户看见、抓住的东西），
   * 落到 `left` 样式上时再补回这个差值。
   */
  function shellLeftFor(buttonLeft: number, side: FabSide): number {
    return side === 'right'
      ? buttonLeft + geo.size - geo.peekWidth
      : buttonLeft;
  }

  /** 把当前 `pos` 换算成壳的 `left/top` 并夹回视口（读到的旧值可能已越界） */
  function applyPos(): void {
    const anchor = fabAnchor(pos, viewport(), geo);
    fab.wrap.style.left = `${anchor.left}px`;
    fab.wrap.style.top = `${anchor.top}px`;
    fab.wrap.dataset.side = pos.side;
    pos = { ...pos, y: anchor.top };
  }

  /** 按钮在上半屏则向下展开，否则向上展开 —— 保证菜单不出视口 */
  function computeVertical(): 'up' | 'down' {
    const vp = viewport();
    return fabAnchor(pos, vp, geo).top + geo.size / 2 < vp.height / 2
      ? 'down'
      : 'up';
  }

  /* ------------------------ 注意力分级 / 形态 ------------------------ */

  /**
   * 同步主按钮的「不透明度」与「是否滑出成完整圆形」（`data-reveal`）。
   *
   * 两件事都由同一组输入决定（展开 / 悬停 / 拖拽 / 有状态 / 滚动中），
   * 放在一起算，避免两处各判一遍迟早不一致。
   * 「是否有状态」直接读 `renderTriggerTone` 刚写下的 `data-indicator`，
   * 而不是在此重新推导一遍 —— 否则同一件事会有两处判断。
   */
  function syncVisualState(): void {
    const indicator = fab.wrap.dataset.indicator === 'true';
    fab.wrap.dataset.scrolling = String(scrolling);
    setAttentionOpacity(
      fab.wrap,
      resolveOpacity({ open, scrolling, indicator }),
    );
    fab.wrap.dataset.reveal = String(
      resolveRevealed({ open, hover: hovering, dragging, indicator }),
    );
  }

  /* ------------------------------ 渲染 ------------------------------ */

  function refresh(): void {
    for (const entry of actions) {
      entry.view = entry.action.getView?.() ?? IDLE_VIEW;
      renderActionItem(entry.item, entry.action, entry.view);
    }
    renderTriggerTone(
      fab,
      actions.map((entry) => entry.view),
    );
    fab.wrap.dataset.empty = String(actions.length === 0);
    // 必须在 renderTriggerTone 之后：syncVisualState 依赖刚写下的 data-indicator
    syncVisualState();
  }

  function setOpen(next: boolean): void {
    if (open === next) return;
    open = next;
    if (next) {
      refresh(); // 收起期间状态可能变了（如翻译已在后台跑完）
      // 每次展开都从动作列表开始：否则上次停在「隐藏确认」上，会像点错
      setMenuView(fab, 'actions');
    }
    setMenuOpen(fab, next, computeVertical());
    syncVisualState();
  }

  function showToast(message: string): void {
    if (!message) return;
    setToast(fab, message);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => setToast(fab, ''), TOAST_MS);
  }

  /* ---------------------------- 隐藏入口 ---------------------------- */

  /**
   * 隐藏入口自身。
   *
   * 顺序很关键：先收起面板 → 隐藏按钮与面板（保留 toast）→ 等提示走完再 `ui.remove()`。
   * 若直接 `ui.remove()`，提示会与入口一起消失，用户无法分辨「隐藏成功」与「点坏了」；
   * 「所有页不再显示」之后页面上再无入口，提示里的恢复路径是唯一线索。
   */
  function hideSelf(message: string): void {
    setOpen(false);
    setFabHidden(fab, true);
    showToast(message);
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      ui.remove();
    }, TOAST_MS + 400);
  }

  /** 把本页 hostname 加入「不显示入口」列表（失败时回滚视觉状态并提示） */
  async function hideOnThisHost(): Promise<void> {
    const host = window.location.hostname;
    try {
      const settings = await sendMessage('settings:get', undefined);
      // 去重：重复隐藏同一站点不应往列表里塞重复项
      const next = settings.pageFabHiddenHosts.includes(host)
        ? settings.pageFabHiddenHosts
        : [...settings.pageFabHiddenHosts, host];
      await sendMessage('settings:save', { pageFabHiddenHosts: next });
    } catch (err) {
      showToast(formatErrorForUi(err));
      return;
    }
    hideSelf(`已在本站（${host}）隐藏，可在设置中重新开启`);
  }

  /** 全局关闭入口（恢复路径只有设置页，提示必须写清） */
  async function hideEverywhere(): Promise<void> {
    try {
      await sendMessage('settings:save', { pageFabEnabled: false });
    } catch (err) {
      showToast(formatErrorForUi(err));
      return;
    }
    hideSelf('已在所有页面隐藏，请在设置中重新开启');
  }

  /** 执行动作：入口壳统一兜底异常，动作内部不必自己弹提示 */
  async function runAction(action: PageFabAction): Promise<void> {
    setOpen(false);
    try {
      await action.onClick();
    } catch (err) {
      showToast(formatErrorForUi(err));
    }
    refresh();
  }

  /* ------------------------------ 注册 ------------------------------ */

  const api: PageFabApi = {
    registerAction(action: PageFabAction): PageFabActionHandle {
      const item = createActionItem(action, () => {
        void runAction(action);
      });
      fab.actionsBox.append(item);
      const entry: RegisteredAction = { action, item, view: IDLE_VIEW };
      actions.push(entry);
      /*
       * 入场动画的错峰序号（见 dom.ts 的 `--dm-pf-i`）。
       * 动作是挂载时一次性注册的，之后不再增删，因此这里算一次即可。
       */
      item.style.setProperty('--dm-pf-i', String(actions.length - 1));
      refresh();

      let disposed = false;
      return {
        update: () => {
          if (disposed) return;
          refresh();
        },
        dispose: () => {
          if (disposed) return;
          disposed = true;
          const index = actions.indexOf(entry);
          if (index >= 0) actions.splice(index, 1);
          item.remove();
          refresh();
        },
      };
    },
  };

  /* --------------------------- 展开 / 收起 --------------------------- */

  /**
   * 起意展开：只在「已收起且没有待触发的计时器」时武装。
   * 计时期间若开始拖拽或发生滚动则放弃（拖拽开始时与滚动开始时都会显式取消）。
   */
  function armHoverIntent(): void {
    // 滚动中不武装：否则停滚的瞬间会凭空弹出菜单（用户的注意力还在正文上）
    if (scrolling) return;
    if (dragging || drag || open || hoverTimer !== undefined) return;
    hoverTimer = window.setTimeout(() => {
      hoverTimer = undefined;
      if (dragging) return;
      setOpen(true);
    }, HOVER_INTENT_MS);
  }

  function cancelHoverIntent(): void {
    window.clearTimeout(hoverTimer);
    hoverTimer = undefined;
  }

  /*
   * 指针进入 / 离开入口。
   *
   * 进入：滑出成完整圆形（否则用户面对一个 8px 把手，根本不知道它能点）并开始起意。
   * 离开：**不收起面板** —— 面板是粘住的，关闭路径只有
   * 「再点按钮（切换）/ 点面板外 / × / Esc / 滚动」。代价是「指针移到一半就收」的
   * 老毛病没了：老版本为了那段空隙不被判成离开，还要拿伪元素去「桥接」命中区。
   */
  fab.wrap.addEventListener('pointerenter', () => {
    hovering = true;
    syncVisualState();
    armHoverIntent();
  });

  // 关键：点击动作后菜单收起，但指针仍停在入口范围内，此时**不会**再触发
  // pointerenter，若不靠 pointermove 重新起意，用户会觉得「移入没反应」。
  fab.wrap.addEventListener('pointermove', () => {
    armHoverIntent();
  });

  fab.wrap.addEventListener('pointerleave', () => {
    hovering = false;
    cancelHoverIntent();
    syncVisualState();
  });

  // 点击主按钮：切换展开状态（触屏 / 键盘用户的主入口）
  fab.trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    setOpen(!open);
  });

  // 面板头部的关闭按钮：与「点面板外 / Esc」并列的显式关闭路径
  fab.close.addEventListener('click', (event) => {
    event.stopPropagation();
    setOpen(false);
  });

  // 键盘聚焦即展开，避免必须再按一次 Enter 才能看到动作。
  // 必须限定 `:focus-visible`：鼠标点击也会触发 focus，若在此展开，
  // 紧随其后的 click 会立刻把它收起（表现为「点一下没反应」）。
  fab.trigger.addEventListener('focus', () => {
    if (dragging) return;
    if (!fab.trigger.matches(':focus-visible')) return;
    setOpen(true);
  });

  /* -------------------------- 隐藏入口的操作 -------------------------- */

  // 进入隐藏二级视图：不收起面板（原地换内容），因此这里不能走 runAction
  fab.hideEntry.addEventListener('click', (event) => {
    event.stopPropagation();
    setMenuView(fab, 'hide');
  });

  fab.hideBack.addEventListener('click', (event) => {
    event.stopPropagation();
    setMenuView(fab, 'actions');
  });

  fab.hideHost.addEventListener('click', (event) => {
    event.stopPropagation();
    void hideOnThisHost();
  });

  fab.hideAll.addEventListener('click', (event) => {
    event.stopPropagation();
    void hideEverywhere();
  });

  /* ------------------------------ 拖拽 ------------------------------ */

  fab.trigger.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return; // 仅主键
    const rect = fab.wrap.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      // 壳只有把手宽、按钮贴在贴边侧，因此按钮左边缘要按贴边方向换算
      startLeft: pos.side === 'right' ? rect.right - geo.size : rect.left,
      startTop: rect.top,
      moved: false,
    };
    // 指针捕获：拖到窗口边缘外也持续收到 move / up
    fab.trigger.setPointerCapture(event.pointerId);
    /*
     * 这里**不**收起面板。按下与点击无法区分，而点击 = 切换展开：
     * 若按下就收，紧随其后的 click 会立刻再展开一次，表现为「点一下没反应」。
     * 与展开互斥的时机推迟到「位移超过阈值、真的开始拖」时（见 pointermove）。
     */
    cancelHoverIntent();
  });

  fab.trigger.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved) {
      // 未超阈值不移动：否则轻微手抖会把「点击」变成「挪了两像素」
      if (!isDragGesture(dx, dy, geo)) return;
      drag.moved = true;
      dragging = true;
      fab.wrap.dataset.dragging = 'true';
      // 真的拖起来了才收面板：边拖边闪菜单比「拖完再收」更难受
      setOpen(false);
      syncVisualState();
    }
    const vp = viewport();
    const buttonLeft = clampFabX(drag.startLeft + dx, vp.width, geo);
    const buttonTop = clampFabY(drag.startTop + dy, vp.height, geo);
    fab.wrap.style.left = `${shellLeftFor(buttonLeft, pos.side)}px`;
    fab.wrap.style.top = `${buttonTop}px`;
  });

  function endDrag(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { moved, startLeft, startTop, startX, startY } = drag;
    drag = null;
    dragging = false;
    fab.wrap.dataset.dragging = 'false';
    // 松手后不再是「拖拽中」，把手要能收回去（除非还悬停 / 展开 / 有状态）
    syncVisualState();
    if (fab.trigger.hasPointerCapture(event.pointerId)) {
      fab.trigger.releasePointerCapture(event.pointerId);
    }
    if (!moved) return;

    // 松手才定位与落库：拖动过程只跟随指针，不做吸附（避免「边拖边跳」）
    pos = resolveFabPos(
      startLeft + (event.clientX - startX),
      startTop + (event.clientY - startY),
      viewport(),
      geo,
    );
    applyPos();
    // 吞掉紧随其后的 click，否则「拖完手一松」会顺手触发动作
    suppressClick = true;
    window.clearTimeout(suppressTimer);
    suppressTimer = window.setTimeout(() => {
      suppressClick = false;
    }, SUPPRESS_CLICK_MS);
    void savePageFabPos(pos).catch(() => {
      /* 位置持久化失败不影响本次使用，下次回到上次成功保存的位置 */
    });
  }

  fab.trigger.addEventListener('pointerup', endDrag);
  fab.trigger.addEventListener('pointercancel', endDrag);

  /* ---------------------------- 生命周期 ---------------------------- */

  const controller = new AbortController();

  /*
   * Esc 收起（键盘用户）。
   * 焦点还在面板里时先回焦按钮 —— 否则焦点会留在一个已经隐藏的面板里，
   * 下一个 Tab 会从「看不见的地方」继续。顺序是「先回焦、再收起」：
   * 回焦可能触发展开（`:focus-visible`），随后这一步收起把它抵消掉，
   * 净效果是「关掉且焦点在按钮上」，不依赖 focus 事件与本次收起的先后。
   */
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !open) return;
      if (event.composedPath().includes(fab.wrap)) fab.trigger.focus();
      setOpen(false);
    },
    { capture: true, signal: controller.signal },
  );

  /*
   * 点击入口之外收起。
   *
   * 面板是粘住的（移出不再自动收起，见 pointerenter / pointerleave 的注释），
   * 因此这是**主关闭路径**：点页面任何别处都应该把它关掉，否则它会一直挂在那。
   * 触屏尤其依赖它 —— 那里连 hover 都没有。
   */
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!open) return;
      if (event.composedPath().includes(fab.wrap)) return;
      setOpen(false);
    },
    { capture: true, signal: controller.signal },
  );

  // 视口变化（窗口缩放 / 旋屏）：把落点夹回当前视口，防止按钮被挤出屏幕
  window.addEventListener(
    'resize',
    () => {
      applyPos();
      if (open) setMenuOpen(fab, true, computeVertical());
    },
    { signal: controller.signal },
  );

  /**
   * 滚动时让位正文。
   *
   * 用 capture 监听：滚动事件不冒泡，只有捕获阶段才能收到内部滚动容器（
   * 很多站点正文是 `overflow: auto` 的 div 而不是文档本身）的滚动。
   * passive: 不阻断滚动，也避免被浏览器降级为非被动监听而拖慢滚动。
   *
   * 同时**收起面板**：面板是 `position: fixed` 的，页面在滚它却钉在原地，
   * 会一直挡着正文（老版本靠「移出即收」掩盖了这一点，粘性面板必须显式处理）。
   * 收起来也顺带避免了「滚动中面板还亮着」与注意力分级自相矛盾。
   */
  window.addEventListener(
    'scroll',
    () => {
      cancelHoverIntent();
      if (open) setOpen(false);
      if (!scrolling) {
        scrolling = true;
        syncVisualState();
      }
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        scrolling = false;
        syncVisualState();
      }, SCROLL_IDLE_MS);
    },
    { capture: true, passive: true, signal: controller.signal },
  );

  /**
   * 指针类型变化（平板外接 / 拔掉鼠标）：切换几何并重算落点。
   * 尺寸变了但落点不重算的话，触屏下会「离边缘多出一截」或贴出视口。
   */
  coarseQuery.addEventListener(
    'change',
    (event) => {
      geo = geometryForPointer(event.matches);
      applyGeometry(fab.wrap, geo);
      applyPos();
      if (open) setMenuOpen(fab, true, computeVertical());
    },
    { signal: controller.signal },
  );

  ctx.onInvalidated(() => {
    controller.abort();
    cancelHoverIntent();
    window.clearTimeout(toastTimer);
    window.clearTimeout(suppressTimer);
    window.clearTimeout(scrollTimer);
    window.clearTimeout(hideTimer);
  });

  applyGeometry(fab.wrap, geo);
  applyPos();
  refresh();

  return api;
}
