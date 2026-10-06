/**
 * ImmersiveController 失败态语义的回归护栏。
 *
 * 背景（docs/decisions.md「残留观察」）：此前某批失败后 error 会一直挂到下一次
 * start / stop，即使后续批次全部成功也不清除。现在的要求是：失败如实保留为
 * 「有 N 段翻译失败：原因」，并在下列情况清除：
 *   1. 全部失败片段都补译成功；
 *   2. 下一次 start / stop。
 *
 * 这里不引入 jsdom：只 stub 渲染层真正访问到的那一小块 DOM，模型调用与消息
 * 通道用 vi.mock 隔离。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectedSegment } from './segmenter';
import type { ImmersiveSegment } from './types';

// vi.mock 会被提升到 import 之前，用 hoisted 与 mock 工厂共享同一组函数
const mocks = vi.hoisted(() => ({
  translateBatch: vi.fn(),
  collectSegments: vi.fn(),
  sendMessage: vi.fn(),
}));

// 只替换采集函数，其余导出保留（segmenter 是纯逻辑，无 DOM / wxt 依赖）
vi.mock('./segmenter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./segmenter')>();
  return { ...actual, collectSegments: mocks.collectSegments };
});

// Port 客户端依赖 wxt/browser（vitest 下没有 WXT 运行时），整体替换
vi.mock('./client', () =>
  ({
    createImmersiveClient: () => ({
      translateBatch: mocks.translateBatch,
      dispose: () => {},
    }),
  }) as unknown as typeof import('./client'));

// 读取设置走 Background 消息，同样依赖 wxt/browser，整体替换
vi.mock('@/shared/messaging/client', () =>
  ({
    sendMessage: mocks.sendMessage,
  }) as unknown as typeof import('@/shared/messaging/client'));

import { ImmersiveController } from './controller';

/** 极简伪元素：只实现渲染层与视口排序真正访问到的成员 */
function fakeSourceElement(): Element {
  return {
    tagName: 'P',
    isConnected: true,
    // 无布局信息：viewportDistance 走 catch 分支，片段保持采集顺序
    getBoundingClientRect(): DOMRect {
      throw new Error('no layout in test');
    },
    setAttribute(): void {},
    removeAttribute(): void {},
    insertAdjacentElement(): void {},
  } as unknown as Element;
}

/** 极简伪节点：渲染层会设置 className / textContent 与 data-* 属性 */
function fakeDomNode(): unknown {
  const attrs = new Set<string>();
  return {
    className: '',
    textContent: '',
    appendChild(): void {},
    replaceChildren(): void {},
    remove(): void {},
    setAttribute(name: string): void {
      attrs.add(name);
    },
    removeAttribute(name: string): void {
      attrs.delete(name);
    },
    hasAttribute(name: string): boolean {
      return attrs.has(name);
    },
  };
}

/** 装上渲染层需要的最小 DOM 面；不提供 MutationObserver，避免触发增量补译 */
function stubDom(): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.document = {
    body: {},
    head: { appendChild: () => {} },
    documentElement: { classList: { toggle: () => {}, remove: () => {} } },
    getElementById: () => null,
    createElement: () => fakeDomNode(),
    createTextNode: () => fakeDomNode(),
  };
  globals.MutationObserver = undefined;
}

/** 生成 count 个英文片段（目标语言为中文，确保不被 isTargetLanguage 过滤） */
function makeSegments(prefix: string, count: number): CollectedSegment[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${index}`,
    text: `Hello ${prefix} ${index}`,
    el: fakeSourceElement(),
  }));
}

/** 成功路径：逐段回带译文 */
function echoResults(batch: ImmersiveSegment[]) {
  return batch.map((item) => ({ id: item.id, text: `译:${item.text}` }));
}

beforeEach(() => {
  mocks.translateBatch.mockReset();
  mocks.collectSegments.mockReset();
  mocks.sendMessage.mockReset();

  stubDom();
  mocks.sendMessage.mockResolvedValue({ targetLanguage: 'zh-CN' });
});

afterEach(() => {
  const globals = globalThis as unknown as Record<string, unknown>;
  delete globals.document;
  delete globals.MutationObserver;
});

describe('ImmersiveController 失败态', () => {
  it('部分批次失败：保留「N 段翻译失败」，不被后续成功批次掩盖', async () => {
    // 24 段 → 每批 12 段，共 2 批；后一批整体失败
    mocks.collectSegments.mockReturnValue([
      ...makeSegments('ok', 12),
      ...makeSegments('bad', 12),
    ]);
    mocks.translateBatch.mockImplementation(
      async (batch: ImmersiveSegment[]) =>
        batch[0]?.id.startsWith('bad')
          ? Promise.reject(new Error('boom'))
          : echoResults(batch),
    );

    const controller = new ImmersiveController(() => {});
    await controller.start();

    const status = controller.getStatus();
    expect(status.total).toBe(24);
    expect(status.done).toBe(12); // 失败的那一批没有译文
    expect(status.running).toBe(false);
    expect(status.error).toContain('有 12 段翻译失败');
  });

  it('全部批次成功：错误态为空', async () => {
    mocks.collectSegments.mockReturnValue(makeSegments('ok', 3));
    mocks.translateBatch.mockImplementation((batch: ImmersiveSegment[]) =>
      Promise.resolve(echoResults(batch)),
    );

    const controller = new ImmersiveController(() => {});
    await controller.start();

    const status = controller.getStatus();
    expect(status.done).toBe(3);
    expect(status.error).toBeUndefined();
  });

  it('stop() 清除失败提示', async () => {
    mocks.collectSegments.mockReturnValue(makeSegments('bad', 2));
    mocks.translateBatch.mockRejectedValue(new Error('boom'));

    const controller = new ImmersiveController(() => {});
    await controller.start();
    expect(controller.getStatus().error).toContain('有 2 段翻译失败');

    controller.stop();
    expect(controller.getStatus().error).toBeUndefined();
  });

  it('失败片段在后续补译成功后，提示自动消失', async () => {
    mocks.collectSegments
      .mockReturnValueOnce(makeSegments('a', 12))
      // 动态补扫时重新采集到同一批片段（id 相同）
      .mockReturnValueOnce(makeSegments('a', 12));
    mocks.translateBatch
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementation((batch: ImmersiveSegment[]) =>
        Promise.resolve(echoResults(batch)),
      );

    const controller = new ImmersiveController(() => {});
    await controller.start();
    expect(controller.getStatus().error).toContain('有 12 段翻译失败');

    // runIncremental 属内部方法：模拟 MutationObserver 触发的补扫
    await (
      controller as unknown as { runIncremental: () => Promise<void> }
    ).runIncremental();

    expect(controller.getStatus().error).toBeUndefined();
  });
});
