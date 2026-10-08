/**
 * 本页 Agent 面板：计划批准 / 步骤时间线 / 危险确认 / 停止
 */
import { useEffect, useRef, useState } from 'react';
import { hostnameFromUrl } from '@/shared/siteAccess';
import type { AgentPendingAction } from '@/shared/storage/types';
import type { AgentTimelineItem } from '../types';
import { useAgent } from './useAgent';

export type AgentSurface = 'sidepanel' | 'workspace';

function kindClass(kind: AgentTimelineItem['kind']): string {
  switch (kind) {
    case 'error':
    case 'blocked':
      return 'text-red-700';
    case 'danger':
      return 'text-amber-700';
    case 'plan':
      return 'text-brand-800 font-medium';
    case 'result':
      return 'text-emerald-800';
    default:
      return 'text-brand-800/90';
  }
}

export function AgentPanel({
  surface,
  pendingAction,
  onPendingHandled,
}: {
  surface: AgentSurface;
  pendingAction?: AgentPendingAction | null;
  onPendingHandled?: () => void;
}) {
  const agent = useAgent({ pendingAction, onPendingHandled });
  const [goal, setGoal] = useState('');
  /** 能力说明默认折叠，把纵向空间留给时间线 */
  const [showHelp, setShowHelp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPage = surface === 'workspace';

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [agent.timeline, agent.plan, agent.danger]);

  const pageLabel = agent.boundPage
    ? [
        agent.boundPage.title,
        hostnameFromUrl(agent.boundPage.url),
      ]
        .filter(Boolean)
        .join(' · ')
    : agent.phase === 'planning' ? '正在绑定目标网页…' : '未绑定可读网页（请先打开 http(s) 页面）';

  const enabled = agent.prefs?.enabled !== false;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      {/* 顶栏：默认两行紧凑；长说明收入「说明」折叠 */}
      <div className="shrink-0 rounded-xl border border-brand-100/80 bg-white/70 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <p className="shrink-0 text-xs font-medium text-brand-800">
              本页操作 Agent
            </p>
            <p
              className="min-w-0 truncate text-[11px] text-brand-700/70"
              title={pageLabel}
            >
              {pageLabel}
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-brand-700">
            <input
              type="checkbox"
              className="rounded border-brand-200"
              checked={enabled}
              disabled={!agent.prefs || agent.busy}
              onChange={(e) => void agent.setEnabled(e.target.checked)}
            />
            启用
          </label>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
          <button
            type="button"
            className="text-brand-600 underline-offset-2 hover:underline disabled:opacity-40"
            onClick={() => void agent.refreshPage()}
            disabled={agent.busy}
          >
            刷新绑定页
          </button>
          <span className="text-brand-700/40">·</span>
          <span className="text-brand-700/55">
            上限 {agent.prefs?.maxSteps ?? 20} 步
          </span>
          <span className="text-brand-700/40">·</span>
          <button
            type="button"
            className="text-brand-600 underline-offset-2 hover:underline"
            aria-expanded={showHelp}
            onClick={() => setShowHelp((v) => !v)}
          >
            说明 {showHelp ? '▴' : '▾'}
          </button>
        </div>
        {showHelp && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-brand-700/75">
            需支持 tool calling 的模型。流程：生成计划 → 你批准 → 本页逐步操作。删除
            等危险动作会再次弹窗确认；
            <span className="font-medium text-rose-700">
              支付 / 下单 / 转账等资金类动作直接拒绝
            </span>
            ，不会执行、也无法通过确认放行。不支持 Shadow DOM / 跨域 iframe。
          </p>
        )}
      </div>

      {!enabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Agent 已关闭。勾选上方「启用」后再试。
        </div>
      )}

      {/* 计划卡：正文限高可滚，按钮吸底，避免长计划把「批准」顶出视口 */}
      {agent.phase === 'awaiting_plan' && agent.plan && (
        <div className="flex shrink-0 flex-col rounded-xl border border-brand-200 bg-brand-50/80 p-3">
          <p className="shrink-0 text-xs font-medium text-brand-900">
            请确认执行计划
          </p>
          <pre className="mt-2 max-h-[40vh] min-h-0 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-brand-800">
            {agent.planText}
          </pre>
          <div className="mt-3 flex shrink-0 gap-2">
            <button
              type="button"
              className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800"
              onClick={() => agent.approvePlan()}
            >
              批准并执行
            </button>
            <button
              type="button"
              className="rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-xs text-brand-800"
              onClick={() => agent.rejectPlan()}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {agent.result && (
        <p className={`shrink-0 rounded-lg px-3 py-2 text-xs ${agent.result === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
          {agent.result === 'success' ? '任务成功完成' : agent.result === 'cancelled' ? '任务已取消；已发生的页面动作无法撤销' : '任务未完成，请查看步骤记录后重试'}
        </p>
      )}
      {/* 危险确认：理由过长时可滚，操作按钮始终可见 */}
      {agent.danger && (
        <div
          data-testid="agent-danger"
          className="flex shrink-0 flex-col rounded-xl border border-amber-300 bg-amber-50 p-3"
        >
          <p className="shrink-0 text-xs font-medium text-amber-900">
            危险动作待确认
          </p>
          <div className="mt-1 max-h-[30vh] min-h-0 overflow-y-auto">
            <p className="text-xs text-amber-900/90">{agent.danger.summary}</p>
            {agent.danger.reasons.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-[11px] text-amber-800/90">
                {agent.danger.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-3 flex shrink-0 gap-2">
            <button
              type="button"
              className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800"
              onClick={() => agent.confirmDanger()}
            >
              仍要执行
            </button>
            <button
              type="button"
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900"
              onClick={() => agent.rejectDanger()}
            >
              跳过
            </button>
          </div>
        </div>
      )}

      {/* 时间线 */}
      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 overflow-y-auto rounded-xl border border-brand-100/80 bg-white/50 p-3 ${
          isPage ? '' : ''
        }`}
      >
        {agent.timeline.length === 0 ? (
          <p className="text-xs leading-relaxed text-brand-700/65">
            输入目标后开始。建议先在本页做只读或填表练习，
            <span className="font-medium">不要提交</span>
            真实订单或支付。
          </p>
        ) : (
          <ul className="space-y-2">
            {agent.timeline.map((entry) => (
              <li
                key={entry.id}
                className={`text-xs leading-relaxed ${kindClass(entry.kind)}`}
              >
                <span className="mr-1.5 text-[10px] uppercase tracking-wide text-brand-500/70">
                  {entry.kind}
                </span>
                {entry.summary}
              </li>
            ))}
          </ul>
        )}
        {agent.error && (
          <p className="mt-2 text-xs text-red-700">{agent.error}</p>
        )}
      </div>

      {/* 输入区 */}
      <div className="shrink-0 rounded-xl border border-brand-100/80 bg-white/80 p-2.5">
        <textarea
          className="min-h-[64px] w-full resize-none rounded-lg border border-brand-100 bg-white px-2.5 py-2 text-sm text-brand-900 outline-none focus:border-brand-300"
          placeholder="例如：把联系人表单填上张三和 test@example.com，不要提交"
          value={goal}
          disabled={agent.busy || !enabled || !agent.prefs}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              agent.start(goal);
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-brand-600/60">
            {agent.phase === 'idle' || agent.phase === 'done' || agent.phase === 'error' || agent.phase === 'aborted'
              ? '⌘/Ctrl + Enter 开始'
              : `状态：${agent.phase}`}
          </p>
          <div className="flex gap-2">
            {agent.busy ? (
              <button
                type="button"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700"
                onClick={() => agent.stop()}
              >
                停止
              </button>
            ) : (
              <button
                type="button"
                className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                disabled={!goal.trim() || !enabled || !agent.prefs}
                onClick={() => agent.start(goal)}
              >
                开始
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
