/**
 * 扩展内部消息协议（Content / Side Panel / Options ↔ Background）
 * Background 是唯一发起 AI 请求的位置
 *
 * 流式翻译走 runtime Port（见 stream.ts），不走本表
 */

export type ProtocolMap = {
  'translate:run': {
    data: { text: string; targetLanguage?: string };
    return: {
      sourceText: string;
      translatedText: string;
      targetLanguage: string;
    };
  };
  'provider:listModels': {
    data: undefined;
    return: { models: string[] };
  };
  'provider:test': {
    data: undefined;
    return: {
      ok: boolean;
      detail?: string;
      error?: string;
      code?: string;
    };
  };
  'settings:get': {
    data: undefined;
    return: import('@/shared/storage/types').AppSettings;
  };
  'settings:save': {
    data: Partial<import('@/shared/storage/types').AppSettings>;
    return: import('@/shared/storage/types').AppSettings;
  };
  'session:get': {
    data: undefined;
    return: import('@/shared/storage/settings').TranslateSession | null;
  };
  'sidepanel:open': {
    data: undefined;
    return: { ok: true };
  };
  /** 划词浮层：打开 / 收起 Side Panel */
  'sidepanel:toggle': {
    data: undefined;
    return: { ok: true; open: boolean };
  };
  'sidepanel:status': {
    data: undefined;
    return: { open: boolean };
  };
  'selection:push': {
    data: { text: string };
    return: { ok: true };
  };
  /** 沉浸式全文翻译：把指令转发到「当前活动标签页」的内容脚本 */
  'immersive:command': {
    data: {
      command: 'start' | 'stop' | 'toggle';
      displayMode?: import('@/shared/storage/types').ImmersiveDisplayMode;
    };
    return: import('@/features/immersive/types').ImmersiveStatus;
  };
  /** 查询当前活动标签页的沉浸式翻译状态 */
  'immersive:status': {
    data: undefined;
    return: import('@/features/immersive/types').ImmersiveStatus;
  };
  'immersive:prefs:get': {
    data: undefined;
    return: import('@/shared/storage/types').ImmersivePrefs;
  };
  'immersive:prefs:save': {
    data: Partial<import('@/shared/storage/types').ImmersivePrefs>;
    return: import('@/shared/storage/types').ImmersivePrefs;
  };
};

/** Side Panel 生命周期 Port：用于判断是否已打开、以及请求自关闭 */
export const SIDEPANEL_PORT = 'dualmind-sidepanel';

export type MessageType = keyof ProtocolMap;

/** 流式翻译 Port 名称 */
export const TRANSLATE_PORT = 'dualmind-translate';

/** 沉浸式全文翻译 Port 名称（批量、可并发、支持 abort） */
export const IMMERSIVE_PORT = 'dualmind-immersive';

/** Client → Background */
export type TranslatePortClientMessage =
  | {
      type: 'start';
      text: string;
      targetLanguage?: string;
    }
  | { type: 'abort' };

/** Background → Client */
export type TranslatePortServerMessage =
  | { type: 'chunk'; text: string; accumulated: string }
  | {
      type: 'done';
      result: {
        sourceText: string;
        translatedText: string;
        targetLanguage: string;
      };
    }
  | { type: 'error'; code: string; message: string };

/** 沉浸式翻译：Client（Content）→ Background */
export type ImmersivePortClientMessage =
  | {
      type: 'translate-batch';
      requestId: string;
      segments: import('@/features/immersive/types').ImmersiveSegment[];
      targetLanguage: string;
    }
  | { type: 'abort'; requestId: string };

/** 沉浸式翻译：Background → Client（Content） */
export type ImmersivePortServerMessage =
  | {
      type: 'batch-done';
      requestId: string;
      results: import('@/features/immersive/types').ImmersiveSegmentResult[];
    }
  | { type: 'batch-error'; requestId: string; code: string; message: string };
