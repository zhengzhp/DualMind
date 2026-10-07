/**
 * 悬浮入口的样式与渲染（原生 DOM，不用 React）。
 *
 * 与划词浮层 / 沉浸译入口保持同一取向：内容脚本侧不引入框架，
 * 靠 Shadow DOM 隔离宿主页面样式，靠 `data-*` 驱动状态，避免重建节点。
 *
 * 视觉取向（2026-10-07 定）：
 * - 主按钮为**圆形**，用**浅色标记**（浅蓝圆底 + 深蓝双 D，见 `assets/logo.svg`）；
 * - 不用「半透明浅色玻璃底」：那种底自身没有对比边界，落在浅底页面上会糊掉。
 *   浅色按钮改成**深色发丝环 + 加深投影**拉开边界（白环在白底页面上等于没有）；
 * - 状态反馈**不染按钮底色**，走发丝环之外的**语义色环**（底色浅，品牌蓝环此时可读）。
 */
import {
  DEFAULT_GEOM,
  hasPeek,
  type FabGeometry,
} from './position';
import type {
  PageFabAction,
  PageFabActionView,
  PageFabIconName,
  PageFabTone,
} from './types';

/** 入口壳的 DOM 句柄 */
export interface FabDom {
  wrap: HTMLDivElement;
  trigger: HTMLButtonElement;
  menu: HTMLDivElement;
  /** 面板头部的关闭按钮（与「点击面板外 / Esc」并列的显式关闭路径） */
  close: HTMLButtonElement;
  /** 各 feature 注册的动作项容器（壳与自己内置的操作分开，`data-empty` 只看这里） */
  actionsBox: HTMLDivElement;
  /** 「隐藏悬浮按钮」：切到隐藏二级视图 */
  hideEntry: HTMLButtonElement;
  /** 隐藏二级视图（本站 / 所有页 / 返回） */
  hideView: HTMLDivElement;
  hideHost: HTMLButtonElement;
  hideAll: HTMLButtonElement;
  hideBack: HTMLButtonElement;
  toast: HTMLDivElement;
}

/** 动作面板的两个视图：动作列表 / 隐藏确认 */
export type FabMenuView = 'actions' | 'hide';

/**
 * 品牌资产 `assets/logo.svg`（浅色版）的几何。
 *
 * 该资产是 128 网格、圆角方块底板（`rect rx=28`）。入口按钮是**圆形**，
 * 因此这里把底板换成同尺寸的 `<circle>`：`r = 64` 正好铺满 0 0 128 128。
 * 字形路径与资产逐字一致（由 `dom.test.ts` 比对）。
 */
export const BRAND_VIEWBOX = 128;

/**
 * 品牌标记（浅蓝圆底 + 深蓝双 D）。
 *
 * **几何与配色逐字取自 `assets/logo.svg`**（浅色极性），由 `dom.test.ts` 与资产
 * 逐字比对：不引 `web_accessible_resources`，也不允许出现第二份互相矛盾的图标源。
 * 渐变 id 加 `dm-` 前缀，避免同页多份内联副本互相污染。
 * 刻意不写 `width` / `height`：尺寸完全交给 CSS，才能按目标像素栅格化。
 *
 * 字形不再需要任何平移补偿：静止的窄把手是一块独立形状（不显示字形），
 * 只有完整圆形里才画标记，那时字形本来就居中（见 `dom.ts` 的 `data-reveal` 规则）。
 */
export const BRAND_MARK_SVG =
  `<svg class="dm-pf-tile" viewBox="0 0 ${BRAND_VIEWBOX} ${BRAND_VIEWBOX}" role="img" aria-label="DualMind">` +
  '<defs><linearGradient id="dmTile" gradientUnits="userSpaceOnUse" x1="44.98" y1="-6.98" x2="83.02" y2="134.98">' +
  '<stop offset="0" stop-color="#eef8ff"/><stop offset="1" stop-color="#d9eeff"/>' +
  '</linearGradient></defs>' +
  `<circle cx="64" cy="64" r="${BRAND_VIEWBOX / 2}" fill="url(#dmTile)"/>` +
  '<g>' +
  '<path fill-rule="nonzero" fill="#0f2f4d" d="M50 30L50 30Q60 30 60 40L60 64L40 64L40 40Q40 30 50 30ZM54 30C72.78 30 88 45.22 88 64L71 64C71 54.61 63.39 47 54 47Z"/>' +
  '<path fill-rule="nonzero" fill="#1b7fd1" d="M40 64L60 64L60 88Q60 98 50 98L50 98Q40 98 40 88ZM88 64C88 82.78 72.78 98 54 98L54 81C63.39 81 71 73.39 71 64Z"/>' +
  '</g>' +
  '</svg>';

/**
 * 面板头部的小标记：与主按钮**同源**（`BRAND_MARK_SVG`），只替换渐变 id。
 *
 * 同一个 shadow root 里若出现两个 `id="dmTile"`，`url(#dmTile)` 只会命中第一个；
 * 两份定义虽然完全相同、结果一样，但那是靠巧合成立 —— 显式改名后就不依赖它了。
 */
const BRAND_MARK_HEAD_SVG = BRAND_MARK_SVG.replace(/dmTile/g, 'dmMark');

/**
 * 把几何参数写进 CSS 变量，并标记该几何是否启用「窄把手」。
 *
 * 样式表里自带一套默认值（桌面几何），这里做运行时覆写：
 * 触屏要换成 48px 且**不启用把手**（没有悬停可唤出，8px 点不中），
 * 换屏幕 / 接外接屏时指针类型还可能变，因此几何必须是变量而不是编译期常量。
 */
export function applyGeometry(wrap: HTMLElement, geo: FabGeometry): void {
  wrap.style.setProperty('--dm-pf-size', `${geo.size}px`);
  wrap.style.setProperty('--dm-pf-peek', `${geo.peekWidth}px`);
  wrap.dataset.peek = String(hasPeek(geo));
}

/**
 * 写入当前的不透明度（数值由 `attention.ts` 的 `resolveOpacity` 算出）。
 * 只写变量，不改节点可见性 —— 避免淡出时连 `pointerenter` 都收不到。
 */
export function setAttentionOpacity(wrap: HTMLElement, opacity: number): void {
  wrap.style.setProperty('--dm-pf-idle-opacity', String(opacity));
}

/** 内置动作图标（内联 SVG，避免入口壳依赖图标库或网络资源） */
const ICONS: Record<PageFabIconName, string> = {
  // 地球：整页双语翻译
  immersive:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.4 2.6 3.6 5.5 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.5-3.6-9S9.6 5.6 12 3z"/></svg>',
  // 文档 + 摘要线：总结本页
  summarize:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>',
  // 鼠标指针：本页 Agent 操作
  agent:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4l7 16 2-6 6-2z"/><path d="M13 13l5 5"/></svg>',
};

/**
 * 入口壳自己的图标（不属于任何 feature，故不进 `PageFabIconName`）。
 * 与动作图标同样内联。
 */
const SHELL_ICONS = {
  // 划掉的眼睛：隐藏
  hide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A9.9 9.9 0 0112 5c5 0 9 4.5 9 7 0 .9-.4 2-1.2 3.1"/><path d="M6.3 7.1C4.2 8.6 3 10.4 3 12c0 2.5 4 7 9 7 1.3 0 2.5-.3 3.6-.8"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>',
  // 左箭头：返回动作列表
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5l-7 7 7 7"/><path d="M4 12h16"/></svg>',
  // 叉：关闭面板（与「点击面板外 / Esc」并列的显式关闭路径）
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>',
} as const;

/** tone → 主按钮状态点 / 动作项配色优先级（数字越大越优先显示） */
const TONE_PRIORITY: Record<PageFabTone, number> = {
  error: 4,
  warning: 3,
  busy: 2,
  active: 1,
  idle: 0,
};

/**
 * 入口壳的全部样式（一个字符串，注入 shadow root）。
 *
 * ⚠️ 这是**模板字符串**：整段 CSS（含注释）里绝不能出现反引号 ——
 * 一个反引号就会提前终止模板，整个模块语法失败、构建静默用旧样式。
 * 需要引用标识符时直接写名字，不要用 Markdown 式的反引号包起来。
 */
export function createFabStyles(): string {
  return `
    :host { all: initial; }
    .dm-pf {
      position: fixed;
      /*
       * 壳的尺寸是**显式**的：宽 = 静止时的把手宽，高 = 按钮边长。
       * 触发按钮是绝对定位的子元素（见下），没有在流子元素能撑开收缩宽度；
       * 而壳的「贴边侧边缘」正是面板 / 提示的对齐基准 —— 一旦塌成 0 宽，它们就会贴错位置。
       */
      width: var(--dm-pf-peek);
      height: var(--dm-pf-size);
      /* 尺寸都从 position.ts 推导；触屏下由 applyGeometry 运行时覆写 */
      --dm-pf-size: ${DEFAULT_GEOM.size}px;
      --dm-pf-peek: ${DEFAULT_GEOM.peekWidth}px;
      /*
       * 注意力分级的不透明度，由 mount.ts 用 attention.ts 的 resolveOpacity 写入。
       * 默认 1：万一没写入也宁可「全显」而不是「看不见」（后者更难排查）。
       */
      --dm-pf-idle-opacity: 1;
      /* 状态环颜色：默认透明（无状态不打环），由 data-tone 覆写 */
      --dm-pf-tone: transparent;
      /* 按钮与面板之间的空隙宽度 */
      --dm-pf-gap: 8px;
      font-family: "IBM Plex Sans", "Noto Sans SC", system-ui, -apple-system, sans-serif;
      font-size: 12px;
      line-height: 1.35;
      color: #0f2f4d;
      z-index: 2147483645;
    }
    /* 无动作注册时不占位（例如某站点只注入了划词能力） */
    .dm-pf[data-empty="true"] { display: none; }

    /*
     * 主按钮 = 圆形（展开态）+ 浅色标记（浅蓝圆底 + 深蓝双 D）。
     * 对比度不靠半透明底色，而是「深色发丝环 + 加深投影」：
     * 发丝环负责在白底 / 浅底页面上把按钮的轮廓画出来，投影负责让它从页面上浮起。
     * 状态则在发丝环之外再叠一圈语义色（不染按钮底色 —— 底色不承载状态语义）。
     *
     * **绝对定位并锚在壳的贴边侧**（见下面的 data-side 规则）：
     * 于是「长成完整圆形」是朝页面内侧生长，外侧边缘始终与视口边缘对齐 ——
     * 既不会长到屏幕外（老版本靠一个横向回推量把面板拽回来），
     * 也保证了把手与完整圆形共用同一条贴边基准线，两者切换时不会左右跳。
     */
    .dm-pf-trigger {
      position: absolute;
      top: 0;
      display: block;
      width: var(--dm-pf-size);
      height: var(--dm-pf-size);
      padding: 0;
      border: 0;
      background: none;
      /* 展开态：正圆 */
      border-radius: 50%;
      box-shadow: 0 0 0 1px rgba(15, 47, 77, 0.18),
        0 0 0 3px var(--dm-pf-tone), 0 4px 12px rgba(15, 47, 77, 0.22);
      cursor: grab;
      touch-action: none;
      /*
       * 注意力分级：常态 / 滚动中由变量压低，指针移入或键盘聚焦即恢复。
       * 只降不透明度、不改 visibility —— 否则淡出时连 pointerenter 都收不到，
       * 用户根本没法把它「唤回来」。
       */
      opacity: var(--dm-pf-idle-opacity);
      transition: width 0.16s ease, border-radius 0.16s ease,
        box-shadow 0.14s ease, opacity 0.18s ease, transform 0.14s ease;
      -webkit-user-select: none;
      user-select: none;
    }
    /* 贴边侧：壳的边缘即视口边缘，按钮从这条边往页面内侧长 */
    .dm-pf[data-side="right"] .dm-pf-trigger { right: 0; }
    .dm-pf[data-side="left"] .dm-pf-trigger { left: 0; }

    /*
     * 静止形态（peek）：收窄成贴边窄把手，圆角只留在页面内侧。
     *
     * 刻意**不用**「把圆形裁掉 1/3」的老做法：那是把圆切一刀，露出的是一段越靠边越尖的
     * 弧线（在贴边处宽度趋近 0），读起来像「图标破了」；而且为了让被切掉的字形回到
     * 可见切片中心，还得额外算一份平移量。窄把手是一块**独立形状**，不带这些补偿。
     * 只对 data-peek="true"（鼠标档）生效：触屏没有悬停可唤出，十几像素点不中。
     *
     * 可辨识性靠四件事，缺一件就会淡成「页面上的白条」（8px + 近白渐变 + 常态
     * 0.42 不透明度的旧版实机反馈「注意不到」—— 三重降对比叠在一起就越过「看得见」了）：
     * 1) 底色是**品牌蓝的半透明实底**，不靠页面底色衬托：白底上有颜色、深底上够亮；
     * 2) 页面内侧一条 2px 品牌蓝实边，给出「这里有个控件、朝页面这边」的方向感；
     *    —— 它也是最能扛住不透明度的一项（两端的乘法会让浅色填充整体变淡）；
     * 3) 把手内竖排三个抓手点（见 .dm-pf-grip）—— 空白窄条读起来像装饰，不像入口；
     * 4) 常态不透明度提到 0.85（见 attention.ts）：**浅色填充再叠一层透明度，必然化进白底**，
     *    只加宽、只加色都救不回来；「让位」交给滚动档的 0.15 表达更准确。
     */
    .dm-pf[data-peek="true"][data-reveal="false"] .dm-pf-trigger {
      width: var(--dm-pf-peek);
      background: rgba(27, 127, 209, 0.2);
      box-shadow: 0 0 0 1px rgba(15, 47, 77, 0.22),
        0 2px 10px rgba(15, 47, 77, 0.2);
    }
    .dm-pf[data-peek="true"][data-reveal="false"][data-side="right"] .dm-pf-trigger {
      border-radius: 8px 0 0 8px;
      /* 内边那条品牌蓝实边：贴右时页面在左边，实边就压在左缘 */
      box-shadow: inset 2px 0 0 rgba(27, 127, 209, 0.85),
        0 0 0 1px rgba(15, 47, 77, 0.22), 0 2px 10px rgba(15, 47, 77, 0.2);
    }
    .dm-pf[data-peek="true"][data-reveal="false"][data-side="left"] .dm-pf-trigger {
      border-radius: 0 8px 8px 0;
      box-shadow: inset -2px 0 0 rgba(27, 127, 209, 0.85),
        0 0 0 1px rgba(15, 47, 77, 0.22), 0 2px 10px rgba(15, 47, 77, 0.2);
    }
    /*
     * 把手里的「抓手」：三个圆点竖排。
     * 这是「可抓 / 可展开」的通用符号（抽屉把手、拖拽把手都用它），
     * 让窄条读起来像控件而不是页面上的装饰。不参与交互（pointer-events: none），
     * 命中区永远整个按钮，不做逐点命中。
     * 只在静止把手态显示：滑出成圆形时品牌标记占满，它既多余又会被盖住。
     */
    .dm-pf-grip {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      opacity: 0;
      transition: opacity 0.12s ease;
      pointer-events: none;
    }
    .dm-pf-grip span {
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: rgba(15, 47, 77, 0.72);
    }
    .dm-pf[data-peek="true"][data-reveal="false"] .dm-pf-grip { opacity: 1; }
    /* 后置 + 更高特异性：稳定赢过变量，不依赖书写顺序的巧合 */
    .dm-pf-trigger:hover,
    .dm-pf-trigger:focus-visible,
    .dm-pf:focus-within .dm-pf-trigger {
      opacity: 1;
    }
    .dm-pf-trigger:hover {
      box-shadow: 0 0 0 1px rgba(15, 47, 77, 0.24),
        0 0 0 3px var(--dm-pf-tone), 0 8px 18px rgba(15, 47, 77, 0.3);
    }
    .dm-pf-trigger:focus-visible { outline: 2px solid #1b7fd1; outline-offset: 4px; }
    /*
     * 品牌标记只在完整圆形里出现：把手状态把 svg 拉成 12x40 会糊成一团，
     * 交叉淡入淡出比缩放更稳（缩放会经过一段「畸形的中间态」）。
     * 把手态由 .dm-pf-grip 接手表达「这是个控件」。
     */
    .dm-pf-tile {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      transition: opacity 0.12s ease;
    }
    .dm-pf[data-peek="true"][data-reveal="false"] .dm-pf-tile { opacity: 0; }
    .dm-pf[data-dragging="true"] .dm-pf-trigger { cursor: grabbing; transition: none; }

    /*
     * 状态环色板：底色是浅色圆底，因此品牌蓝环自身即清晰可读（无需再避让）。
     * 由发丝环与圆底隔开，深底 / 浅底 / 花底都能读出来。
     * 未点亮（idle）时保持透明，不打环。
     */
    .dm-pf[data-indicator="true"][data-tone="busy"] { --dm-pf-tone: #1b7fd1; }
    .dm-pf[data-indicator="true"][data-tone="active"] { --dm-pf-tone: #17a673; }
    .dm-pf[data-indicator="true"][data-tone="warning"] { --dm-pf-tone: #d9a13b; }
    .dm-pf[data-indicator="true"][data-tone="error"] { --dm-pf-tone: #d92d20; }
    /* 「进行中」用动效表达，比换个颜色更少歧义（颜色已被语义状态占用） */
    .dm-pf[data-indicator="true"][data-tone="busy"] .dm-pf-trigger {
      animation: dm-pf-pulse 1.4s ease-out infinite;
    }
    @keyframes dm-pf-pulse {
      0%, 100% {
        box-shadow: 0 0 0 1px rgba(15, 47, 77, 0.18),
          0 0 0 3px var(--dm-pf-tone), 0 4px 12px rgba(15, 47, 77, 0.22);
      }
      70% {
        box-shadow: 0 0 0 1px rgba(15, 47, 77, 0.18),
          0 0 0 10px rgba(27, 127, 209, 0), 0 4px 12px rgba(15, 47, 77, 0.22);
      }
    }
    /*
     * 尊重系统的「减少动态效果」：脉冲、把手展开、动作项入场全部退化为瞬时切换。
     * 注意这**不影响功能**：reveal 只是一次宽度切换，去掉过渡后照样会展开。
     */
    @media (prefers-reduced-motion: reduce) {
      .dm-pf[data-indicator="true"][data-tone="busy"] .dm-pf-trigger {
        animation: none;
      }
      .dm-pf-trigger,
      .dm-pf-tile,
      .dm-pf-menu,
      .dm-pf-toast {
        transition: none;
      }
      .dm-pf-menu-actions > .dm-pf-item { animation: none; }
    }

    /*
     * 动作面板。
     *
     * 对齐基准是**壳的贴边侧边缘**，而壳的边缘就是视口边缘（见 position.ts 的 fabAnchor），
     * 因此面板整块天然在屏内 —— 老版本那套「按贴边方向把面板推回视口内」的补偿量
     * （--dm-pf-menu-dx）连同它的坑一起删掉了。
     */
    .dm-pf-menu {
      position: absolute;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 220px;
      padding: 8px;
      border: 1px solid #e3edf8;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.98);
      box-shadow: 0 12px 32px rgba(15, 47, 77, 0.22);
      opacity: 0;
      visibility: hidden;
      /* 从按钮那一角「长出来」：位移给方向、缩放给高度感 */
      transform: translateY(4px) scale(0.98);
      transform-origin: var(--dm-pf-origin, bottom right);
      transition: opacity 0.14s ease, transform 0.14s ease, visibility 0.14s;
      pointer-events: none;
    }
    .dm-pf[data-open="true"] .dm-pf-menu {
      opacity: 1;
      visibility: visible;
      transform: none;
      pointer-events: auto;
    }
    /* 贴右 → 面板向左伸展并右对齐；贴左 → 反向 */
    .dm-pf[data-side="right"] .dm-pf-menu { right: 0; --dm-pf-origin: bottom right; }
    .dm-pf[data-side="left"] .dm-pf-menu { left: 0; --dm-pf-origin: bottom left; }
    /* 按钮在上半屏时向下展开，避免菜单顶出视口 */
    .dm-pf[data-v="down"] .dm-pf-menu { top: calc(100% + var(--dm-pf-gap)); }
    .dm-pf[data-v="up"] .dm-pf-menu { bottom: calc(100% + var(--dm-pf-gap)); }

    /*
     * 面板头部：品牌标记 + 名称 + 关闭。
     * 这一行提供**归属感**（面板长得像网页自家的浮层时，用户不敢点里面的东西），
     * 同时给出「点击面板外」之外一条明确可见的关闭路径。
     */
    .dm-pf-head {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 1px 2px 6px;
      margin-bottom: 4px;
      border-bottom: 1px solid #e8f1fa;
    }
    .dm-pf-head-mark { display: flex; flex: none; width: 18px; height: 18px; }
    .dm-pf-head-mark svg { width: 100%; height: 100%; }
    .dm-pf-head-title {
      flex: 1;
      min-width: 0;
      color: #123a5c;
      font-size: 12px;
      font-weight: 600;
    }
    .dm-pf-close {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      padding: 0;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: #5b7a99;
      cursor: pointer;
    }
    .dm-pf-close:hover { background: #eef4fa; color: #123a5c; }
    .dm-pf-close:focus-visible { outline: 2px solid #1b7fd1; outline-offset: 1px; }
    .dm-pf-close svg { width: 14px; height: 14px; }

    .dm-pf-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      /* 44px：Material 的触控目标下限，也是「一行稳稳点得中」的经验值 */
      min-height: 44px;
      padding: 0 10px;
      border: 0;
      border-radius: 11px;
      background: transparent;
      color: #123a5c;
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      white-space: nowrap;
    }
    .dm-pf-item:hover { background: #eaf3fc; }
    .dm-pf-item:focus-visible { outline: 2px solid #1b7fd1; outline-offset: -2px; }

    /*
     * 展开时动作项错峰淡入（序号由 mount.ts 写进 --dm-pf-i）。
     * 只作用于 feature 注册的动作：壳自带的「隐藏」行不参与 ——
     * 否则每次展开都会看到一串与功能无关的东西在动，反而显得页面在抖。
     */
    .dm-pf[data-open="true"] .dm-pf-menu-actions > .dm-pf-item {
      animation: dm-pf-item-in 0.18s ease both;
      animation-delay: calc(var(--dm-pf-i, 0) * 20ms);
    }
    @keyframes dm-pf-item-in {
      from { opacity: 0; transform: translateY(3px); }
      to { opacity: 1; transform: none; }
    }

    /*
     * 动作列表与「隐藏入口」之间必须有视觉分隔：
     * 前者是功能（翻译 / 总结），后者会改变入口自身的存续，
     * 混在一起容易被顺手点到。
     */
    .dm-pf-menu-actions {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .dm-pf-menu-footer {
      display: flex;
      flex-direction: column;
      margin-top: 5px;
      padding-top: 5px;
      border-top: 1px solid #e8f1fa;
    }
    /* 隐藏 / 返回属于「次要且不可逆」的操作，刻意比动作项轻 */
    .dm-pf-item-quiet { color: #5b7a99; font-weight: 500; }
    .dm-pf-item-quiet:hover { background: #f2f6fb; }

    /*
     * 二级视图「原地换内容」而不是侧向飞出：
     * 飞出面板要另算一套横向位移（贴左 / 贴右都要推），在视口边缘极易被裁；
     * 原地替换完全复用既有的展开 / 收起机制。
     */
    .dm-pf-menu-hide { display: flex; flex-direction: column; gap: 2px; }
    .dm-pf[data-view="actions"] .dm-pf-menu-hide { display: none; }
    .dm-pf[data-view="hide"] .dm-pf-menu-actions,
    .dm-pf[data-view="hide"] .dm-pf-menu-footer { display: none; }
    .dm-pf-menu-hide-note {
      padding: 2px 9px 4px;
      color: #5b7a99;
      font-size: 11px;
      font-weight: 500;
    }
    .dm-pf-item-icon { display: flex; flex: none; color: #1b7fd1; }
    /* 未配置图标的动作不留空位（否则会在行内多出一个 gap） */
    .dm-pf-item-icon:empty { display: none; }
    .dm-pf-item-icon svg { width: 16px; height: 16px; }
    .dm-pf-item-text { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
    /*
     * 文案可能很长（「显示原文」+ 状态；future 还会有更长的动作名），
     * 而状态文案是**读数**（「翻译中 3/12」），被截断就失去意义 ——
     * 因此让主文案让位、自己截断，状态保持完整。
     */
    .dm-pf-item-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 600;
    }
    .dm-pf-item-status { flex: none; color: #5b7a99; font-size: 11px; font-weight: 500; }
    /* 无状态文案时不占位（否则会多出一个 gap 的空隙） */
    .dm-pf-item-status:empty { display: none; }
    .dm-pf-item[data-tone="busy"] .dm-pf-item-icon { color: #1b7fd1; }
    .dm-pf-item[data-tone="active"] .dm-pf-item-icon { color: #17a673; }
    .dm-pf-item[data-tone="warning"] .dm-pf-item-icon { color: #d9a13b; }
    .dm-pf-item[data-tone="error"] .dm-pf-item-icon { color: #d92d20; }
    .dm-pf-item[data-tone="error"] .dm-pf-item-label { color: #b42318; }
    .dm-pf-item[data-tone="warning"] .dm-pf-item-status { color: #a9761f; }

    /*
     * 动作失败时的一次性提示（入口壳统一兜底，动作内部无需再管 UI）。
     *
     * width: max-content 是必须的，不能只给 max-width：
     * 壳是 fixed 且只有**把手那么宽**（8px），在流子元素为空，
     * 而 toast 是只有 right / left 的绝定位元素，可用宽度就被限制在这 8px 内。
     * CJK 任意两字之间都可断行，「首选最小宽度」≈ 一个字，结果被压成**一字一行**。
     * 面板没塌是因为它另有 min-width: 220px 兜底 —— 这里同理需要显式定宽。
     * max-content + max-width 的组合：先按单行量取自然宽度，
     * 超过 240px 才在内部正常折行。
     */
    .dm-pf-toast {
      position: absolute;
      width: max-content;
      max-width: 240px;
      /* 阴影根里 :host { all: initial }，默认是 content-box：
         不设它会变成「240px 正文 + 内边距」，实际宽度超出上限 */
      box-sizing: border-box;
      padding: 6px 9px;
      border-radius: 10px;
      background: rgba(20, 32, 46, 0.94);
      color: #fff;
      font-size: 11px;
      line-height: 1.4;
      /* 提示文案里会内嵌 hostname（「已在本站 a.b.c 隐藏」）：
         遇到超长且无空格的域名时，max-content 会溢出盒子，必须允许硬断 */
      overflow-wrap: anywhere;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.14s ease, visibility 0.14s;
      pointer-events: none;
    }
    .dm-pf-toast[data-visible="true"] { opacity: 1; visibility: visible; }
    .dm-pf[data-side="right"] .dm-pf-toast { right: 0; }
    .dm-pf[data-side="left"] .dm-pf-toast { left: 0; }
    .dm-pf[data-v="down"] .dm-pf-toast { top: calc(100% + var(--dm-pf-gap)); }
    .dm-pf[data-v="up"] .dm-pf-toast { bottom: calc(100% + var(--dm-pf-gap)); }

    /*
     * 入口把自己藏起来之后的状态。
     *
     * 只作用在按钮与面板上（**不含 toast**）：隐藏是用户点出来的，
     * 必须留一条「已隐藏 · 可恢复」的反馈活在入口消失之后，
     * 否则表现为「点了一下整个东西没了」，像是点坏了。
     * 用 visibility 而非 display：壳仍占位（壳有显式尺寸），
     * toast 的定位锚点才不会塌掉、飘到奇怪的位置。
     * 必须放在最后：与 .dm-pf[data-open] 同特异性，靠顺序取胜。
     */
    .dm-pf[data-hidden="true"] .dm-pf-trigger,
    .dm-pf[data-hidden="true"] .dm-pf-menu {
      visibility: hidden;
      pointer-events: none;
    }
  `;
}

/** 构建入口壳骨架（一次创建，后续只改属性/文案，不重建节点） */
export function createFabDom(): FabDom {
  const wrap = document.createElement('div');
  wrap.className = 'dm-pf';
  wrap.dataset.open = 'false';
  wrap.dataset.side = 'right';
  wrap.dataset.v = 'up';
  wrap.dataset.tone = 'idle';
  wrap.dataset.view = 'actions';
  /*
   * 初始形态按桌面档（收成窄把手、未滑出）。
   * 触屏挂载时 `applyGeometry` 会把 `data-peek` 改成 false（无悬停可唤出，不启用把手），
   * 因此这里必须先把两个属性都写上，避免首帧因缺属性而画错形状。
   */
  wrap.dataset.peek = 'true';
  wrap.dataset.reveal = 'false';

  const menu = document.createElement('div');
  menu.className = 'dm-pf-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'DualMind 功能');

  // 头部：品牌标记 + 名称 + 关闭。给出归属感与一条明确可见的关闭路径
  const head = document.createElement('div');
  head.className = 'dm-pf-head';
  const headMark = document.createElement('span');
  headMark.className = 'dm-pf-head-mark';
  headMark.innerHTML = BRAND_MARK_HEAD_SVG;
  const headTitle = document.createElement('span');
  headTitle.className = 'dm-pf-head-title';
  headTitle.textContent = 'DualMind';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'dm-pf-close';
  close.setAttribute('aria-label', '关闭');
  close.title = '关闭';
  close.innerHTML = SHELL_ICONS.close;
  head.append(headMark, headTitle, close);

  // 动作列表：各 feature 注册的动作进这里（`data-empty` 也只据它判断），
  // 与壳自己内置的「隐藏」操作分开
  const actionsBox = document.createElement('div');
  actionsBox.className = 'dm-pf-menu-actions';

  // 隐藏二级视图：两行目标 + 一行返回
  const hideView = document.createElement('div');
  hideView.className = 'dm-pf-menu-hide';
  const hideNote = document.createElement('div');
  hideNote.className = 'dm-pf-menu-hide-note';
  hideNote.textContent = '隐藏后可在设置中重新开启';
  const hideHost = createShellRow('hideHost', '本站不再显示', SHELL_ICONS.hide);
  const hideAll = createShellRow('hideAll', '所有页不再显示', SHELL_ICONS.hide);
  const hideBack = createShellRow('hideBack', '返回', SHELL_ICONS.back);
  hideBack.classList.add('dm-pf-item-quiet');
  hideView.append(hideNote, hideHost, hideAll, hideBack);

  const footer = document.createElement('div');
  footer.className = 'dm-pf-menu-footer';
  const hideEntry = createShellRow(
    'hideEntry',
    '隐藏悬浮按钮',
    SHELL_ICONS.hide,
  );
  hideEntry.classList.add('dm-pf-item-quiet');
  footer.append(hideEntry);

  menu.append(head, actionsBox, footer, hideView);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'dm-pf-trigger';
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', 'DualMind：移入或点击展开功能');
  trigger.title = 'DualMind：移入或点击展开功能'; // 提示可 hover / 可点，而非只能盲点
  trigger.innerHTML = BRAND_MARK_SVG;
  /*
   * 静止把手里的抓手点（三个圆点，样式见 .dm-pf-grip）。
   * 与品牌标记**互斥显示**：把手态不画标记（十几像素放不下 40px 的标记），
   * 圆形态不画抓手（标记已占满）。两个节点常驻、靠 opacity 切换，避免重建节点。
   * aria-hidden：它是纯视觉符号，可访问名由按钮的 aria-label 提供。
   */
  const grip = document.createElement('span');
  grip.className = 'dm-pf-grip';
  grip.setAttribute('aria-hidden', 'true');
  grip.append(
    document.createElement('span'),
    document.createElement('span'),
    document.createElement('span'),
  );
  trigger.append(grip);

  const toast = document.createElement('div');
  toast.className = 'dm-pf-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  wrap.append(menu, trigger, toast);
  return {
    wrap,
    trigger,
    menu,
    close,
    actionsBox,
    hideEntry,
    hideView,
    hideHost,
    hideAll,
    hideBack,
    toast,
  };
}

/**
 * 建一个入口壳自己的行（隐藏 / 返回）。
 *
 * 与动作项分开：动作项带状态文案、会被 `renderActionItem` 持续刷新，
 * 而这些行是静态的，混进同一套结构会让人误以为它们也参与状态渲染。
 */
function createShellRow(
  name: string,
  label: string,
  iconSvg: string,
): HTMLButtonElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'dm-pf-item';
  row.dataset.shell = name;
  row.setAttribute('role', 'menuitem');

  const icon = document.createElement('span');
  icon.className = 'dm-pf-item-icon';
  icon.innerHTML = iconSvg;

  const text = document.createElement('span');
  text.className = 'dm-pf-item-text';
  const labelEl = document.createElement('span');
  labelEl.className = 'dm-pf-item-label';
  labelEl.textContent = label;
  text.append(labelEl);

  row.append(icon, text);
  return row;
}

/** 新建一个动作项节点（注册时创建一次） */
export function createActionItem(
  action: PageFabAction,
  onClick: () => void,
): HTMLButtonElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'dm-pf-item';
  item.dataset.action = action.id;
  item.setAttribute('role', 'menuitem');

  const icon = document.createElement('span');
  icon.className = 'dm-pf-item-icon';
  if (action.icon) icon.innerHTML = ICONS[action.icon];

  const text = document.createElement('span');
  text.className = 'dm-pf-item-text';
  const label = document.createElement('span');
  label.className = 'dm-pf-item-label';
  const status = document.createElement('span');
  status.className = 'dm-pf-item-status';
  text.append(label, status);

  item.append(icon, text);
  item.addEventListener('click', (event) => {
    // 阻止冒泡：否则会命中入口壳的点击（误触展开 / 收起）
    event.stopPropagation();
    onClick();
  });
  return item;
}

/** 按动作当前状态刷新一个动作项 */
export function renderActionItem(
  item: HTMLButtonElement,
  action: PageFabAction,
  view: PageFabActionView,
): void {
  const label = item.querySelector('.dm-pf-item-label');
  const status = item.querySelector('.dm-pf-item-status');
  if (label) label.textContent = view.label ?? action.label;
  if (status) status.textContent = view.status ?? '';
  item.dataset.tone = view.tone;
  const title = view.title ?? action.title;
  if (title) item.title = title;
  else item.removeAttribute('title');
}

/** 综合所有动作状态，决定主按钮的状态点颜色与是否点亮 */
export function renderTriggerTone(
  fab: FabDom,
  views: PageFabActionView[],
): void {
  let tone: PageFabTone = 'idle';
  let indicator = false;
  for (const view of views) {
    if (TONE_PRIORITY[view.tone] > TONE_PRIORITY[tone]) tone = view.tone;
    // 未显式指定时：非 idle 即点亮，保证「有动作在跑」用户一眼能看见
    const on = view.indicator ?? view.tone !== 'idle';
    if (on) indicator = true;
  }
  fab.wrap.dataset.tone = tone;
  fab.wrap.dataset.indicator = String(indicator);
}

/** 展开 / 收起动作面板；`vertical` 决定向下还是向上展开 */
export function setMenuOpen(
  fab: FabDom,
  open: boolean,
  vertical: 'up' | 'down',
): void {
  fab.wrap.dataset.open = String(open);
  fab.wrap.dataset.v = vertical;
  fab.trigger.setAttribute('aria-expanded', String(open));
}

/**
 * 切换面板视图（动作列表 / 隐藏确认）。
 *
 * 必须是可重置的：面板收起时若不回到 `actions`，
 * 下次移入展开会直接停在「本站 / 所有页不再显示」上 —— 用户以为自己点错了。
 */
export function setMenuView(fab: FabDom, view: FabMenuView): void {
  fab.wrap.dataset.view = view;
}

/**
 * 入口把自己隐藏掉（不销毁 DOM，`ui.remove()` 由调用方在提示结束后执行）。
 *
 * 保留 toast 可见是**功能的一部分**：用户点了「隐藏」若整个东西立刻消失，
 * 无法判断是隐藏成功还是点坏了；「所有页不再显示」之后页面上再无入口，
 * 提示里的恢复路径是唯一的线索。
 */
export function setFabHidden(fab: FabDom, hidden: boolean): void {
  fab.wrap.dataset.hidden = String(hidden);
}

/** 展示一次性提示（定时器由调用方管理） */
export function setToast(fab: FabDom, message: string): void {
  fab.toast.textContent = message;
  fab.toast.dataset.visible = message ? 'true' : 'false';
}
