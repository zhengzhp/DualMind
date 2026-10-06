/**
 * 侧栏「沉浸式翻译」控制区。
 *
 * 指令经 Background 转发到「当前活动标签页」的内容脚本；
 * 仅运行中才轮询进度，避免空闲时无谓往返。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatErrorForUi } from '@/shared/errors';
import { sendMessage } from '@/shared/messaging/client';
import type { ImmersiveDisplayMode } from '@/shared/storage/types';
import { SegmentedControl, type SegmentedControlOption } from '@/shared/ui';
import { IDLE_IMMERSIVE_STATUS, type ImmersiveStatus } from '../types';

const MODE_OPTIONS: SegmentedControlOption<ImmersiveDisplayMode>[] = [
  { value: 'bilingual', label: '双语对照' },
  { value: 'translation-only', label: '仅译文' },
];

/** 运行中轮询进度的间隔（毫秒） */
const POLL_INTERVAL_MS = 1000;

export function ImmersiveControl() {
  const [status, setStatus] = useState<ImmersiveStatus>(IDLE_IMMERSIVE_STATUS);
  const [mode, setMode] = useState<ImmersiveDisplayMode>('bilingual');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const next = await sendMessage('immersive:status', undefined);
      setStatus(next);
      setMode(next.displayMode);
    } catch (err) {
      setError(formatErrorForUi(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const prefs = await sendMessage('immersive:prefs:get', undefined);
        setMode(prefs.displayMode);
      } catch {
        /* 偏好读取失败不阻塞：状态查询会带回当前模式 */
      }
      await refresh();
    })();
  }, [refresh]);

  // 仅在翻译进行中轮询进度，结束后自动停止
  useEffect(() => {
    window.clearInterval(pollRef.current);
    if (!status.running) return undefined;
    pollRef.current = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(pollRef.current);
  }, [status.running, refresh]);

  const runCommand = useCallback(
    async (command: 'start' | 'stop', nextMode?: ImmersiveDisplayMode) => {
      setBusy(true);
      setError('');
      try {
        const next = await sendMessage('immersive:command', {
          command,
          displayMode: nextMode ?? mode,
        });
        setStatus(next);
        setMode(next.displayMode);
      } catch (err) {
        setError(formatErrorForUi(err));
      } finally {
        setBusy(false);
      }
    },
    [mode],
  );

  async function handleMode(next: ImmersiveDisplayMode) {
    setMode(next);
    try {
      await sendMessage('immersive:prefs:save', { displayMode: next });
    } catch (err) {
      setError(formatErrorForUi(err));
      return;
    }
    // 已翻译时立即切换展示模式
    if (status.active) await runCommand('start', next);
  }

  const message = error || status.error || '';

  return (
    <div className="rounded-xl border border-brand-100/80 bg-white/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-semibold text-brand-900">沉浸翻译</span>
          <span className="truncate text-[11px] text-brand-700/70">
            {status.running
              ? `翻译中 ${status.done}/${status.total}`
              : status.active
                ? status.untranslated > 0
                  ? `已翻译当前网页 · ${status.untranslated} 段未翻译`
                  : '已翻译当前网页'
                : '翻译整个网页'}
          </span>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runCommand(status.active ? 'stop' : 'start')}
          className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
            status.active
              ? 'border border-brand-100 bg-white text-brand-700 hover:bg-brand-50'
              : 'bg-brand-500 text-white hover:bg-brand-600'
          }`}
        >
          {status.active ? '显示原文' : '开始翻译'}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="w-10 shrink-0 text-xs font-medium text-brand-700">
          展示
        </span>
        <SegmentedControl
          value={mode}
          options={MODE_OPTIONS}
          disabled={busy}
          onChange={(next) => void handleMode(next)}
          ariaLabel="沉浸式展示模式"
          className="min-w-0 flex-1"
        />
      </div>

      {!status.available && (
        <p className="mt-2 text-[11px] leading-relaxed text-brand-700/70">
          未检测到当前网页的内容脚本；请刷新网页，或切换到普通网页后重试。
        </p>
      )}
      {status.active && status.untranslated > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-700">
          有 {status.untranslated} 段未能翻译（模型回显或单段失败），已在网页中以「未翻译」角标标出。
        </p>
      )}
      {message && (
        <p className="mt-2 text-[11px] leading-relaxed text-red-600">
          {message}
        </p>
      )}
    </div>
  );
}
