/**
 * 会话历史列表（本地持久化的全局会话，含来源页面）。
 * 纯展示 + 事件回调，状态由 `useChat` 持有。
 */
import type { ChatSessionSummary } from '@/shared/storage/types';

/** 简短时间标记：同一天只显示时分，跨天显示月/日 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  return sameDay ? time : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

export interface SessionListProps {
  sessions: ChatSessionSummary[];
  currentId: string;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  /** 导出单条为 Markdown 并触发本机下载 */
  onDownload: (id: string) => void;
  /** 导出全部会话为单个 Markdown */
  onDownloadAll: () => void;
}

export function SessionList({
  sessions,
  currentId,
  onOpen,
  onRemove,
  onClear,
  onDownload,
  onDownloadAll,
}: SessionListProps) {
  return (
    <div className="rounded-xl border border-brand-100 bg-white/90 p-2">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <span className="text-xs font-semibold text-brand-900">
          历史会话（{sessions.length}）
        </span>
        {sessions.length > 0 && (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={onDownloadAll}
              className="rounded-md px-2 py-0.5 text-[11px] font-medium text-brand-600 hover:bg-brand-50"
            >
              下载全部
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-md px-2 py-0.5 text-[11px] font-medium text-brand-600 hover:bg-brand-50"
            >
              清空全部
            </button>
          </div>
        )}
      </div>

      {sessions.length === 0 ? (
        <p className="px-1 py-3 text-center text-[11px] text-brand-700/60">
          还没有历史会话；提问后会自动保存在本机。
        </p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {sessions.map((item) => (
            <li key={item.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition ${
                  item.id === currentId
                    ? 'bg-brand-50'
                    : 'hover:bg-brand-50/70'
                }`}
              >
                <span className="block truncate text-xs font-medium text-brand-900">
                  {item.title}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-brand-700/60">
                  {item.pageTitle || '未记录页面'} · {item.turnCount} 条 ·{' '}
                  {formatTime(item.updatedAt)}
                </span>
              </button>
              <button
                type="button"
                aria-label={`下载会话 ${item.title}`}
                onClick={() => onDownload(item.id)}
                className="shrink-0 rounded-md px-1.5 py-1 text-[11px] font-medium text-brand-600 hover:bg-brand-50"
              >
                下载
              </button>
              <button
                type="button"
                aria-label={`删除会话 ${item.title}`}
                onClick={() => onRemove(item.id)}
                className="shrink-0 rounded-md px-1.5 py-1 text-[11px] font-medium text-brand-600 hover:bg-red-50 hover:text-red-600"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
