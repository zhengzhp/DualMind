import { describe, expect, it } from 'vitest';
import {
  shouldDismissOnSelectionChange,
  shouldShowOnMouseUp,
  shouldShowOnShortcut,
} from './logic';

describe('shouldDismissOnSelectionChange', () => {
  it('无选区且空闲 → 收起', () => {
    expect(
      shouldDismissOnSelectionChange({ hasSelection: false, loading: false }),
    ).toBe(true);
  });

  it('仍有选区 → 不收起', () => {
    expect(
      shouldDismissOnSelectionChange({ hasSelection: true, loading: false }),
    ).toBe(false);
  });

  it('翻译中失选 → 不打断', () => {
    expect(
      shouldDismissOnSelectionChange({ hasSelection: false, loading: true }),
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
