/**
 * 双语渲染层（ImmersiveRenderer）的回归护栏。
 *
 * 为什么用伪 DOM：渲染层只访问一小撮 DOM 能力（创建 / 插入兄弟节点、打源标记、
 * 切 `<html>` 类名、清理孤儿节点），沿用 segmenter.test.ts 的做法自建极简 DOM，
 * 就无需为此引入 jsdom / happy-dom。
 *
 * 覆盖重点：
 * - 「仅译文」靠 `<html>` 类名 + 源标记隐藏原文，撤销即还原；
 * - 表格单元格改插入内部、且不打隐藏标记（保持双语）；
 * - 未翻译片段加角标与属性，避免回显伪装成成功；
 * - 幂等更新 / 孤儿清理 / 全量撤销。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImmersiveRenderer } from './renderer';
import type { ImmersiveSegmentResult } from './types';

const SOURCE_ATTR = 'data-dualmind-source';
const ROOT_CLASS = 'dm-immersive-translation-only';
const BLOCK_CLASS = 'dm-immersive-block';

/** 极简 classList：只实现 toggle / remove / contains 与拼接输出 */
class FakeClassList {
  private readonly set = new Set<string>();

  toggle(name: string, force?: boolean): boolean {
    const wanted = force ?? !this.set.has(name);
    if (wanted) this.set.add(name);
    else this.set.delete(name);
    return wanted;
  }

  remove(name: string): void {
    this.set.delete(name);
  }

  contains(name: string): boolean {
    return this.set.has(name);
  }

  toString(): string {
    return [...this.set].join(' ');
  }
}

/** 极简 DOM 节点：只实现渲染层真正访问到的成员 */
class FakeNode {
  readonly classList = new FakeClassList();
  readonly attrs = new Map<string, string>();
  id = '';
  className = '';
  parentElement: FakeNode | null = null;
  children: FakeNode[] = [];
  isConnected = true;
  private ownText = '';

  constructor(public readonly tagName: string) {}

  get textContent(): string {
    return this.ownText + this.children.map((child) => child.textContent).join('');
  }

  set textContent(value: string) {
    this.ownText = value;
    this.children = [];
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }

  appendChild(child: FakeNode): FakeNode {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...nodes: FakeNode[]): void {
    for (const node of nodes) node.parentElement = this;
    this.children = nodes;
    this.ownText = '';
  }

  remove(): void {
    const parent = this.parentElement;
    if (parent) {
      const index = parent.children.indexOf(this);
      if (index >= 0) parent.children.splice(index, 1);
    }
    this.parentElement = null;
    this.isConnected = false;
  }

  /** 渲染层只用 'afterend'：把节点插到本节点之后 */
  insertAdjacentElement(position: string, node: FakeNode): FakeNode {
    const parent = this.parentElement;
    if (!parent) throw new Error('insertAdjacentElement 需要父节点');
    const index = parent.children.indexOf(this);
    const at = position === 'afterend' ? index + 1 : index;
    node.parentElement = parent;
    parent.children.splice(at, 0, node);
    return node;
  }
}

interface FakeDom {
  documentElement: FakeNode;
  head: FakeNode;
}

/** 装上渲染层所需的最小 document 面，并允许外部取回 html / head */
function installFakeDom(): FakeDom {
  const documentElement = new FakeNode('html');
  const head = new FakeNode('head');

  // 记住首个注入的 <style>，让 getElementById 能命中，验证「样式只注入一次」
  let styleNode: FakeNode | null = null;
  const appendToHead = head.appendChild.bind(head);
  head.appendChild = (child: FakeNode): FakeNode => {
    if (child.id) styleNode = child;
    return appendToHead(child);
  };

  const fakeDocument = {
    documentElement,
    head,
    createElement: (tag: string) => new FakeNode(tag),
    createTextNode: (text: string) => {
      const node = new FakeNode('#text');
      node.textContent = text;
      return node;
    },
    getElementById: (id: string) =>
      styleNode && styleNode.id === id ? styleNode : null,
  };

  (globalThis as unknown as Record<string, unknown>).document = fakeDocument;
  return { documentElement, head };
}

/** 造一个「源元素 + 父容器」并返回可直接喂给 renderer.apply 的 segments */
function makeTarget(tag = 'p') {
  const parent = new FakeNode('div');
  const source = new FakeNode(tag);
  parent.appendChild(source);
  const segments = new Map<string, { el: Element }>([
    ['s1', { el: source as unknown as Element }],
  ]);
  return { parent, source, segments };
}

function result(text: string, untranslated = false): ImmersiveSegmentResult {
  return { id: 's1', text, untranslated };
}

let dom: FakeDom;

beforeEach(() => {
  dom = installFakeDom();
});

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).document;
});

describe('ImmersiveRenderer · 双语渲染', () => {
  it('译文作为源元素的兄弟节点追加，并给源元素打隐藏标记', () => {
    const { parent, source, segments } = makeTarget();
    const renderer = new ImmersiveRenderer('bilingual');

    renderer.apply([result('译:Hello')], segments);

    expect(parent.children).toHaveLength(2);
    expect(parent.children[0]).toBe(source);

    const block = parent.children[1]!;
    expect(block.className).toBe(BLOCK_CLASS);
    expect(block.textContent).toBe('译:Hello');
    expect(block.hasAttribute('data-dualmind-for')).toBe(true);
    expect(source.hasAttribute(SOURCE_ATTR)).toBe(true);
    expect(renderer.size()).toBe(1);
  });

  it('同一元素重复返回相同译文时只更新，不重复插入', () => {
    const { parent, segments } = makeTarget();
    const renderer = new ImmersiveRenderer('bilingual');

    renderer.apply([result('译:A')], segments);
    renderer.apply([result('译:A')], segments);
    expect(parent.children).toHaveLength(2);

    // 文本变化时才改写译文节点
    renderer.apply([result('译:B')], segments);
    expect(parent.children).toHaveLength(2);
    expect(parent.children[1]!.textContent).toBe('译:B');
  });

  it('表格单元格：译文插入单元格内部，且不打隐藏标记（保持双语）', () => {
    const { source, segments } = makeTarget('td');
    const renderer = new ImmersiveRenderer('bilingual');

    renderer.apply([result('译:Cell')], segments);

    expect(source.children).toHaveLength(1);
    expect(source.children[0]!.textContent).toBe('译:Cell');
    expect(source.hasAttribute(SOURCE_ATTR)).toBe(false);
  });
});

describe('ImmersiveRenderer · 展示模式', () => {
  it('「仅译文」给 <html> 加类名，切回双语即移除', () => {
    const renderer = new ImmersiveRenderer('bilingual');
    expect(dom.documentElement.classList.contains(ROOT_CLASS)).toBe(false);

    renderer.setMode('translation-only');
    expect(dom.documentElement.classList.contains(ROOT_CLASS)).toBe(true);

    renderer.setMode('bilingual');
    expect(dom.documentElement.classList.contains(ROOT_CLASS)).toBe(false);
  });

  it('构造多个渲染器时样式只注入一次', () => {
    new ImmersiveRenderer('bilingual');
    new ImmersiveRenderer('bilingual');
    expect(dom.head.children).toHaveLength(1);
  });
});

describe('ImmersiveRenderer · 未翻译片段', () => {
  it('加角标与属性，原文保留且计入未翻译数量', () => {
    const { parent, segments } = makeTarget();
    const renderer = new ImmersiveRenderer('bilingual');

    renderer.apply([result('Hello', true)], segments);

    const block = parent.children[1]!;
    expect(block.hasAttribute('data-dualmind-untranslated')).toBe(true);
    expect(block.textContent).toBe('未翻译Hello');
    expect(renderer.untranslatedCount()).toBe(1);
  });

  it('未翻译 → 已翻译：移除角标与属性', () => {
    const { parent, segments } = makeTarget();
    const renderer = new ImmersiveRenderer('bilingual');

    renderer.apply([result('Hello', true)], segments);
    renderer.apply([result('译:Hello')], segments);

    const block = parent.children[1]!;
    expect(block.hasAttribute('data-dualmind-untranslated')).toBe(false);
    expect(block.textContent).toBe('译:Hello');
    expect(renderer.untranslatedCount()).toBe(0);
  });
});

describe('ImmersiveRenderer · 清理与撤销', () => {
  it('purgeDisconnected 清理被回收源元素的孤儿译文', () => {
    const { parent, source, segments } = makeTarget();
    const renderer = new ImmersiveRenderer('bilingual');
    renderer.apply([result('译:Hello')], segments);
    expect(renderer.size()).toBe(1);

    // 模拟框架回收源元素
    source.isConnected = false;
    renderer.purgeDisconnected();

    expect(parent.children).toHaveLength(1);
    expect(renderer.size()).toBe(0);
  });

  it('clear 移除全部译文、源标记与 html 类名，还原页面', () => {
    const { parent, source, segments } = makeTarget();
    const renderer = new ImmersiveRenderer('translation-only');
    renderer.apply([result('译:Hello')], segments);

    renderer.clear();

    expect(parent.children).toHaveLength(1);
    expect(parent.children[0]).toBe(source);
    expect(source.hasAttribute(SOURCE_ATTR)).toBe(false);
    expect(dom.documentElement.classList.contains(ROOT_CLASS)).toBe(false);
    expect(renderer.size()).toBe(0);
  });
});
