/**
 * 聊天会话状态管理（Side Panel / 全页工作台共用）。
 *
 * 把「状态机 + 持久化 + 流式写入」集中在一处，UI 组件只负责渲染与事件绑定。
 * 关键防护：会话切换 / 新建会中断在途流式，所有异步回写都先比对会话 id，
 * 避免迟到的 chunk 写到新会话里（同类问题见 `docs/decisions-v1.md` 的残留提示缺陷）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatErrorForUi } from '@/shared/errors';
import { sendMessage } from '@/shared/messaging/client';
import { deriveSessionTitle, updateTurn } from '@/shared/storage/chatSessions';
import type {
  ChatContextScope,
  ChatPrefs,
  ChatSession,
  ChatSessionSummary,
  ChatTurn,
} from '@/shared/storage/types';
import { streamChat } from '../client';
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

export interface ChatController {
  prefs: ChatPrefs | null;
  session: ChatSession;
  sessions: ChatSessionSummary[];
  context: ChatContextPayload | null;
  contextLoading: boolean;
  contextError: string;
  streaming: boolean;
  error: string;
  setScope(scope: ChatContextScope): Promise<void>;
  refreshContext(): Promise<void>;
  send(question: string): Promise<void>;
  summarize(): Promise<void>;
  stop(): void;
  startNew(): void;
  openSession(id: string): Promise<void>;
  removeSession(id: string): Promise<void>;
  clearSessions(): Promise<void>;
}

export function useChat(): ChatController {
  const [prefs, setPrefs] = useState<ChatPrefs | null>(null);
  const [session, setSession] = useState<ChatSession>(createSession);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [context, setContext] = useState<ChatContextPayload | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');

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
        if (!payload) {
          setContextError('未能读取页面内容（页面未加载完成，或不在可读取范围内）');
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

  useEffect(() => {
    void (async () => {
      try {
        setPrefs(await sendMessage('chat:prefs:get', undefined));
      } catch (err) {
        setError(formatErrorForUi(err));
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

  const send = useCallback(
    async (question: string) => {
      const text = question.trim();
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

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const summarize = useCallback(() => send(SUMMARY_QUESTION), [send]);

  const startNew = useCallback(() => {
    interrupt();
    commitSession(createSession());
    setContext(null);
    setContextError('');
    setError('');
  }, [commitSession, interrupt]);

  const openSession = useCallback(
    async (id: string) => {
      try {
        const loaded = await sendMessage('chat:sessions:get', { id });
        if (!loaded) return;
        interrupt();
        setError('');
        setContext(null);
        setContextError('');
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
      commitSession(createSession());
    } catch (err) {
      setError(formatErrorForUi(err));
    }
  }, [commitSession, refreshSessions]);

  return {
    prefs,
    session,
    sessions,
    context,
    contextLoading,
    contextError,
    streaming,
    error,
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
  };
}
