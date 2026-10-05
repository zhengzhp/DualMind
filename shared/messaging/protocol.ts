/**
 * 扩展内部消息协议（Content / Side Panel / Options ↔ Background）
 * Background 是唯一发起 AI 请求的位置
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
    return: { ok: boolean; detail?: string; error?: string };
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
  'selection:push': {
    data: { text: string };
    return: { ok: true };
  };
};

export type MessageType = keyof ProtocolMap;
