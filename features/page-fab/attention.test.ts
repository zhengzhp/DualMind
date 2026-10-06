/**
 * 注意力分级的回归护栏。
 *
 * 重点保护「该显眼时必须显眼」：把优先级写反（例如滚动盖过错误反馈）在页面上
 * 表现为「出错了但滚一下就看不见」，属于用户能感知但很难复现的失败。
 */
import { describe, expect, it } from 'vitest';
import {
  FULL_OPACITY,
  IDLE_OPACITY,
  SCROLL_OPACITY,
  resolveOpacity,
  resolveRevealed,
} from './attention';

const base = { open: false, scrolling: false, indicator: false };
const still = { open: false, hover: false, dragging: false, indicator: false };

describe('resolveOpacity', () => {
  it('常态：存在但不抢注意力', () => {
    expect(resolveOpacity(base)).toBe(IDLE_OPACITY);
  });

  it('常态低于滚动，滚动才是最低一档', () => {
    expect(IDLE_OPACITY).toBeLessThan(FULL_OPACITY);
    expect(SCROLL_OPACITY).toBeLessThan(IDLE_OPACITY);
  });

  it('常态要够高：把手只有 12px 宽，数值再压下去就「注意不到」了', () => {
    /*
     * 0.42 是旧值（实机反馈偏淡）。浅色填充再乘一层不透明度会直接化进白底，
     * 因此常态值下限锁在 0.8，让位交给滚动档表达（0.15）。
     */
    expect(IDLE_OPACITY).toBeGreaterThanOrEqual(0.8);
  });

  it('滚动中让位正文', () => {
    expect(resolveOpacity({ ...base, scrolling: true })).toBe(SCROLL_OPACITY);
  });

  it('已展开必须完整可见（正在读菜单时淡出就是 bug）', () => {
    expect(resolveOpacity({ ...base, open: true })).toBe(FULL_OPACITY);
    // 即使同时在滚动，展开也优先
    expect(resolveOpacity({ ...base, open: true, scrolling: true })).toBe(
      FULL_OPACITY,
    );
  });

  it('有状态必须完整可见', () => {
    expect(resolveOpacity({ ...base, indicator: true })).toBe(FULL_OPACITY);
  });

  it('滚动不得盖过状态反馈（滚一下就把错误藏起来会很坑）', () => {
    expect(
      resolveOpacity({ ...base, indicator: true, scrolling: true }),
    ).toBe(FULL_OPACITY);
  });
});

/**
 * 「窄把手 ⇄ 完整圆形」的判定。
 *
 * 静止时是 12px 的贴边把手，只有四种情况才长成完整圆形。判错的表现分别是：
 * 悬停不长出来 → 用户看不出它能点；展开时不长出来 → 面板挂在把手上错位；
 * 拖拽中缩回去 → 像「抓空了」；有状态时不长出来 → 出错了只有把鼠标移上去才看得见。
 */
describe('resolveRevealed', () => {
  it('完全静止：收成窄把手（最不占正文）', () => {
    expect(resolveRevealed(still)).toBe(false);
  });

  it('指针移入 → 滑出（否则用户面对一个 12px 把手，不知道它能点）', () => {
    expect(resolveRevealed({ ...still, hover: true })).toBe(true);
  });

  it('面板展开 → 滑出（面板与提示都挂在按钮上，把手宽度撑不起它们）', () => {
    expect(resolveRevealed({ ...still, open: true })).toBe(true);
  });

  it('拖拽中 → 滑出（手里抓的是完整按钮，中途缩回去像抓空了）', () => {
    expect(resolveRevealed({ ...still, dragging: true })).toBe(true);
  });

  it('有状态 → 滑出（否则「出错了」只有把鼠标移上去才看得见）', () => {
    expect(resolveRevealed({ ...still, indicator: true })).toBe(true);
  });
});
