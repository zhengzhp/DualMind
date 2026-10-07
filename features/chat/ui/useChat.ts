/**
 * 聊天会话状态管理（Side Panel / 全页工作台共用）。
 *
 * 把「状态机 + 持久化 + 流式写入」集中在一处，UI 组件只负责渲染与事件绑定。
 * 关键防护：会话切换 / 新建会中断在途流式，所有异步回写都先比对会话 id，
 * 避免迟到的 chunk 写到新会话里（同类问题见 `docs/decisions-v1.md` 的残留提示缺陷）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { formatErrorForUi } from '@/shared/errors';
import { sendMessage } from '@/shared/messaging/client';
import { deriveSessionTitle, updateTurn } from '@/shared/storage/chatSessions';
import type {
  ChatContextScope,
  ChatPageNavSignal,
  ChatPendingAction,
  ChatPrefs,
  ChatSession,
  ChatSessionSummary,
  ChatTurn,
} from '@/shared/storage/types';
import { streamChat } from '../client';
import {
  buildAllSessionsExportFilename,
  buildSessionExportFilename,
  downloadTextFile,
  formatAllSessionsMarkdown,
  formatSessionMarkdown,
} from '../export';
import { createPageBreakTurn } from '../pageBreak';
import { isSamePageUrl } from '../pageUrl';
import { SUMMARY_QUESTION } from '../prompts';
import type { ChatContextPayload } from '../types';

/** 生成进程内唯一 id（会话 / 消息无需跨设备一致） */
function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** 全新的空会话（首次提问时才落盘） */
function createSession(): ChatSession {
  const now = Date.now();
  return {
    id: createId('dmchat'),
    title: '新会话',
    pageUrl: '',
    pageTitle: '',
    turns: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** 会话来自其他页面时的待确认状态（发送前先问用户） */
export interface MismatchConfirm {
  /** 用户原本要发送的提问（确认后原样发出，取消则还回输入框） */
  question: string;
  /** 会话记录的来源页 */
  sessionUrl: string;
  /** 当前内容页地址（与 chat:page-info 同一解析） */
  currentUrl: string;
  /** 当前内容页标题（确认后写回会话来源，避免标签陈旧） */
  currentTitle: string;
}

/** `send` 的结果：已发出 / 等待用户确认来源 / 未受理（空文本或在途） */
export type SendStatus = 'sent' | 'pending-mismatch' | 'blocked';

export interface ChatController {
  prefs: ChatPrefs | null;
  session: ChatSession;
  sessions: ChatSessionSummary[];
  context: ChatContextPayload | null;
  contextLoading: boolean;
  contextError: string;
  /**
   * 页面在读取上下文后发生了 SPA / 路由变化：提示用户点「重新读取」。
   * 不自动静默重读，避免上下文被悄悄换掉。
   */
  contextStale: boolean;
  /**
   * 当前将读取 / 已绑定的内容页（经 BG `resolveContentTab`）。
   * 工作台前台时也可能指向同窗口最近可读网页，而非扩展页自身。
   */
  boundPage: { url: string; title: string } | null;
  streaming: boolean;
  error: string;
  /** 非空时 UI 需弹「会话来自其他页面，仍要继续？」确认条 */
  mismatchConfirm: MismatchConfirm | null;
  setScope(scope: ChatContextScope): Promise<void>;
  refreshContext(): Promise<void>;
  /** 发送提问；返回是否已受理（`pending-mismatch` 时输入框应保留内容直到用户决定） */
  send(question: string): Promise<SendStatus>;
  summarize(): void;
  stop(): void;
  startNew(): void;
  openSession(id: string): Promise<void>;
  removeSession(id: string): Promise<void>;
  clearSessions(): Promise<void>;
  /** 导出单条会话为 Markdown 并触发本机下载 */
  downloadSession(id: string): Promise<void>;
  /** 导出全部历史为单个 Markdown 文件 */
  downloadAllSessions(): Promise<void>;
  /**
   * 确认用当前页继续：认下当前页为会话来源（消除陈旧标签）并发出挂起的提问。
   * `remember` 为 true 时置 `allowCrossPage`，本会话不再提示。
   */
  confirmMismatch(options?: { remember?: boolean }): void;
  /** 取消本次发送（调用方负责把提问还回输入框） */
  cancelMismatch(): void;
}

export interface UseChatOptions {
  /**
   * 由外层（常驻的 `WorkbenchApp`）消费信箱后下发的待执行动作。
   * 之所以不在这里直接读 `local:chatPending`：面板只在「网页助手」Tab 激活时挂载，
   * 用户停在「翻译」Tab 时会错过 storage 事件。
   */
  pendingAction?: ChatPendingAction | null;
  /** 动作已处理，外层可清空，避免重复下发 */
  onPendingHandled?: () => void;
}

export function useChat(options: UseChatOptions = {}): ChatController {
  const [prefs, setPrefs] = useState<ChatPrefs | null>(null);
  const [session, setSession] = useState<ChatSession>(createSession);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [context, setContext] = useState<ChatContextPayload | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const [contextStale, setContextStale] = useState(false);
  const [boundPage, setBoundPage] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  /** 会话来源页与当前页不一致时的待确认状态（见 docs/decisions.md） */
  const [mismatchConfirm, setMismatchConfirm] =
    useState<MismatchConfirm | null>(null);

  /** 逻辑侧读取「当前会话」的权威引用（避免闭包拿到过期 state） */
  const sessionRef = useRef<ChatSession>(session);
  const abortRef = useRef<AbortController | null>(null);

  const commitSession = useCallback((next: ChatSession) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  /** 只在会话未被切走时回写（防止迟到的流式回包污染新会话） */
  const commitIfCurrent = useCallback(
    (next: ChatSession) => {
      if (sessionRef.current.id !== next.id) return;
      commitSession(next);
    },
    [commitSession],
  );

  /** 中断在途请求并复位流式态 */
  const interrupt = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await sendMessage('chat:sessions:list', undefined));
    } catch (err) {
      setError(formatErrorForUi(err));
    }
  }, []);

  const loadContext = useCallback(
    async (scope?: ChatContextScope): Promise<ChatContextPayload | null> => {
      setContextLoading(true);
      setContextError('');
      try {
        const payload = await sendMessage(
          'chat:context',
          scope ? { scope } : {},
        );
        setContext(payload);
        setContextStale(false);
        if (payload) {
          setBoundPage({ url: payload.url, title: payload.title });
          setContextError('');
        } else {
          setContextError(
            '未能读取页面内容（当前窗口没有可读取的网页，请先打开目标页后再试）',
          );
        }
        return payload;
      } catch (err) {
        setContextError(formatErrorForUi(err));
        return null;
      } finally {
        setContextLoading(false);
      }
    },
    [],
  );

  /** 内容页 SPA 导航信号：已有缓存且 URL 变了 → 标 stale，不自动重读 */
  useEffect(() => {
    const onNav = (signal: ChatPageNavSignal | null | undefined) => {
      if (!signal?.url) return;
      const baseline = context?.url || boundPage?.url || '';
      if (!baseline) return;
      if (!isSamePageUrl(baseline, signal.url)) {
        setContextStale(true);
      }
    };

    const listener = (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ) => {
      if (area !== 'local') return;
      const change = Object.entries(changes).find(([key]) =>
        key.includes('chatPageNav'),
      );
      if (!change) return;
      onNav(change[1].newValue as ChatPageNavSignal | null);
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [boundPage?.url, context?.url]);

  useEffect(() => {
    void (async () => {
      try {
        setPrefs(await sendMessage('chat:prefs:get', undefined));
      } catch (err) {
        setError(formatErrorForUi(err));
      }
      // 预览将绑定的内容页（工作台前台时也会回退到最近可读网页）
      try {
        const info = await sendMessage('chat:page-info', undefined);
        if (info?.url) setBoundPage(info);
      } catch {
        /* 预览失败不阻塞 */
      }
      await refreshSessions();
    })();
    return () => {
      abortRef.current?.abort();
    };
  }, [refreshSessions]);

  const persist = useCallback(
    async (target: ChatSession) => {
      try {
        await sendMessage('chat:sessions:upsert', { session: target });
        await refreshSessions();
      } catch (err) {
        setError(formatErrorForUi(err));
      }
    },
    [refreshSessions],
  );

  const setScope = useCallback(
    async (scope: ChatContextScope) => {
      setPrefs((current) => (current ? { ...current, contextScope: scope } : current));
      try {
        setPrefs(await sendMessage('chat:prefs:save', { contextScope: scope }));
      } catch (err) {
        setError(formatErrorForUi(err));
      }
      // 范围变了：立即按新范围重读上下文，避免用户以为仍用旧范围
      await loadContext(scope);
    },
    [loadContext],
  );

  const sendNow = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      // 在途请求存在时不允许并发提问（UI 此时显示「停止」）
      if (!text || abortRef.current) return;

      setError('');
      // 首次提问才读取页面上下文；读取失败不阻塞对话（退化为纯对话）
      let activeContext = context;
      if (!activeContext && !contextError) {
        activeContext = await loadContext(prefs?.contextScope);
      }

      const base = sessionRef.current;
      const now = Date.now();
      const userTurn: ChatTurn = {
        id: createId('u'),
        role: 'user',
        content: text,
        createdAt: now,
      };
      // 先占位一条助手消息，流式增量按 id 写入它
      const replyTurn: ChatTurn = {
        id: createId('a'),
        role: 'assistant',
        content: '',
        createdAt: now,
      };

      let working: ChatSession = {
        ...base,
        // 首轮提问即定标题，后续不再改（避免标题随追问漂移）
        title:
          base.turns.length === 0 ? deriveSessionTitle(text) : base.title,
        pageUrl: activeContext?.url || base.pageUrl,
        pageTitle: activeContext?.title || base.pageTitle,
        turns: [...base.turns, userTurn, replyTurn],
        updatedAt: now,
      };
      commitSession(working);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const content = await streamChat({
          context: activeContext,
          // 历史不含本次提问与助手占位
          history: base.turns,
          question: text,
          signal: controller.signal,
          onChunk: (accumulated) => {
            working = {
              ...working,
              turns: updateTurn(working.turns, replyTurn.id, {
                content: accumulated,
              }),
            };
            commitIfCurrent(working);
          },
        });
        working = {
          ...working,
          turns: updateTurn(working.turns, replyTurn.id, { content }),
          updatedAt: Date.now(),
        };
        commitIfCurrent(working);
        await persist(working);
      } catch (err) {
        const message = formatErrorForUi(err);
        if (message === '已取消') {
          // 取消：保留已生成的部分内容，不标失败
          working = { ...working, updatedAt: Date.now() };
          commitIfCurrent(working);
        } else {
          setError(message);
          working = {
            ...working,
            turns: updateTurn(working.turns, replyTurn.id, { error: message }),
            updatedAt: Date.now(),
          };
          commitIfCurrent(working);
        }
        await persist(working);
      } finally {
        // 只有本次请求仍是「当前在途」时才复位（新建 / 切换会话可能已顶替）
        if (abortRef.current === controller) {
          abortRef.current = null;
          setStreaming(false);
        }
      }
    },
    [
      commitIfCurrent,
      commitSession,
      context,
      contextError,
      loadContext,
      persist,
      prefs?.contextScope,
    ],
  );

  /** 读取当前内容页地址与标题（不触发内容脚本）；失败返回 null */
  const probeActivePage = useCallback(async (): Promise<{
    url: string;
    title: string;
  } | null> => {
    try {
      const info = await sendMessage('chat:page-info', undefined);
      if (info?.url) setBoundPage(info);
      return info ?? null;
    } catch {
      return null;
    }
  }, []);

  /**
   * 发送入口：先做「会话来源页 vs 当前内容页」一致性判断。
   *
   * 仅当会话**已记录了来源页、已有历史消息且未被标记 `allowCrossPage`** 时探测，
   * 新建会话 / 首轮提问不会多这一跳。
   * 地址为空（无可读内容页）视为无法比较，直接放行。
   *
   * 流式部分交给 `sendNow` 自行进行，这里不 await —— 否则输入框要等整轮回答
   * 结束才清空。
   */
  const send = useCallback(
    async (question: string): Promise<SendStatus> => {
      const text = question.trim();
      if (!text || abortRef.current) return 'blocked';

      const base = sessionRef.current;
      if (base.pageUrl && base.turns.length > 0 && !base.allowCrossPage) {
        const current = await probeActivePage();
        if (current?.url && !isSamePageUrl(base.pageUrl, current.url)) {
          setMismatchConfirm({
            question: text,
            sessionUrl: base.pageUrl,
            currentUrl: current.url,
            currentTitle: current.title,
          });
          return 'pending-mismatch';
        }
      }
      void sendNow(text);
      return 'sent';
    },
    [probeActivePage, sendNow],
  );

  const confirmMismatch = useCallback(
    (options?: { remember?: boolean }) => {
      const pending = mismatchConfirm;
      if (!pending) return;
      setMismatchConfirm(null);
      // 先认下当前页作为会话来源：即使随后读不到正文（activeContext 为 null），
      // pageUrl 也已是新页，不会因为回退到旧来源而每次发送都弹确认。
      // 插入分隔条，避免跨页 turns 在 UI 里糊成一段。
      const base = sessionRef.current;
      const breakTurn = createPageBreakTurn({
        id: createId('pb'),
        url: pending.currentUrl,
        title: pending.currentTitle,
      });
      commitSession({
        ...base,
        pageUrl: pending.currentUrl,
        pageTitle: pending.currentTitle || base.pageTitle,
        turns: [...base.turns, breakTurn],
        updatedAt: Date.now(),
        ...(options?.remember ? { allowCrossPage: true } : {}),
      });
      // 换页后旧上下文作废，让 sendNow 按需重读
      setContext(null);
      setContextStale(false);
      void sendNow(pending.question);
    },
    [commitSession, mismatchConfirm, sendNow],
  );

  const cancelMismatch = useCallback(() => setMismatchConfirm(null), []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const summarize = useCallback(() => void send(SUMMARY_QUESTION), [send]);

  const startNew = useCallback(() => {
    interrupt();
    commitSession(createSession());
    setContext(null);
    setContextError('');
    setContextStale(false);
    setError('');
    setMismatchConfirm(null);
  }, [commitSession, interrupt]);

  const openSession = useCallback(
    async (id: string) => {
      try {
        const loaded = await sendMessage('chat:sessions:get', { id });
        if (!loaded) return;
        interrupt();
        setError('');
        setContext(null);
        setContextStale(false);
        setContextError('');
        setMismatchConfirm(null);
        commitSession(loaded);
      } catch (err) {
        setError(formatErrorForUi(err));
      }
    },
    [commitSession, interrupt],
  );

  const removeSession = useCallback(
    async (id: string) => {
      try {
        await sendMessage('chat:sessions:delete', { id });
        await refreshSessions();
        if (sessionRef.current.id === id) {
          setContext(null);
          setContextError('');
          setMismatchConfirm(null);
          commitSession(createSession());
        }
      } catch (err) {
        setError(formatErrorForUi(err));
      }
    },
    [commitSession, refreshSessions],
  );

  const clearSessions = useCallback(async () => {
    try {
      await sendMessage('chat:sessions:clear', undefined);
      await refreshSessions();
      setContext(null);
      setContextError('');
      setMismatchConfirm(null);
      commitSession(createSession());
    } catch (err) {
      setError(formatErrorForUi(err));
    }
  }, [commitSession, refreshSessions]);

  /** 列表只有 summary，导出前必须 get 全量 turns */
  const downloadSession = useCallback(async (id: string) => {
    try {
      const loaded = await sendMessage('chat:sessions:get', { id });
      if (!loaded) {
        setError('未找到该会话，无法下载');
        return;
      }
      downloadTextFile(
        buildSessionExportFilename(loaded),
        formatSessionMarkdown(loaded),
      );
      setError('');
    } catch (err) {
      setError(formatErrorForUi(err));
    }
  }, []);

  const downloadAllSessions = useCallback(async () => {
    try {
      const summaries = await sendMessage('chat:sessions:list', undefined);
      if (summaries.length === 0) {
        setError('暂无历史会话可下载');
        return;
      }
      const full: ChatSession[] = [];
      for (const item of summaries) {
        const loaded = await sendMessage('chat:sessions:get', { id: item.id });
        if (loaded) full.push(loaded);
      }
      if (full.length === 0) {
        setError('未能读取会话内容，请稍后重试');
        return;
      }
      downloadTextFile(
        buildAllSessionsExportFilename(),
        formatAllSessionsMarkdown(full),
      );
      // 部分 id 读失败时仍交付已取到的内容；不写红色错误条以免误以为整次失败
      setError('');
    } catch (err) {
      setError(formatErrorForUi(err));
    }
  }, []);

  /* 右键菜单信箱：外层下发的待执行动作 → 自动发起「总结本页」。
     去重按 createdAt，避免外层重复下发导致重复提问。 */
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const handledPendingRef = useRef(0);
  const { pendingAction, onPendingHandled } = options;

  useEffect(() => {
    if (!pendingAction) return;
    if (handledPendingRef.current === pendingAction.createdAt) return;
    handledPendingRef.current = pendingAction.createdAt;
    onPendingHandled?.();
    if (pendingAction.kind === 'summarize') {
      void sendRef.current(SUMMARY_QUESTION);
    }
  }, [pendingAction, onPendingHandled]);

  return {
    prefs,
    session,
    sessions,
    context,
    contextLoading,
    contextError,
    contextStale,
    boundPage,
    streaming,
    error,
    mismatchConfirm,
    setScope,
    refreshContext: async () => {
      await loadContext(prefs?.contextScope);
    },
    send,
    summarize,
    stop,
    startNew,
    openSession,
    removeSession,
    clearSessions,
    downloadSession,
    downloadAllSessions,
    confirmMismatch,
    cancelMismatch,
  };
}
