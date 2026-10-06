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
};

/** Side Panel 生命周期 Port：用于判断是否已打开、以及请求自关闭 */
export const SIDEPANEL_PORT = 'dualmind-sidepanel';

export type MessageType = keyof ProtocolMap;

/** 流式翻译 Port 名称 */
export const TRANSLATE_PORT = 'dualmind-translate';

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
