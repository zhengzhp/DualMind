/**
 * 沉浸译在共享悬浮入口上的状态映射回归护栏。
 *
 * `toImmersiveFabView` 是纯函数：给定 ImmersiveStatus 决定 动作项文案 / 状态色 / 提示。
 * 状态优先级（running > active > idle；error / untranslated 影响配色与提示）
 * 一旦写错，用户会看到「翻译中」却点不动、或已失败却仍显示可点击。
 */
import { describe, expect, it } from 'vitest';
import { IMMERSIVE_ACTION_LABEL, toImmersiveFabView } from './fab';
import { IDLE_IMMERSIVE_STATUS, type ImmersiveStatus } from './types';

function status(overrides: Partial<ImmersiveStatus> = {}): ImmersiveStatus {
  return { ...IDLE_IMMERSIVE_STATUS, ...overrides };
}

describe('toImmersiveFabView', () => {
  it('空闲：可翻译整个网页，标题即动作文案', () => {
    const view = toImmersiveFabView(status());

    expect(view.tone).toBe('idle');
    expect(view.label).toBeUndefined(); // 未指定 → 入口壳用动作定义里的「沉浸译」
    expect(IMMERSIVE_ACTION_LABEL).toBe('沉浸译');
    expect(view.status).toBeUndefined();
    expect(view.title).toBe('翻译整个网页');
  });

  it('空闲且带错误：转 error 态并显示错误原因', () => {
    const view = toImmersiveFabView(
      status({ error: '当前页面没有可翻译的正文内容' }),
    );

    expect(view.tone).toBe('error');
    expect(view.label).toBeUndefined();
    expect(view.title).toBe('当前页面没有可翻译的正文内容');
  });

  it('运行中：显示进度并提示可停止（点亮状态点）', () => {
    const view = toImmersiveFabView(status({ running: true, done: 3, total: 12 }));

    expect(view.tone).toBe('busy');
    expect(view.status).toBe('翻译中 3/12');
    expect(view.title).toBe('点击停止并还原原文');
    expect(view.indicator).toBe(true);
  });

  it('已翻译：标签翻转为「显示原文」，提示可还原', () => {
    const view = toImmersiveFabView(status({ active: true, done: 5, total: 5 }));

    expect(view.tone).toBe('active');
    expect(view.label).toBe('显示原文');
    expect(view.status).toBe('已翻译');
    expect(view.title).toBe('点击还原原文');
  });

  it('已翻译且有未翻译片段：转 warning 态并标注段数', () => {
    const view = toImmersiveFabView(status({ active: true, untranslated: 2 }));

    expect(view.tone).toBe('warning');
    expect(view.label).toBe('显示原文');
    expect(view.status).toBe('2 段未翻译');
    expect(view.title).toBe('2 段未翻译 · 点击还原原文');
  });

  it('已翻译且仅有错误：转 error 态并显示错误原因', () => {
    const view = toImmersiveFabView(
      status({ active: true, error: '网络异常' }),
    );

    expect(view.tone).toBe('error');
    expect(view.label).toBe('显示原文');
    expect(view.title).toBe('网络异常');
  });

  it('已翻译且同时有未翻译与错误：配色转 error，提示优先展示未翻译段数', () => {
    // 现状优先级：tone 里 error 覆盖 warning，但 title 先看 untranslated。
    // 即错误原因不会出现在悬浮入口上（侧栏控制区仍会展示），此处锁定该行为以防无声漂移。
    const view = toImmersiveFabView(
      status({ active: true, untranslated: 3, error: '网络异常' }),
    );

    expect(view.tone).toBe('error');
    expect(view.title).toBe('3 段未翻译 · 点击还原原文');
  });

  it('每次调用都是独立结果，不残留上一轮状态', () => {
    expect(toImmersiveFabView(status({ active: true, untranslated: 1 })).tone).toBe(
      'warning',
    );
    expect(toImmersiveFabView(status({ running: true, done: 1, total: 9 })).tone).toBe(
      'busy',
    );
    expect(toImmersiveFabView(status()).tone).toBe('idle');
  });
});
