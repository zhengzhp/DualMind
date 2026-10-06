/**
 * 沉浸译悬浮按钮（FAB）状态渲染的回归护栏。
 *
 * `renderFab` 是纯函数：给定 ImmersiveStatus 决定文案 / data-state / title。
 * 状态优先级（running > active > idle；error / untranslated 影响配色与提示）
 * 一旦写错，用户就会看到「翻译中」却点不动、或已失败却仍显示可点击。
 */
import { describe, expect, it } from 'vitest';
import { renderFab } from './dom';
import { IDLE_IMMERSIVE_STATUS, type ImmersiveStatus } from './types';

/** 只带 renderFab 真正访问的三个成员 */
function fakeButton() {
  return { dataset: {}, textContent: '', title: '' } as unknown as HTMLButtonElement;
}

function status(overrides: Partial<ImmersiveStatus> = {}): ImmersiveStatus {
  return { ...IDLE_IMMERSIVE_STATUS, ...overrides };
}

describe('renderFab', () => {
  it('空闲：提示可翻译整个网页', () => {
    const button = fakeButton();
    renderFab(button, status());

    expect(button.dataset.state).toBe('idle');
    expect(button.textContent).toBe('沉浸译');
    expect(button.title).toBe('翻译整个网页');
  });

  it('空闲且带错误：转 error 态并显示错误原因', () => {
    const button = fakeButton();
    renderFab(button, status({ error: '当前页面没有可翻译的正文内容' }));

    expect(button.dataset.state).toBe('error');
    expect(button.textContent).toBe('沉浸译');
    expect(button.title).toBe('当前页面没有可翻译的正文内容');
  });

  it('运行中：显示进度并提示可停止', () => {
    const button = fakeButton();
    renderFab(button, status({ running: true, done: 3, total: 12 }));

    expect(button.dataset.state).toBe('running');
    expect(button.textContent).toBe('翻译中 3/12');
    expect(button.title).toBe('点击停止并还原原文');
  });

  it('已翻译：显示「显示原文」', () => {
    const button = fakeButton();
    renderFab(button, status({ active: true, done: 5, total: 5 }));

    expect(button.dataset.state).toBe('active');
    expect(button.textContent).toBe('显示原文');
    expect(button.title).toBe('点击还原原文');
  });

  it('已翻译且有未翻译片段：转 warning 态并在 title 标注段数', () => {
    const button = fakeButton();
    renderFab(button, status({ active: true, untranslated: 2 }));

    expect(button.dataset.state).toBe('warning');
    expect(button.textContent).toBe('显示原文');
    expect(button.title).toBe('2 段未翻译 · 点击还原原文');
  });

  it('已翻译且仅有错误：转 error 态并显示错误原因', () => {
    const button = fakeButton();
    renderFab(button, status({ active: true, error: '网络异常' }));

    expect(button.dataset.state).toBe('error');
    expect(button.textContent).toBe('显示原文');
    expect(button.title).toBe('网络异常');
  });

  it('已翻译且同时有未翻译与错误：配色转 error，title 优先展示未翻译段数', () => {
    // 现状优先级：data-state 里 error 覆盖 warning，但 title 先看 untranslated。
    // 即错误原因不会出现在悬浮按钮上（侧栏控制区仍会展示），此处锁定该行为以防无声漂移。
    const button = fakeButton();
    renderFab(button, status({ active: true, untranslated: 3, error: '网络异常' }));

    expect(button.dataset.state).toBe('error');
    expect(button.title).toBe('3 段未翻译 · 点击还原原文');
  });

  it('状态切换时清理上一轮的 data-state，不残留', () => {
    const button = fakeButton();
    renderFab(button, status({ active: true, untranslated: 1 }));
    expect(button.dataset.state).toBe('warning');

    renderFab(button, status({ running: true, done: 1, total: 9 }));
    expect(button.dataset.state).toBe('running');
  });
});
