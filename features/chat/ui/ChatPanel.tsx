/**
 * 网页摘要 / 网页问答面板（Side Panel 与全页工作台共用）。
 *
 * 三态齐全：空（引导） / 流式（正在生成） / 错误（如实标注到对应轮次）。
 * 布局用 `min-h-0 + flex-1 + overflow-y-auto` 让消息区可滚动、输入区常驻底部。
 */
import { useEffect, useRef, useState } from 'react';
import { SegmentedControl } from '@/shared/ui';
import type { ChatContextScope, ChatTurn } from '@/shared/storage/types';
import { SessionList } from './SessionList';
import { useChat } from './useChat';

export type ChatSurface = 'sidepanel' | 'workspace';

/** 上下文范围选项（与 `ChatContextScope` 对齐） */
const SCOPE_OPTIONS: { value: ChatContextScope; label: string; title: string }[] =
  [
    { value: 'page', label: '当前页', title: '以整页正文作为上下文' },
    { value: 'selection', label: '选区', title: '以当前选中的文字作为上下文' },
  ];

export function ChatPanel({ surface }: { surface: ChatSurface }) {
  const chat = useChat();
  const [draft, setDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPage = surface === 'workspace';

  // 新内容到达（含流式增量）时贴底
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.session.turns]);

  async function handleSend() {
    const text = draft;
    if (!text.trim() || chat.streaming) return;
    setDraft('');
    await chat.send(text);
  }

  const scope = chat.prefs?.contextScope ?? 'page';
  const turns = chat.session.turns;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      {/* 上下文范围 + 状态 */}
      <div className="rounded-xl border border-brand-100/80 bg-white/70 p-3">
        <div className="flex items-center gap-2">
          <label className="w-14 shrink-0 text-xs font-medium text-brand-700">
            上下文
          </label>
          <SegmentedControl
            value={scope}
            options={SCOPE_OPTIONS}
            disabled={!chat.prefs || chat.streaming}
            onChange={(next) => void chat.setScope(next)}
            ariaLabel="上下文范围"
            className="min-w-0 flex-1"
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-[11px] text-brand-700/70">
            {chat.contextLoading ? (
              '正在读取页面内容…'
            ) : chat.contextError ? (
              <span className="text-amber-600">{chat.contextError}</span>
            ) : chat.context ? (
              `${chat.context.scope === 'selection' ? '选区' : '整页'} · ${
                chat.context.segments.length
              } 段${chat.context.truncated ? ' · 已精简' : ''}`
            ) : (
              '尚未读取页面内容（首次提问时自动读取）'
            )}
          </p>
          <button
            type="button"
            onClick={() => void chat.refreshContext()}
            disabled={chat.contextLoading || chat.streaming}
            className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50"
          >
            重新读取
          </button>
        </div>

        {chat.session.pageTitle && (
          <p className="mt-1 truncate text-[11px] text-brand-700/50">
            会话来源：{chat.session.pageTitle}
          </p>
        )}
      </div>

      {/* 操作行 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={chat.streaming}
          onClick={() => void chat.summarize()}
          className="rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          总结本页
        </button>
        <button
          type="button"
          onClick={chat.startNew}
          className="rounded-lg border border-brand-100 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
        >
          新对话
        </button>
        <button
          type="button"
          onClick={() => setShowHistory((current) => !current)}
          className="rounded-lg border border-brand-100 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
        >
          历史{chat.sessions.length > 0 ? `（${chat.sessions.length}）` : ''}
        </button>
      </div>

      {showHistory && (
        <SessionList
          sessions={chat.sessions}
          currentId={chat.session.id}
          onOpen={(id) => {
            setShowHistory(false);
            void chat.openSession(id);
          }}
          onRemove={(id) => void chat.removeSession(id)}
          onClear={() => void chat.clearSessions()}
        />
      )}

      {chat.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {chat.error}
        </div>
      )}

      {/* 消息区：全页有固定视口高度，可 flex-1 撑满；侧栏外层高度由内容决定，
          故用 max-h 限高，避免消息一多就把输入框挤出屏幕 */}
      <div
        ref={scrollRef}
        className={`space-y-3 overflow-y-auto rounded-xl border border-brand-100/80 bg-white/70 p-3 ${
          isPage ? 'min-h-0 flex-1 text-sm' : 'max-h-[46vh] min-h-[14rem] text-xs'
        }`}
      >
        {turns.length === 0 ? (
          <p className="py-6 text-center leading-relaxed text-brand-700/60">
            点「总结本页」快速抓取要点，
            <br />
            或在下方直接提问（基于当前网页内容作答）。
          </p>
        ) : (
          turns.map((turn) => <TurnBubble key={turn.id} turn={turn} />)
        )}
      </div>

      {/* 输入区 */}
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter 发送；Shift+Enter 换行
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
          rows={isPage ? 3 : 2}
          placeholder="就当前网页提问，Enter 发送 / Shift+Enter 换行…"
          className="min-h-[3.25rem] w-full flex-1 resize-y rounded-xl border border-brand-100 bg-white/90 p-2.5 text-xs leading-relaxed outline-none focus:border-brand-500"
        />
        {chat.streaming ? (
          <button
            type="button"
            onClick={chat.stop}
            className="shrink-0 rounded-xl border border-brand-100 bg-white px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50"
          >
            停止
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!draft.trim()}
            className="shrink-0 rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}

/** 单条消息：用户靠右、助手靠左；失败如实标注 */
function TurnBubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === 'user';
  const pending = !isUser && !turn.content && !turn.error;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 leading-relaxed ${
          isUser
            ? 'bg-brand-500 text-white'
            : 'border border-brand-100 bg-white text-brand-900'
        }`}
      >
        {pending ? (
          <span className="text-brand-700/60">正在生成…</span>
        ) : (
          turn.content || '（空回复）'
        )}
        {turn.error && (
          <span className="mt-1 block text-[11px] text-red-600">
            该轮失败：{turn.error}
          </span>
        )}
      </div>
    </div>
  );
}
