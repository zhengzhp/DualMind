/**
 * 双语渲染层（Content 侧）。
 *
 * 原则：只**追加兄弟节点**展示译文，不改写原文内容，保证可完整撤销。
 * 「仅译文」模式通过给源元素打标记 + `<html>` 上一个类名来隐藏原文，
 * 撤销时移除标记即可还原（表格单元格等无法安全隐藏的标签保持双语）。
 */
import type { ImmersiveDisplayMode } from '@/shared/storage/types';
import type { ImmersiveSegmentResult } from './types';

const STYLE_ID = 'dualmind-immersive-style';
const BLOCK_CLASS = 'dm-immersive-block';
const UNTRANSLATED_ATTR = 'data-dualmind-untranslated';
const BADGE_CLASS = 'dm-immersive-badge';
const SOURCE_ATTR = 'data-dualmind-source';
const ROOT_CLASS = 'dm-immersive-translation-only';

/** 这些标签直接在其后插入块级节点会破坏表格结构，改为插入到元素内部 */
const INSIDE_TAGS = new Set(['TD', 'TH']);
/** 这些标签的原文无法在不隐藏译文的前提下隐藏，保持双语 */
const NO_HIDE_TAGS = new Set(['TD', 'TH']);

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.setAttribute('data-dualmind', 'immersive-style');
  style.textContent = `
    /* 译文靠排版而非色块区分：上间距 + 略小字号 + 次要文字色，不加左色边 */
    .${BLOCK_CLASS} {
      display: block;
      margin: 10px 0 14px;
      padding: 0;
      border: 0;
      background: transparent;
      color: #6e6e73;
      font-size: 0.94em;
      line-height: 1.65;
      white-space: pre-wrap;
    }
    .${ROOT_CLASS} [${SOURCE_ATTR}] { display: none !important; }
    .${BLOCK_CLASS}[${UNTRANSLATED_ATTR}] {
      color: #b25000;
    }
    .${BADGE_CLASS} {
      display: inline-block;
      margin-right: 6px;
      padding: 0 6px;
      border-radius: 4px;
      background: #fff8ec;
      color: #b25000;
      box-shadow: inset 0 0 0 1px rgba(178, 80, 0, 0.25);
      font-size: 0.72em;
      line-height: 1.6;
      vertical-align: 1px;
    }
    /* 扩展手动主题优先；未写入 data-dm-theme 时跟随系统 */
    @media (prefers-color-scheme: dark) {
      html:not([data-dm-theme='light']) .${BLOCK_CLASS} { color: #a6adb8; }
      html:not([data-dm-theme='light']) .${BLOCK_CLASS}[${UNTRANSLATED_ATTR}] { color: #f0b25b; }
      html:not([data-dm-theme='light']) .${BADGE_CLASS} {
        background: #2b2114;
        color: #f0b25b;
        box-shadow: inset 0 0 0 1px rgba(240, 178, 91, 0.3);
      }
    }
    html[data-dm-theme='dark'] .${BLOCK_CLASS} { color: #a6adb8; }
    html[data-dm-theme='dark'] .${BLOCK_CLASS}[${UNTRANSLATED_ATTR}] { color: #f0b25b; }
    html[data-dm-theme='dark'] .${BADGE_CLASS} {
      background: #2b2114;
      color: #f0b25b;
      box-shadow: inset 0 0 0 1px rgba(240, 178, 91, 0.3);
    }
  `;
  document.head?.appendChild(style);
}

/** 节点最终展示的文本内容（用于幂等更新比较） */
function renderedText(result: ImmersiveSegmentResult): string {
  return result.untranslated ? `未翻译${result.text}` : result.text;
}

export class ImmersiveRenderer {
  /** 源元素 → 注入的译文节点 */
  private readonly nodes = new Map<Element, HTMLElement>();

  constructor(private mode: ImmersiveDisplayMode) {
    ensureStyle();
    this.applyModeClass();
  }

  setMode(mode: ImmersiveDisplayMode): void {
    this.mode = mode;
    this.applyModeClass();
  }

  private applyModeClass(): void {
    document.documentElement?.classList.toggle(
      ROOT_CLASS,
      this.mode === 'translation-only',
    );
  }

  /** 已渲染的译文数量（用于进度展示） */
  size(): number {
    return this.nodes.size;
  }

  /** 判定为「未翻译」的片段数（回显 / 单段失败），供 UI 明示 */
  untranslatedCount(): number {
    let count = 0;
    for (const node of this.nodes.values()) {
      if (node.hasAttribute(UNTRANSLATED_ATTR)) count += 1;
    }
    return count;
  }

  /** 应用一批译文；同一源元素重复返回时只更新文本，不重复插入 */
  apply(
    results: ImmersiveSegmentResult[],
    segments: Map<string, { el: Element }>,
  ): void {
    for (const result of results) {
      const segment = segments.get(result.id);
      if (!segment) continue;
      const source = segment.el;

      const existing = this.nodes.get(source);
      if (existing) {
        // 文本或「未翻译」态变化时才更新，避免无谓重排
        if (existing.textContent !== renderedText(result)) {
          this.fillNode(existing, result);
        }
        continue;
      }

      const node = document.createElement('div');
      node.className = BLOCK_CLASS;
      node.setAttribute('data-dualmind', 'immersive');
      node.setAttribute('data-dualmind-for', result.id);
      this.fillNode(node, result);

      const tag = source.tagName.toUpperCase();
      if (INSIDE_TAGS.has(tag)) {
        source.appendChild(node);
      } else {
        source.insertAdjacentElement('afterend', node);
      }
      if (!NO_HIDE_TAGS.has(tag)) {
        source.setAttribute(SOURCE_ATTR, '1');
      }
      this.nodes.set(source, node);
    }
  }

  /** 填入译文内容；未翻译片段加角标并保留原文，避免回显伪装成成功 */
  private fillNode(node: HTMLElement, result: ImmersiveSegmentResult): void {
    if (result.untranslated) {
      node.setAttribute(UNTRANSLATED_ATTR, '1');
      const badge = document.createElement('span');
      badge.className = BADGE_CLASS;
      badge.textContent = '未翻译';
      node.replaceChildren(badge, document.createTextNode(result.text));
      return;
    }
    node.removeAttribute(UNTRANSLATED_ATTR);
    node.textContent = result.text;
  }

  /** 清理已从文档移除的源元素遗留的孤儿译文（框架回收节点时） */
  purgeDisconnected(): void {
    for (const [source, node] of Array.from(this.nodes)) {
      if (!source.isConnected) {
        node.remove();
        this.nodes.delete(source);
      }
    }
  }

  /** 撤销：移除全部注入节点并恢复原文显示 */
  clear(): void {
    for (const [source, node] of this.nodes) {
      node.remove();
      source.removeAttribute(SOURCE_ATTR);
    }
    this.nodes.clear();
    document.documentElement?.classList.remove(ROOT_CLASS);
  }
}
