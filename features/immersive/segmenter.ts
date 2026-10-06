/**
 * 正文采集：把页面 DOM 切成「可翻译片段」。
 *
 * 策略：自根节点向下遍历 ——
 * - 含块级子元素的容器 → 继续下钻（避免把整块结构当一个片段）
 * - 只含行内内容的叶子块 → 整体作为一个片段
 *
 * 除 DOM 访问外无副作用，便于单测（可注入极简的伪 DOM）。
 */
import type { ImmersiveSegment } from './types';

/** 采集结果：附带源元素引用，供渲染层在其后插入译文 */
export interface CollectedSegment extends ImmersiveSegment {
  el: Element;
}

/** 这些标签内部文本不翻译（代码 / 表单 / 媒体 / 交互控件） */
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEXTAREA',
  'INPUT',
  'SELECT',
  'OPTION',
  'OPTGROUP',
  'CODE',
  'PRE',
  'KBD',
  'SAMP',
  'VAR',
  'SVG',
  'CANVAS',
  'IFRAME',
  'VIDEO',
  'AUDIO',
  'BUTTON',
  'MATH',
  'TEMPLATE',
  'OBJECT',
  'EMBED',
  'MAP',
  'AREA',
]);

/** 块级标签：用于判断「下钻」还是「整体成段」 */
const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'CAPTION',
  'DD',
  'DETAILS',
  'DIALOG',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HGROUP',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'SECTION',
  'SUMMARY',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'UL',
]);

/** 单次采集上限：防御超大页面一次性产生过多片段 */
export const DEFAULT_SEGMENT_LIMIT = 500;

/**
 * 是否包含可翻译字符（CJK / 拉丁字母）。
 * 过滤纯数字、纯符号（如「123」「——」「·」），避免无意义请求。
 */
export function isTranslatableText(text: string): boolean {
  if (text.length < 2) return false;
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fffa-zA-Z]/.test(text);
}

/** 折叠空白，避免把排版缩进与换行送进模型 */
export function normalizeSegmentText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isSkipped(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName.toUpperCase())) return true;
  // 本扩展自己注入的节点（译文 / 样式 / 悬浮按钮）
  if (el.hasAttribute('data-dualmind')) return true;
  if (el.hasAttribute('data-dualmind-ignore')) return true;
  // 无障碍隐藏节点通常是辅助文案，不参与翻译
  if (el.getAttribute('aria-hidden') === 'true') return true;
  // 富文本编辑区不碰，避免破坏用户输入
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/** 元素是否可见：hidden / display:none / visibility:hidden（含祖先） */
export function isVisible(el: Element): boolean {
  const anyEl = el as Element & { checkVisibility?: (o?: unknown) => boolean };
  // 现代浏览器提供 checkVisibility，能一次性覆盖祖先的 CSS 隐藏
  if (typeof anyEl.checkVisibility === 'function') {
    try {
      return anyEl.checkVisibility({ checkVisibilityCSS: true });
    } catch {
      /* 参数不被支持时退回手动检测 */
    }
  }
  const win = el.ownerDocument?.defaultView ?? null;
  for (let node: Element | null = el; node; node = node.parentElement) {
    const htmlEl = node as HTMLElement;
    if (htmlEl.hidden) return false;
    if (
      htmlEl.style &&
      (htmlEl.style.display === 'none' || htmlEl.style.visibility === 'hidden')
    ) {
      return false;
    }
    if (win) {
      let computed: CSSStyleDeclaration | null = null;
      try {
        computed = win.getComputedStyle(node);
      } catch {
        computed = null;
      }
      if (
        computed &&
        (computed.display === 'none' || computed.visibility === 'hidden')
      ) {
        return false;
      }
    }
  }
  return true;
}

export interface CollectSegmentsOptions {
  /** id 前缀，增量采集时用于区分批次 */
  idPrefix?: string;
  /** 已采集元素集合，避免重复采集（增量场景传入同一份） */
  seen?: WeakSet<Element>;
  /** 单次采集上限 */
  limit?: number;
}

/** 模块级自增序号，保证同一页面内片段 id 不重复 */
let autoSeq = 0;

/**
 * 采集根节点下的可翻译片段。
 * 若 root 本身是块级元素（增量场景传入新增节点）则从其自身开始，
 * 否则遍历其子元素（典型：document.body）。
 */
export function collectSegments(
  root: ParentNode,
  options: CollectSegmentsOptions = {},
): CollectedSegment[] {
  const { idPrefix = 'dmseg', seen, limit = DEFAULT_SEGMENT_LIMIT } = options;
  const out: CollectedSegment[] = [];

  const visit = (el: Element): void => {
    if (out.length >= limit) return;
    if (isSkipped(el)) return;
    if (seen?.has(el)) return;
    if (!isVisible(el)) return;

    const blockChildren = Array.from(el.children).filter(
      (child) =>
        BLOCK_TAGS.has(child.tagName.toUpperCase()) && !isSkipped(child),
    );

    // 含块级子元素 → 下钻，让每个子块独立成段
    if (blockChildren.length > 0) {
      for (const child of Array.from(el.children)) visit(child);
      return;
    }

    const text = normalizeSegmentText(el.textContent ?? '');
    if (!isTranslatableText(text)) return;

    // 只有「真正产出片段」的元素才记入 seen。
    // 若在判定可译前就标记，一次空结果会把所有遍历过的叶子元素永久写入
    // 这个弱引用集合（元素仍在文档中就不会被回收），导致之后每次采集都直接
    // 跳过它们、恒返回 0 段，表现为「一直提示没有正文」的假死。
    seen?.add(el);

    autoSeq += 1;
    out.push({ id: `${idPrefix}-${autoSeq}`, text, el });
  };

  const rootEl =
    (root as Element).nodeType === 1 ? (root as Element) : null;
  if (rootEl && BLOCK_TAGS.has(rootEl.tagName.toUpperCase())) {
    visit(rootEl);
  } else {
    for (const child of Array.from(root.children ?? [])) visit(child);
  }
  return out;
}
