/**
 * 网页摘要 / 网页问答面板（Side Panel 与全页工作台共用）。
 *
 * 三态齐全：空（引导） / 流式（正在生成） / 错误（如实标注到对应轮次）。
 * 布局用 `min-h-0 + flex-1 + overflow-y-auto` 让消息区可滚动、输入区常驻底部。
 */
import { useEffect, useRef, useState } from 'react';
import { hostnameFromUrl } from '@/shared/siteAccess';
import { SegmentedControl } from '@/shared/ui';
import type {
  ChatContextScope,
  ChatPendingAction,
  ChatTurn,
} from '@/shared/storage/types';
import { isPageBreakTurn } from '../pageBreak';
import { SessionList } from './SessionList';
import { useChat } from './useChat';

/** 绑定页展示文案：标题 · host */
function formatBoundPageLabel(url: string, title: string): string {
  const host = hostnameFromUrl(url);
  if (title && host) return `${title} · ${host}`;
  return title || host || url;
}

export type ChatSurface = 'sidepanel' | 'workspace';

/** 空态建议提问：点一下填入输入框，避免用户面对空白不知从何问起 */
const SUGGESTIONS = [
  '这一页讲了什么？',
  '用三点总结关键结论',
  '有哪些值得注意的细节？',
] as const;

/** 上下文范围选项（与 `ChatContextScope` 对齐） */
const SCOPE_OPTIONS: { value: ChatContextScope; label: string; title: string }[] =
  [
    { value: 'page', label: '当前页', title: '以整页正文作为上下文' },
    { value: 'selection', label: '选区', title: '以当前选中的文字作为上下文' },
  ];

export function ChatPanel({
  surface,
  pendingAction,
  onPendingHandled,
}: {
  surface: ChatSurface;
  /** 外层消费信箱后下发的待执行动作（目前仅「总结本页」） */
  pendingAction?: ChatPendingAction | null;
  onPendingHandled?: () => void;
}) {
  const chat = useChat({ pendingAction, onPendingHandled });
  const [draft, setDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const isPage = surface === 'workspace';

  // 新内容到达（含流式增量）时贴底
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.session.turns]);

  // Esc 关闭历史覆盖层
  useEffect(() => {
    if (!showHistory) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowHistory(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showHistory]);

  async function handleSend() {
    const text = draft;
    if (!text.trim() || chat.streaming) return;
    // 发出去或被「来源不一致」拦下时才清空输入框；未受理（在途 / 空）则原样保留
    const status = await chat.send(text);
    if (status !== 'blocked') setDraft('');
  }

  /** 取消来源确认：把提问还回输入框，避免辛苦打的一行字凭空消失 */
  function handleCancelMismatch() {
    const pending = chat.mismatchConfirm;
    chat.cancelMismatch();
    if (pending?.question) setDraft(pending.question);
  }

  const scope = chat.prefs?.contextScope ?? 'page';
  const turns = chat.session.turns;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      {/* 上下文：一行 chip，信息项压到最低高度 */}
      <div className="shrink-0 rounded-card border border-line bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-label font-medium text-ink-2">上下文</span>
          <SegmentedControl
            value={scope}
            options={SCOPE_OPTIONS}
            disabled={!chat.prefs || chat.streaming}
            onChange={(next) => void chat.setScope(next)}
            ariaLabel="上下文范围"
            className="w-[10.5rem] shrink-0"
          />
          <p className="min-w-0 flex-1 truncate text-meta text-ink-2">
            {chat.contextLoading ? (
              '正在读取页面内容…'
            ) : chat.contextError ? (
              <span className="text-warn">{chat.contextError}</span>
            ) : chat.context ? (
              (chat.context.scope === 'selection' ? '选区' : '整页') +
              ' · ' +
              chat.context.segments.length +
              ' 段' +
              (chat.context.truncated ? ' · 已精简' : '')
            ) : (
              '尚未读取页面内容'
            )}
          </p>
          <button
            type="button"
            onClick={() => void chat.refreshContext()}
            disabled={chat.contextLoading || chat.streaming}
            className={
              chat.contextStale
                ? 'shrink-0 rounded-chip bg-warn-soft px-2 py-1 text-label font-medium text-warn ring-1 ring-warn/20 disabled:opacity-50'
                : 'shrink-0 rounded-chip px-2 py-1 text-label font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink disabled:opacity-50'
            }
          >
            重新读取
          </button>
        </div>

        {chat.contextStale && (
          <p
            data-testid="chat-context-stale"
            className="mt-1.5 text-label leading-relaxed text-warn"
          >
            页面已变化，上下文可能过期。请点「重新读取」后再提问。
          </p>
        )}

        {chat.boundPage?.url && (
          <p
            className="mt-1 truncate text-meta text-ink-2"
            title={chat.boundPage.url}
            data-testid="chat-bound-page"
          >
            绑定页：{formatBoundPageLabel(chat.boundPage.url, chat.boundPage.title)}
          </p>
        )}

        {chat.session.pageTitle && (
          <p className="mt-1 truncate text-meta text-ink-2">
            会话来源：{chat.session.pageTitle}
          </p>
        )}
      </div>

      {/* 操作行：总结为主，新对话 / 历史为 ghost */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={chat.streaming}
          onClick={() => void chat.summarize()}
          className="inline-flex h-8 items-center rounded-control bg-accent px-3 text-label font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
        >
          总结本页
        </button>
        <button
          type="button"
          onClick={chat.startNew}
          className="inline-flex h-8 items-center rounded-control border border-line bg-surface px-3 text-label font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink"
        >
          新对话
        </button>
        <button
          type="button"
          aria-expanded={showHistory}
          onClick={() => setShowHistory((current) => !current)}
          className={
            showHistory
              ? 'inline-flex h-8 items-center rounded-control border border-accent/30 bg-accent-soft px-3 text-label font-medium text-accent'
              : 'inline-flex h-8 items-center rounded-control border border-line bg-surface px-3 text-label font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink'
          }
        >
          历史{chat.sessions.length > 0 ? '（' + chat.sessions.length + '）' : ''}
        </button>
      </div>

      {chat.error && (
        <div
          data-testid="chat-error"
          className="rounded-control border border-danger/20 bg-danger-soft px-3 py-2 text-label leading-relaxed text-danger"
        >
          {chat.error}
        </div>
      )}

      {chat.mismatchConfirm && (
        <div
          data-testid="chat-mismatch-confirm"
          className="rounded-control border border-warn/20 bg-warn-soft px-3 py-2 text-label leading-relaxed text-warn"
        >
          <p className="font-semibold">该会话来自其他页面</p>
          <p className="mt-1 break-words">
            会话来源：{chat.mismatchConfirm.sessionUrl}
          </p>
          <p className="break-words">
            当前页面：{chat.mismatchConfirm.currentUrl}
          </p>
          <p className="mt-1">
            继续后将基于「当前页面」作答，并把该页记为会话来源。
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => chat.confirmMismatch()}
              className="rounded-control bg-warn px-2.5 py-1 text-label font-semibold text-on-warn transition hover:opacity-90"
            >
              仍要继续
            </button>
            <button
              type="button"
              onClick={() => chat.confirmMismatch({ remember: true })}
              className="rounded-control border border-warn/30 bg-surface px-2.5 py-1 text-label font-medium text-warn transition hover:bg-warn-soft"
            >
              本会话不再提示
            </button>
            <button
              type="button"
              onClick={handleCancelMismatch}
              className="rounded-control border border-line bg-surface px-2.5 py-1 text-label font-medium text-ink-2 transition hover:bg-surface-2"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 消息区 + 历史覆盖层：历史不占文档流，避免挤矮总结行与输入框 */}
      <div
        className={'relative min-h-0 flex-1 ' + (isPage ? '' : 'min-h-[10rem]')}
      >
        {showHistory && (
          <div
            data-testid="chat-history-overlay"
            className="absolute inset-0 z-20"
          >
            <SessionList
              fill
              sessions={chat.sessions}
              currentId={chat.session.id}
              onClose={() => setShowHistory(false)}
              onOpen={(id) => {
                setShowHistory(false);
                void chat.openSession(id);
              }}
              onRemove={(id) => void chat.removeSession(id)}
              onClear={() => void chat.clearSessions()}
              onDownload={(id) => void chat.downloadSession(id)}
              onDownloadAll={() => void chat.downloadAllSessions()}
            />
          </div>
        )}
        <div
          ref={scrollRef}
          className="h-full space-y-3 overflow-y-auto rounded-card border border-line bg-surface p-3"
        >
          {turns.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-body leading-relaxed text-ink-2">
                先总结这一页，或挑一个问题开始。
              </p>
              <div className="flex w-full max-w-sm flex-col gap-1.5">
                {SUGGESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => {
                      setDraft(question);
                      composerRef.current?.focus();
                    }}
                    className="rounded-chip border border-line bg-surface-2 px-3 py-2 text-left text-label text-ink-2 transition hover:border-line-strong hover:text-ink"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((turn) =>
              isPageBreakTurn(turn) ? (
                <PageBreakDivider key={turn.id} turn={turn} />
              ) : (
                <TurnBubble key={turn.id} turn={turn} />
              ),
            )
          )}
        </div>
      </div>

      {/* 输入区（钉在面板底部） */}
      <div className="flex shrink-0 items-end gap-2 rounded-card border border-line bg-surface p-2 transition focus-within:ring-2 focus-within:ring-accent/15">
        <textarea
          ref={composerRef}
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
          className="min-h-[3rem] w-full flex-1 resize-none border-0 bg-transparent p-1 text-body leading-[22px] text-ink outline-none placeholder:text-ink-2 focus-visible:outline-none"
        />
        {chat.streaming ? (
          <button
            type="button"
            onClick={chat.stop}
            className="inline-flex h-9 shrink-0 items-center rounded-control border border-line bg-surface px-3 text-label font-semibold text-ink-2 transition hover:bg-surface-2 hover:text-ink"
          >
            停止
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!draft.trim()}
            className="inline-flex h-9 shrink-0 items-center rounded-control bg-accent px-3 text-label font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}

/** 跨页分隔：居中细条，非气泡 */
function PageBreakDivider({ turn }: { turn: ChatTurn }) {
  return (
    <div
      data-testid="chat-turn-page-break"
      className="flex flex-col items-center gap-0.5 py-1"
      title={turn.pageUrl}
    >
      <div className="h-px w-full bg-line" />
      <p className="max-w-full truncate px-2 text-center text-meta font-medium text-ink-2">
        {turn.content}
      </p>
      <div className="h-px w-full bg-line" />
    </div>
  );
}

/** 单条消息：用户靠右用 surface-2 块，助手靠左不用卡片；失败如实标注 */
function TurnBubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === 'user';
  const pending = !isUser && !turn.content && !turn.error;

  return (
    <div
      // 稳定的测试标识：E2E 里需要单独断言「助手回复」
      data-testid={isUser ? 'chat-turn-user' : 'chat-turn-assistant'}
      className={'flex ' + (isUser ? 'justify-end' : 'justify-start')}
    >
      <div
        className={
          'max-w-[88%] whitespace-pre-wrap break-words text-body leading-[22px] ' +
          (isUser
            ? 'rounded-card rounded-br-sm bg-surface-2 px-3 py-2 text-ink'
            : 'px-0.5 py-0.5 text-ink')
        }
      >
        {pending ? (
          <span className="inline-flex items-center gap-1.5 text-ink-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            正在生成…
          </span>
        ) : (
          turn.content || '（空回复）'
        )}
        {turn.error && (
          <span className="mt-1 block text-label text-danger">
            该轮失败：{turn.error}
          </span>
        )}
      </div>
    </div>
  );
}
