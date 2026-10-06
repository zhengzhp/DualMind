import { describe, expect, it } from 'vitest';
import {
  collectSegments,
  isTranslatableText,
  normalizeSegmentText,
  type CollectedSegment,
} from './segmenter';

/**
 * 极简伪 DOM：只实现 collectSegments / isVisible 实际访问的成员，
 * 从而在不引入 jsdom / happy-dom 依赖的前提下测试遍历与跳过规则。
 */
class FakeElement {
  nodeType = 1;
  tagName: string;
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  hidden = false;
  isContentEditable = false;
  style = { display: '', visibility: '' };
  ownText = '';
  readonly attrs = new Map<string, string>();
  /** 置空以避免走 getComputedStyle 分支 */
  readonly ownerDocument = { defaultView: null as unknown };

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  get textContent(): string {
    return (
      this.ownText + this.children.map((child) => child.textContent).join('')
    );
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
}

interface ElOptions {
  text?: string;
  children?: FakeElement[];
  hidden?: boolean;
  display?: string;
  visibility?: string;
  attrs?: Record<string, string>;
  editable?: boolean;
}

function el(tag: string, options: ElOptions = {}): FakeElement {
  const node = new FakeElement(tag);
  node.ownText = options.text ?? '';
  node.hidden = options.hidden ?? false;
  node.style.display = options.display ?? '';
  node.style.visibility = options.visibility ?? '';
  node.isContentEditable = options.editable ?? false;
  for (const [key, value] of Object.entries(options.attrs ?? {})) {
    node.attrs.set(key, value);
  }
  for (const child of options.children ?? []) {
    child.parentElement = node;
    node.children.push(child);
  }
  return node;
}

/** 以伪 body 为根采集，返回各片段文本 */
function texts(root: FakeElement): string[] {
  const segments: CollectedSegment[] = collectSegments(
    root as unknown as ParentNode,
  );
  return segments.map((segment) => segment.text);
}

describe('isTranslatableText', () => {
  it('含中英文字母 → 可翻译', () => {
    expect(isTranslatableText('hello')).toBe(true);
    expect(isTranslatableText('你好')).toBe(true);
  });

  it('纯数字 / 纯符号 / 过短 → 不翻译', () => {
    expect(isTranslatableText('12345')).toBe(false);
    expect(isTranslatableText('—— ·')).toBe(false);
    expect(isTranslatableText('a')).toBe(false);
  });
});

describe('normalizeSegmentText', () => {
  it('折叠连续空白并去首尾空白', () => {
    expect(normalizeSegmentText('  Hello\n\t world  ')).toBe('Hello world');
  });
});

describe('collectSegments', () => {
  it('标题与段落各自成段', () => {
    const body = el('body', {
      children: [
        el('h1', { text: 'Hello world' }),
        el('p', { text: 'This is a paragraph.' }),
      ],
    });
    expect(texts(body)).toEqual(['Hello world', 'This is a paragraph.']);
  });

  it('行内标签与直接文本聚合为一个片段', () => {
    const body = el('body', {
      children: [
        el('p', {
          text: 'Hello ',
          children: [el('strong', { text: 'world' })],
        }),
      ],
    });
    expect(texts(body)).toEqual(['Hello world']);
  });

  it('容器含块级子元素时下钻，而不是整块成段', () => {
    const body = el('body', {
      children: [
        el('div', {
          children: [el('p', { text: 'Alpha' }), el('p', { text: 'Beta' })],
        }),
      ],
    });
    expect(texts(body)).toEqual(['Alpha', 'Beta']);
  });

  it('列表项逐项成段', () => {
    const body = el('body', {
      children: [
        el('ul', {
          children: [el('li', { text: 'One' }), el('li', { text: 'Two' })],
        }),
      ],
    });
    expect(texts(body)).toEqual(['One', 'Two']);
  });

  it('代码块与表单控件不参与翻译', () => {
    const body = el('body', {
      children: [
        el('p', { text: 'Keep me' }),
        el('pre', { children: [el('code', { text: 'const a = 1' })] }),
        el('textarea', { text: 'user input' }),
        el('button', { text: 'Submit' }),
      ],
    });
    expect(texts(body)).toEqual(['Keep me']);
  });

  it('自身或祖先不可见的元素被跳过', () => {
    const body = el('body', {
      children: [
        el('p', { text: 'Visible text' }),
        el('p', { text: 'Hidden self', display: 'none' }),
        el('div', {
          display: 'none',
          children: [el('p', { text: 'Hidden ancestor' })],
        }),
        el('p', { text: 'Hidden attr', hidden: true }),
      ],
    });
    expect(texts(body)).toEqual(['Visible text']);
  });

  it('已注入节点、aria-hidden、contenteditable 被跳过', () => {
    const body = el('body', {
      children: [
        el('p', { text: 'Translatable' }),
        el('div', { text: 'Injected', attrs: { 'data-dualmind': 'immersive' } }),
        el('span', { text: 'Aria hidden', attrs: { 'aria-hidden': 'true' } }),
        el('div', { text: 'Editable text', editable: true }),
      ],
    });
    expect(texts(body)).toEqual(['Translatable']);
  });

  it('纯数字 / 符号文本被过滤', () => {
    const body = el('body', {
      children: [
        el('span', { text: '2026' }),
        el('span', { text: '—— ··' }),
        el('span', { text: 'Real words' }),
      ],
    });
    expect(texts(body)).toEqual(['Real words']);
  });

  it('单次采集受 limit 限制', () => {
    const body = el('body', {
      children: [
        el('p', { text: 'One' }),
        el('p', { text: 'Two' }),
        el('p', { text: 'Three' }),
      ],
    });
    const segments = collectSegments(body as unknown as ParentNode, {
      limit: 2,
    });
    expect(segments.map((segment) => segment.text)).toEqual(['One', 'Two']);
  });

  it('seen 集合避免重复采集同一元素', () => {
    const body = el('body', {
      children: [el('p', { text: 'Only once' })],
    });
    const seen = new WeakSet<Element>();
    const first = collectSegments(body as unknown as ParentNode, { seen });
    const second = collectSegments(body as unknown as ParentNode, { seen });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('root 本身是块级元素时从其自身开始（增量采集场景）', () => {
    const paragraph = el('p', { text: 'Added later' });
    const segments = collectSegments(paragraph as unknown as ParentNode);
    expect(segments.map((segment) => segment.text)).toEqual(['Added later']);
  });

  it('生成的片段 id 唯一', () => {
    const body = el('body', {
      children: [el('p', { text: 'One' }), el('p', { text: 'Two' })],
    });
    const segments = collectSegments(body as unknown as ParentNode);
    expect(new Set(segments.map((segment) => segment.id)).size).toBe(2);
  });
});
