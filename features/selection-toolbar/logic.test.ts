import { describe, expect, it } from 'vitest';
import {
  TOOLBAR_BOTTOM_MARGIN,
  TOOLBAR_EDGE_PADDING,
  TOOLBAR_ESTIMATED_WIDTH,
  TOOLBAR_OFFSET_Y,
  computeToolbarPosition,
  shouldHideToolbar,
  shouldShowOnMouseUp,
  shouldShowOnShortcut,
} from './logic';

describe('computeToolbarPosition', () => {
  const viewport = { width: 1000, height: 800 };

  it('默认锚在选区左下角偏移处', () => {
    const pos = computeToolbarPosition({ left: 100, bottom: 200 }, viewport);
    expect(pos).toEqual({
      x: 100,
      y: 200 + TOOLBAR_OFFSET_Y,
    });
  });

  it('左缘过近时夹到最小 padding', () => {
    const pos = computeToolbarPosition({ left: -20, bottom: 100 }, viewport);
    expect(pos.x).toBe(TOOLBAR_EDGE_PADDING);
  });

  it('右缘过近时不超出预估宽度', () => {
    const pos = computeToolbarPosition({ left: 950, bottom: 100 }, viewport);
    expect(pos.x).toBe(viewport.width - TOOLBAR_ESTIMATED_WIDTH);
  });

  it('底缘过近时夹到视口底余量内', () => {
    const pos = computeToolbarPosition({ left: 50, bottom: 780 }, viewport);
    expect(pos.y).toBe(viewport.height - TOOLBAR_BOTTOM_MARGIN);
  });

  it('极窄视口时 x 仍不小于左 padding', () => {
    const narrow = { width: 100, height: 400 };
    const pos = computeToolbarPosition({ left: 80, bottom: 50 }, narrow);
    expect(pos.x).toBe(TOOLBAR_EDGE_PADDING);
  });
});

describe('shouldHideToolbar', () => {
  it('无选区且空闲无译文 → 收起', () => {
    expect(
      shouldHideToolbar({
        hasSelection: false,
        loading: false,
        hasTranslation: false,
      }),
    ).toBe(true);
  });

  it('仍有选区 → 不收起', () => {
    expect(
      shouldHideToolbar({
        hasSelection: true,
        loading: false,
        hasTranslation: false,
      }),
    ).toBe(false);
  });

  it('翻译中失选 → 不收起', () => {
    expect(
      shouldHideToolbar({
        hasSelection: false,
        loading: true,
        hasTranslation: false,
      }),
    ).toBe(false);
  });

  it('已有译文失选 → 不收起', () => {
    expect(
      shouldHideToolbar({
        hasSelection: false,
        loading: false,
        hasTranslation: true,
      }),
    ).toBe(false);
  });
});

describe('shouldShowOnMouseUp', () => {
  it('auto + 有选区 → 显示', () => {
    expect(
      shouldShowOnMouseUp({
        toolbarTrigger: 'auto',
        selectionText: 'hello',
      }),
    ).toBe(true);
  });

  it('shortcut + 有选区 → 不显示', () => {
    expect(
      shouldShowOnMouseUp({
        toolbarTrigger: 'shortcut',
        selectionText: 'hello',
      }),
    ).toBe(false);
  });

  it('空选区 / 纯空白 → 不显示', () => {
    expect(
      shouldShowOnMouseUp({
        toolbarTrigger: 'auto',
        selectionText: '',
      }),
    ).toBe(false);
    expect(
      shouldShowOnMouseUp({
        toolbarTrigger: 'auto',
        selectionText: '   ',
      }),
    ).toBe(false);
  });
});

describe('shouldShowOnShortcut', () => {
  it('有选区 → 可触发', () => {
    expect(shouldShowOnShortcut('text')).toBe(true);
  });

  it('无选区 → 不触发', () => {
    expect(shouldShowOnShortcut('')).toBe(false);
    expect(shouldShowOnShortcut('  ')).toBe(false);
  });
});
