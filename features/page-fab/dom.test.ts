/**
 * 悬浮入口「形态与品牌图标」的护栏。
 *
 * 三条铁律（见 logo 规范：单一几何源 + 量测而非目测）：
 * 1. 内联在 `dom.ts` 的品牌标记必须与 `assets/logo.svg`（浅色版）的路径、渐变色值
 *    逐字一致 —— 否则仓库里会出现两份互相矛盾的图标源，改一份忘一份。
 *    唯一允许的差异是底板形状：圆角方块（资产）→ 圆（入口按钮是圆形）；
 * 2. 静止形态（贴边窄把手）必须是**独立形状**，不能靠「把圆形裁一刀」得到 ——
 *    裁出来的弧在贴边处宽度趋近 0，读起来像图标坏了，还要额外补一份字形平移量；
 * 3. 壳必须有**显式尺寸**，且按钮锚在壳的贴边侧：面板 / 提示的对齐基准就是这条边，
 *    展开方向（朝页面内侧）也由它决定。这两条错一条，面板就会贴错位置或长出屏幕。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BRAND_MARK_SVG,
  BRAND_VIEWBOX,
  applyGeometry,
  createFabStyles,
  setAttentionOpacity,
} from './dom';
import { IDLE_OPACITY } from './attention';
import { COARSE_GEOM, DEFAULT_GEOM } from './position';

/** 与 `position.ts` 的默认（鼠标）几何保持一致 */
const FAB_SIZE = DEFAULT_GEOM.size;
const PEEK_WIDTH = DEFAULT_GEOM.peekWidth;

/** 读仓库里的品牌资产（测试运行在仓库根目录） */
function readAsset(name: string): string {
  return fs.readFileSync(
    fileURLToPath(new URL(`../../assets/${name}`, import.meta.url)),
    'utf8',
  );
}

/** 取出所有 `d="..."`（路径几何） */
function pathData(svg: string): string[] {
  return [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1] ?? '');
}

/**
 * 从 path 的 `d` 里解析出所有坐标点。
 * 本项目的路径只用绝对命令（M / L / Q / C / Z），且每条命令的参数都是成对坐标，
 * 因此按顺序两两配对即可；控制点一并计入（更严格，宁可断言偏保守）。
 */
function points(d: string): Array<{ x: number; y: number }> {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.push({ x: nums[i] ?? 0, y: nums[i + 1] ?? 0 });
  }
  return out;
}

/**
 * 剥掉 CSS 注释。
 *
 * 「某个声明不存在」这类断言必须用它：注释里会成段解释被删掉的旧方案，
 * 直接对整段 CSS 断言会把历史说明也算成命中，变成假失败。
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 取出某条规则的声明块（先剥注释：注释里会出现成对花括号） */
function ruleBody(css: string, selector: string): string {
  const stripped = stripComments(css);
  const index = stripped.indexOf(selector);
  expect(index).toBeGreaterThanOrEqual(0);
  const open = stripped.indexOf('{', index);
  const close = stripped.indexOf('}', open);
  return stripped.slice(open + 1, close);
}

describe('品牌标记的单一几何源', () => {
  const light = readAsset('logo.svg');
  const blue = readAsset('logo-mark-blue.svg');

  it('内联副本的路径与浅色资产逐字一致', () => {
    const fromAsset = pathData(light);
    expect(fromAsset.length).toBeGreaterThan(0);
    for (const d of fromAsset) {
      expect(BRAND_MARK_SVG).toContain(d);
    }
  });

  it('内联副本的渐变色值与顺序一致（浅色极性）', () => {
    const stops = [...light.matchAll(/stop-color="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(stops).toEqual(['#eef8ff', '#d9eeff']);
    expect(BRAND_MARK_SVG).toContain(
      `<stop offset="0" stop-color="${stops[0]}"/>`,
    );
    expect(BRAND_MARK_SVG).toContain(
      `<stop offset="1" stop-color="${stops[1]}"/>`,
    );
    // 不得混入深色版本的底色（那是另一种极性，要求浅色按钮时不该出现）
    expect(BRAND_MARK_SVG).not.toContain('#1466ad');
  });

  it('字形用浅色极性的配色（深蓝主形 + 品牌蓝副形）', () => {
    expect(BRAND_MARK_SVG).toContain('fill="#0f2f4d"');
    expect(BRAND_MARK_SVG).toContain('fill="#1b7fd1"');
  });

  it('底板改为圆形且铺满 viewBox（不再靠 clip-path 裁形状）', () => {
    expect(light).toContain('<rect x="4" y="4" width="120" height="120" rx="28"');
    expect(BRAND_MARK_SVG).toContain(
      `viewBox="0 0 ${BRAND_VIEWBOX} ${BRAND_VIEWBOX}"`,
    );
    expect(BRAND_MARK_SVG).toContain(
      `<circle cx="64" cy="64" r="${BRAND_VIEWBOX / 2}"`,
    );
    expect(BRAND_MARK_SVG).not.toContain('<rect');
  });

  it('浅色与品牌色两版共用同一套字形几何（只有配色不同）', () => {
    expect(pathData(light)).toEqual(pathData(blue));
  });

  it('内联副本不含 width/height（否则无法按目标像素栅格化）', () => {
    expect(BRAND_MARK_SVG).not.toMatch(/<svg[^>]*\swidth=/);
    expect(BRAND_MARK_SVG).not.toMatch(/<svg[^>]*\sheight=/);
  });
});

describe('字形落在圆底内', () => {
  /** viewBox 用户单位 → 按钮像素 */
  const toLocal = (vb: number) => (vb * FAB_SIZE) / BRAND_VIEWBOX;
  const xs = pathData(BRAND_MARK_SVG).flatMap((d) =>
    points(d).map((p) => toLocal(p.x)),
  );

  it('x 方向包围盒落在圆底内（不触及圆形边缘）', () => {
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(FAB_SIZE);
  });

  it('不再需要「把被裁掉的字形挪回可见区」的平移补偿', () => {
    // 只在**声明**层面断言：注释里会提到这些被删掉的方案来解释历史
    const decls = stripComments(createFabStyles());
    // 静止形态是整块独立形状（不画字形），圆形态完整可见 —— 没有需要补偿的切片
    expect(decls).not.toContain('--dm-pf-glyph-dx');
    expect(decls).not.toContain('.dm-pf-glyph');
    expect(decls).not.toContain('clip-path');
    expect(decls).not.toContain('data-parked');
  });
});

describe('壳的尺寸与锚点（面板对齐的前提）', () => {
  const css = createFabStyles();

  it('壳有显式尺寸：宽 = 把手宽、高 = 按钮边长', () => {
    const body = ruleBody(css, '\n    .dm-pf {');
    expect(body).toContain('width: var(--dm-pf-peek)');
    expect(body).toContain('height: var(--dm-pf-size)');
  });

  it('样式表自带桌面默认几何（不依赖运行时注入也是对的）', () => {
    expect(css).toContain(`--dm-pf-size: ${FAB_SIZE}px`);
    expect(css).toContain(`--dm-pf-peek: ${PEEK_WIDTH}px`);
  });

  it('按钮锚在壳的贴边侧 —— 展开才是「朝页面内侧生长」，不会长出屏幕', () => {
    expect(css).toContain(
      '.dm-pf[data-side="right"] .dm-pf-trigger { right: 0; }',
    );
    expect(css).toContain(
      '.dm-pf[data-side="left"] .dm-pf-trigger { left: 0; }',
    );
  });

  it('删掉了「把面板推回视口内」的补偿量：壳已贴边，面板天然在屏内', () => {
    const decls = stripComments(css);
    expect(decls).not.toContain('--dm-pf-menu-dx');
    // 桥接伪元素是「移出即收起」时代的补丁，粘性面板不再需要
    expect(decls).not.toContain('.dm-pf-menu::after');
  });
});

describe('静止把手 ⇄ 展开圆形', () => {
  const css = createFabStyles();

  it('把手只在「启用把手 + 未滑出」时生效，且收窄到把手宽', () => {
    const body = ruleBody(
      css,
      '.dm-pf[data-peek="true"][data-reveal="false"] .dm-pf-trigger {',
    );
    expect(body).toContain('width: var(--dm-pf-peek)');
  });

  it('把手圆角只留在页面内侧（贴边侧是直角，才不会在视口边缘露出弧线）', () => {
    expect(css).toContain('border-radius: 8px 0 0 8px;');
    expect(css).toContain('border-radius: 0 8px 8px 0;');
  });

  it('把手态隐掉品牌标记，圆形态才显示（十几像素里塞 40px 的标记会糊成一团）', () => {
    expect(css).toContain(
      '.dm-pf[data-peek="true"][data-reveal="false"] .dm-pf-tile { opacity: 0; }',
    );
    // 默认（圆形态）必须可见，否则触屏档永远看不到标记
    expect(ruleBody(css, '\n    .dm-pf-tile {')).not.toContain('opacity: 0');
  });

  /**
   * 可辨识性回归（2026-10-07 实机反馈「贴合把手太不明显，用户注意不到」）：
   * 旧版是「8px 宽 + 近白浅蓝渐变 + 常态 0.42 不透明度」，三重降对比叠在一起，
   * 在白底页面上几乎与背景同色。这里锁住「把手自己带对比」的契约。
   */
  it('把手自带对比：品牌蓝实底 + 页面内侧实边，不靠页面底色衬托', () => {
    const body = ruleBody(
      css,
      '.dm-pf[data-peek="true"][data-reveal="false"] .dm-pf-trigger {',
    );
    // 底色必须是能盖住页面底色的品牌蓝实底，而不是近白渐变
    expect(body).toContain('background: rgba(27, 127, 209, 0.2)');
    expect(body).not.toContain('linear-gradient');
    // 内侧实边按贴边侧分左右：实边压在**朝页面那一侧**
    expect(css).toContain('inset 2px 0 0 rgba(27, 127, 209, 0.85)');
    expect(css).toContain('inset -2px 0 0 rgba(27, 127, 209, 0.85)');
  });

  it('把手内有抓手点，且只在把手态显示（滑出成圆形时让位给品牌标记）', () => {
    expect(css).toContain('.dm-pf-grip {');
    expect(css).toContain(
      '.dm-pf[data-peek="true"][data-reveal="false"] .dm-pf-grip { opacity: 1; }',
    );
    // 默认（含触屏档与圆形态）必须不显示
    expect(ruleBody(css, '\n    .dm-pf-grip {')).toContain('opacity: 0');
    // 纯视觉符号，不能抢按钮的命中区
    expect(ruleBody(css, '\n    .dm-pf-grip {')).toContain('pointer-events: none');
  });

  it('把手宽足够放下抓手点（8px 时代连点都塞不下，因此抬到 12px）', () => {
    expect(PEEK_WIDTH).toBeGreaterThanOrEqual(12);
    expect(PEEK_WIDTH).toBeLessThan(FAB_SIZE);
  });
});

describe('面板的成品感与可点性', () => {
  const css = createFabStyles();

  it('有品牌头部行与显式的关闭按钮', () => {
    expect(css).toContain('.dm-pf-head {');
    expect(css).toContain('.dm-pf-head-mark');
    expect(css).toContain('.dm-pf-close {');
  });

  it('动作行不低于 44px（Material 的触控目标下限）', () => {
    expect(ruleBody(css, '\n    .dm-pf-item {')).toContain('min-height: 44px');
  });

  it('动作项错峰入场，且序号由运行时写入', () => {
    expect(css).toContain('animation-delay: calc(var(--dm-pf-i, 0) * 20ms)');
    expect(css).toContain('@keyframes dm-pf-item-in');
  });

  it('尊重「减少动态效果」：动效退化但不影响功能', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*animation: none;/,
    );
  });
});

/**
 * 提示浮层的宽度契约。
 *
 * 回归背景：`.dm-pf` 是 fixed 且只有**把手那么宽**（8px），在流子元素为空；
 * 而 toast 是只有 `right` / `left` 的绝定位元素，可用宽度被限制在 8px 内。
 * 当时只给了 `max-width`，CJK 又可在任意两字之间断行，于是提示被压成**一字一行**。
 * 面板没塌是因为它另有 `min-width` 兜底 —— 这里锁住「toast 也必须显式定宽」。
 */
describe('提示浮层的宽度不能塌缩', () => {
  it('toast 必须有显式 width，不能只有 max-width', () => {
    const body = ruleBody(createFabStyles(), '\n    .dm-pf-toast {');
    expect(body).toContain('width: max-content');
    expect(body).toContain('max-width: 240px');
  });

  it('toast 用 border-box：否则 240px 上限会被内边距顶破', () => {
    const body = ruleBody(createFabStyles(), '\n    .dm-pf-toast {');
    expect(body).toContain('box-sizing: border-box');
  });

  it('允许长 hostname 硬断行（提示文案会内嵌站点名）', () => {
    const body = ruleBody(createFabStyles(), '\n    .dm-pf-toast {');
    expect(body).toContain('overflow-wrap: anywhere');
  });
});

/** 记录 setProperty / dataset 的最小替身（测试跑在 node 环境，没有 DOM） */
function createStyleStub(): {
  el: HTMLElement;
  read: (name: string) => string | undefined;
  dataset: Record<string, string>;
} {
  const props = new Map<string, string>();
  const dataset: Record<string, string> = {};
  const el = {
    style: {
      setProperty: (name: string, value: string) => {
        props.set(name, value);
      },
    },
    dataset,
  } as unknown as HTMLElement;
  return { el, read: (name: string) => props.get(name), dataset };
}

describe('applyGeometry', () => {
  it('鼠标几何：40px 按钮 + 12px 把手，启用把手形态', () => {
    const { el, read, dataset } = createStyleStub();
    applyGeometry(el, DEFAULT_GEOM);
    expect(read('--dm-pf-size')).toBe(`${DEFAULT_GEOM.size}px`);
    expect(read('--dm-pf-peek')).toBe(`${DEFAULT_GEOM.peekWidth}px`);
    expect(dataset.peek).toBe('true');
  });

  it('触屏几何：48px 且把手宽 = 按钮宽（无悬停可唤出，不启用把手）', () => {
    const { el, read, dataset } = createStyleStub();
    applyGeometry(el, COARSE_GEOM);
    expect(read('--dm-pf-size')).toBe('48px');
    expect(read('--dm-pf-peek')).toBe('48px');
    expect(dataset.peek).toBe('false');
  });
});

describe('setAttentionOpacity', () => {
  it('只写变量、不改其它样式（改 visibility 会让按钮收不到 pointerenter）', () => {
    const { el, read } = createStyleStub();
    setAttentionOpacity(el, IDLE_OPACITY);
    expect(read('--dm-pf-idle-opacity')).toBe(String(IDLE_OPACITY));
  });
});

describe('注意力分级的 CSS 接线', () => {
  const css = createFabStyles();

  it('默认不透明度为 1（变量没写进去时宁可全显，而不是看不见）', () => {
    expect(css).toContain('--dm-pf-idle-opacity: 1');
  });

  it('按钮不透明度由变量驱动', () => {
    expect(css).toContain('opacity: var(--dm-pf-idle-opacity)');
  });

  it('hover / 键盘聚焦时恢复 1，且特异性高于变量那条', () => {
    expect(css).toMatch(
      /\.dm-pf-trigger:hover,\s*\.dm-pf-trigger:focus-visible,\s*\.dm-pf:focus-within \.dm-pf-trigger \{\s*opacity: 1;/,
    );
  });
});
