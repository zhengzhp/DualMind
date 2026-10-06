/**
 * 沉浸式全文双语翻译 · 领域类型
 *
 * 与划词翻译完全隔离：不写 `translateSession`，不复用 `translate:*` 消息，
 * 只做「页面正文采集 → 分批翻译 → 内联渲染」。
 */
import type { ImmersiveDisplayMode } from '@/shared/storage/types';

export type { ImmersiveDisplayMode };

/** 采集到的一个待翻译片段（id 在一次翻译会话内唯一） */
export interface ImmersiveSegment {
  id: string;
  text: string;
}

/** 片段译文（由 Background 回传） */
export interface ImmersiveSegmentResult {
  id: string;
  text: string;
  /**
   * 模型多次输出回显（译文 == 原文）后仍无法翻译时置为 true。
   * UI 据此加淡显 / 角标，避免把回显伪装成成功（见 docs/decisions.md P0）。
   */
  untranslated?: boolean;
}

/** 内容脚本暴露给侧栏 / 工作台 / 命令入口的运行状态 */
export interface ImmersiveStatus {
  /** 当前标签页是否注入了内容脚本并能响应指令 */
  available: boolean;
  /** 是否已进入「已翻译」状态 */
  active: boolean;
  /** 是否仍在翻译中 */
  running: boolean;
  displayMode: ImmersiveDisplayMode;
  /** 已渲染出的译文片段数 */
  done: number;
  /** 片段总数 */
  total: number;
  /** 其中判定为「未翻译」（模型回显 / 单段失败）的片段数 */
  untranslated: number;
  error?: string;
}

/** 无内容脚本 / 未开始时的默认状态 */
export const IDLE_IMMERSIVE_STATUS: ImmersiveStatus = {
  available: false,
  active: false,
  running: false,
  displayMode: 'bilingual',
  done: 0,
  total: 0,
  untranslated: 0,
};
