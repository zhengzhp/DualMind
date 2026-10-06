/**
 * 沉浸译在共享悬浮入口上的「动作定义」。
 *
 * 与 `dom.ts`（旧的自建 FAB）职责的区别：入口壳已收归 `features/page-fab/`，
 * 这里只保留**沉浸译专属**的两件事：
 * 1. 把 `ImmersiveStatus` 映射成入口可渲染的状态（纯函数，可单测）；
 * 2. 声明点击行为与文案。
 *
 * 状态优先级沿用 V1.5 的既有结论（见 docs/decisions-v1.md「renderFab」）：
 * running > active > idle；配色 error > warning > active；
 * title 在「未翻译段数」与「错误原因」同时存在时优先展示段数。
 */
import type {
  PageFabAction,
  PageFabActionView,
  PageFabTone,
} from '../page-fab/types';
import type { ImmersiveStatus } from './types';

export const IMMERSIVE_ACTION_ID = 'immersive';
export const IMMERSIVE_ACTION_LABEL = '沉浸译';

/** 沉浸译状态的静态部分（`status` 字段由调用方补） */
export function toImmersiveFabView(status: ImmersiveStatus): PageFabActionView {
  if (status.running) {
    return {
      tone: 'busy',
      status: `翻译中 ${status.done}/${status.total}`,
      title: '点击停止并还原原文',
      indicator: true,
    };
  }

  if (status.active) {
    const tone: PageFabTone = status.error
      ? 'error'
      : status.untranslated > 0
        ? 'warning'
        : 'active';
    return {
      tone,
      // 已翻译后语义翻转：再点一次是「还原原文」而不是「再翻一遍」
      label: '显示原文',
      status:
        status.untranslated > 0
          ? `${status.untranslated} 段未翻译`
          : '已翻译',
      title:
        status.untranslated > 0
          ? `${status.untranslated} 段未翻译 · 点击还原原文`
          : status.error || '点击还原原文',
      indicator: true,
    };
  }

  return {
    tone: status.error ? 'error' : 'idle',
    // 无正文 / 已是目标语言等失败原因：如实展示在提示里，不静默
    title: status.error || '翻译整个网页',
    indicator: Boolean(status.error),
  };
}

/** 组装注册到入口壳的动作（`getStatus` / `onActivate` 由 mount 注入，便于解耦） */
export function createImmersiveFabAction(options: {
  getStatus: () => ImmersiveStatus;
  onActivate: () => void | Promise<void>;
}): PageFabAction {
  return {
    id: IMMERSIVE_ACTION_ID,
    label: IMMERSIVE_ACTION_LABEL,
    title: '翻译整个网页',
    icon: 'immersive',
    getView: () => toImmersiveFabView(options.getStatus()),
    onClick: () => options.onActivate(),
  };
}
