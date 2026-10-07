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
  /* ---------------- V2 聊天（摘要 / 问答）· 独立 `chat:*` 前缀 ---------------- */
  'chat:prefs:get': {
    data: undefined;
    return: import('@/shared/storage/types').ChatPrefs;
  };
  'chat:prefs:save': {
    data: Partial<import('@/shared/storage/types').ChatPrefs>;
    return: import('@/shared/storage/types').ChatPrefs;
  };
  /** 会话列表（摘要，按更新时间倒序） */
  'chat:sessions:list': {
    data: undefined;
    return: import('@/shared/storage/types').ChatSessionSummary[];
  };
  'chat:sessions:get': {
    data: { id: string };
    return: import('@/shared/storage/types').ChatSession | null;
  };
  /** 新增 / 更新会话（容量上限由 Background 侧统一裁剪） */
  'chat:sessions:upsert': {
    data: { session: import('@/shared/storage/types').ChatSession };
    return: import('@/shared/storage/types').ChatSession;
  };
  'chat:sessions:delete': {
    data: { id: string };
    return: { ok: true };
  };
  'chat:sessions:clear': {
    data: undefined;
    return: { ok: true };
  };
  /**
   * 提取「当前内容页」的上下文（Background 转发到内容脚本）。
   * 解析规则与 `chat:page-info` 相同：活动页可读则用之，否则回退同窗口最近可读页
   * （全页工作台本身是扩展标签页，不能当活动页直接取正文）。
   * 页面无可读内容 / 未注入内容脚本时返回 null。
   */
  'chat:context': {
    data: { scope?: import('@/shared/storage/types').ChatContextScope };
    return: import('@/features/chat/types').ChatContextPayload | null;
  };
  /**
   * 取「当前内容页」的地址 / 标题（**不触发内容脚本**）。
   * 与 `chat:context` 共用 `resolveContentTab`：工作台前台时回退最近可读 http(s) 页。
   * 用途：重开旧会话后判断来源页是否与当前内容页一致，不一致则让 UI 先确认。
   */
  'chat:page-info': {
    data: undefined;
    return: { url: string; title: string } | null;
  };
  /**
   * 页面悬浮入口「总结本页」：请求 Background 打开 Side Panel 并投递信箱。
   *
   * 与右键菜单「总结本页」共用同一条执行链路（写信箱 → 常驻 WorkbenchApp 消费），
   * 但入口不同：内容脚本发出本消息，Background 必须**在手势有效期内**调用
   * `sidePanel.open()`（见 docs/decisions-v1.md「侧边栏 open 的手势窗口」），
   * 因此它在 onMessage 里被特判，而不是走通用 handler 表。
   */
  'chat:summarize-page': {
    data: undefined;
    return: { ok: true; open: boolean };
  };
  /**
   * 内容脚本：页面发生 SPA / hash 导航。Background 只写入 `local:chatPageNav`，
   * 网页助手 UI 提示「上下文可能过期」，**不**自动重读。
   */
  'chat:page-nav': {
    data: { url: string; title: string };
    return: { ok: true };
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

/** 网页摘要 / 问答 Port 名称（流式、可多请求并发、支持 abort） */
export const CHAT_PORT = 'dualmind-chat';

/** 聊天：Client（Side Panel / 工作台）→ Background */
export type ChatPortClientMessage =
  | {
      type: 'start';
      requestId: string;
      /** 页面上下文；null 表示无可用上下文（仍可纯对话） */
      context: import('@/features/chat/types').ChatContextPayload | null;
      /** 历史消息（不含本次提问） */
      history: import('@/shared/storage/types').ChatTurn[];
      /** 本轮提问 */
      question: string;
    }
  | { type: 'abort'; requestId: string };

/** 聊天：Background → Client */
export type ChatPortServerMessage =
  | { type: 'chunk'; requestId: string; text: string; accumulated: string }
  | { type: 'done'; requestId: string; content: string }
  | { type: 'error'; requestId: string; code: string; message: string };
