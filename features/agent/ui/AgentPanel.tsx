/**
 * 本页 Agent 面板：计划批准 / 步骤时间线 / 危险确认 / 停止
 */
import { useEffect, useRef, useState } from 'react';
import { hostnameFromUrl } from '@/shared/siteAccess';
import type { AgentPendingAction } from '@/shared/storage/types';
import type { AgentTimelineItem } from '../types';
import { useAgent } from './useAgent';

export type AgentSurface = 'sidepanel' | 'workspace';

/** 时间线只给图标上色，正文保持中性，避免整行变成「报警条」 */
function kindIconClass(kind: AgentTimelineItem['kind']): string {
  switch (kind) {
    case 'error':
    case 'blocked':
      return 'text-danger';
    case 'danger':
      return 'text-warn';
    case 'plan':
      return 'text-accent';
    case 'result':
      return 'text-success';
    default:
      return 'text-ink-3';
  }
}

function kindTextClass(kind: AgentTimelineItem['kind']): string {
  switch (kind) {
    case 'error':
    case 'blocked':
      return 'text-danger';
    case 'danger':
      return 'text-warn';
    default:
      return 'text-ink-2';
  }
}

/** 12px 线性图标：同一套笔画规则，尺寸与正文首行对齐 */
function KindIcon({ kind }: { kind: AgentTimelineItem['kind'] }) {
  const path = (() => {
    switch (kind) {
      case 'error':
      case 'blocked':
        return 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm-2 5 4 4m0-4-4 4';
      case 'danger':
        return 'M10 3l7 13H3l7-13Zm0 4v4m0 2.5v.5';
      case 'plan':
        return 'M4 5h12M4 10h12M4 15h8';
      case 'result':
        return 'M4 10.5l3.5 3.5L16 5.5';
      default:
        return 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 6v4m0-7v.5';
    }
  })();
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-3.5 w-3.5"
    >
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AgentPanel({
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
    : agent.phase === 'planning'
      ? '正在绑定目标网页…'
      : '未绑定可读网页（请先打开 http(s) 页面）';

  const enabled = agent.prefs?.enabled !== false;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      {/* 顶栏：标题 + 绑定页 chip + 启用开关；长说明收入「说明」折叠 */}
      <div className="shrink-0 rounded-card border border-line bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <p className="shrink-0 text-body font-medium text-ink">
              本页操作 Agent
            </p>
            <span
              className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-chip bg-surface-2 px-2 py-0.5 text-meta text-ink-2"
              title={pageLabel}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span className="truncate">{pageLabel}</span>
            </span>
          </div>
          <label className="flex shrink-0 items-center gap-1.5 text-label text-ink-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={enabled}
              disabled={!agent.prefs || agent.busy}
              onChange={(e) => void agent.setEnabled(e.target.checked)}
            />
            启用
          </label>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-label">
          <button
            type="button"
            className="text-ink-2 underline-offset-2 transition hover:text-ink hover:underline disabled:opacity-40"
            onClick={() => void agent.refreshPage()}
            disabled={agent.busy}
          >
            刷新绑定页
          </button>
          <span className="text-ink-3">·</span>
          <span className="tabular-nums text-ink-2">
            上限 {agent.prefs?.maxSteps ?? 20} 步
          </span>
          <span className="text-ink-3">·</span>
          <button
            type="button"
            className="text-ink-2 underline-offset-2 transition hover:text-ink hover:underline"
            aria-expanded={showHelp}
            onClick={() => setShowHelp((v) => !v)}
          >
            说明 {showHelp ? '▴' : '▾'}
          </button>
        </div>
        {showHelp && (
          <p className="mt-1.5 text-meta leading-relaxed text-ink-2">
            需支持 tool calling 的模型。流程：生成计划 → 你批准 → 本页逐步操作。删除
            等危险动作会再次弹窗确认；
            <span className="font-medium text-danger">
              支付 / 下单 / 转账等资金类动作直接拒绝
            </span>
            ，不会执行、也无法通过确认放行。不支持 Shadow DOM / 跨域 iframe。
          </p>
        )}
      </div>

      {!enabled && (
        <div className="rounded-control border border-warn/20 bg-warn-soft px-3 py-2 text-label leading-relaxed text-warn">
          Agent 已关闭。勾选上方「启用」后再试。
        </div>
      )}

      {/* 计划卡：白卡 + 编号步骤；正文限高可滚，按钮吸底 */}
      {agent.phase === 'awaiting_plan' && agent.plan && (
        <div className="flex shrink-0 flex-col rounded-card border border-line bg-surface p-3 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <p className="text-body font-medium text-ink">请确认执行计划</p>
            <span className="rounded-chip bg-accent-soft px-2 py-0.5 text-meta font-medium text-accent">
              计划
            </span>
          </div>
          <ol className="mt-2 max-h-[40vh] min-h-0 space-y-1.5 overflow-y-auto pr-1">
            {agent.plan.steps.map((step, index) => (
              <li
                key={index}
                className="flex gap-2 text-body leading-[22px] text-ink-2"
              >
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-meta font-semibold tabular-nums text-ink-2">
                  {index + 1}
                </span>
                <span className="min-w-0 break-words">{step}</span>
              </li>
            ))}
          </ol>
          {agent.plan.notes && (
            <p className="mt-2 rounded-chip bg-surface-2 px-2.5 py-1.5 text-meta leading-relaxed text-ink-2">
              备注：{agent.plan.notes}
            </p>
          )}
          <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-line pt-3">
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-control border border-line bg-surface px-3 text-label font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink"
              onClick={() => agent.rejectPlan()}
            >
              取消
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-control bg-accent px-3 text-label font-semibold text-on-accent transition hover:bg-accent-hover"
              onClick={() => agent.approvePlan()}
            >
              批准并执行
            </button>
          </div>
        </div>
      )}

      {agent.result && (
        <p
          className={
            'shrink-0 rounded-control px-3 py-2 text-label leading-relaxed ' +
            (agent.result === 'success'
              ? 'border border-success/20 bg-success-soft text-success'
              : agent.result === 'cancelled'
                ? 'border border-warn/20 bg-warn-soft text-warn'
                : 'border border-danger/20 bg-danger-soft text-danger')
          }
        >
          {agent.result === 'success'
            ? '任务成功完成'
            : agent.result === 'cancelled'
              ? '任务已取消；已发生的页面动作无法撤销'
              : '任务未完成，请查看步骤记录后重试'}
        </p>
      )}

      {/* 危险确认：浅底深字；跳过在左、仍要执行在右（危险动作） */}
      {agent.danger && (
        <div
          data-testid="agent-danger"
          className="flex shrink-0 flex-col rounded-card border border-warn/25 bg-warn-soft p-3"
        >
          <div className="flex items-center gap-2">
            <span className="rounded-chip bg-warn px-2 py-0.5 text-meta font-semibold text-on-warn">
              危险动作
            </span>
            <p className="text-body font-medium text-warn">需要再次确认</p>
          </div>
          <div className="mt-1.5 max-h-[30vh] min-h-0 overflow-y-auto">
            <p className="text-body leading-[22px] text-warn">
              {agent.danger.summary}
            </p>
            {agent.danger.reasons.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-label leading-relaxed text-warn/90">
                {agent.danger.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-warn/20 pt-3">
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-control border border-warn/30 bg-surface px-3 text-label font-medium text-warn transition hover:bg-warn-soft"
              onClick={() => agent.rejectDanger()}
            >
              跳过
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-control bg-danger px-3 text-label font-semibold text-on-danger transition hover:opacity-90"
              onClick={() => agent.confirmDanger()}
            >
              仍要执行
            </button>
          </div>
        </div>
      )}

      {/* 时间线：12px 图标 + 文字，只有图标上语义色 */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-card border border-line bg-surface p-3"
      >
        {agent.timeline.length === 0 ? (
          <p className="text-body leading-relaxed text-ink-2">
            输入目标后开始。建议先在本页做只读或填表练习，
            <span className="font-medium text-ink">不要提交</span>
            真实订单或支付。
          </p>
        ) : (
          <ul className="space-y-2">
            {agent.timeline.map((entry) => (
              <li
                key={entry.id}
                className="flex gap-2 text-body leading-[22px]"
              >
                <span
                  className={
                    'mt-0.5 shrink-0 ' + kindIconClass(entry.kind)
                  }
                >
                  <KindIcon kind={entry.kind} />
                </span>
                <div className="min-w-0">
                  <span className="mr-1.5 text-meta uppercase tracking-wide text-ink-2">
                    {entry.kind}
                  </span>
                  <span className={kindTextClass(entry.kind)}>
                    {entry.summary}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {agent.error && (
          <p
            data-testid="agent-error"
            className="mt-2 text-label leading-relaxed text-danger"
          >
            {agent.error}
          </p>
        )}
      </div>

      {/* 输入区：卡片本身承担 focus 外圈，textarea 不再套一层边框 */}
      <div className="shrink-0 rounded-card border border-line bg-surface p-2.5 transition focus-within:ring-2 focus-within:ring-accent/15">
        <textarea
          className="min-h-[64px] w-full resize-none border-0 bg-transparent p-1 text-body leading-[22px] text-ink outline-none placeholder:text-ink-2 focus-visible:outline-none"
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
          <p className="text-meta text-ink-2">
            {agent.phase === 'idle' ||
            agent.phase === 'done' ||
            agent.phase === 'error' ||
            agent.phase === 'aborted'
              ? '⌘/Ctrl + Enter 开始'
              : '状态：' + agent.phase}
          </p>
          <div className="flex gap-2">
            {agent.busy ? (
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-control border border-danger/20 bg-danger-soft px-3 text-label font-medium text-danger transition hover:opacity-90"
                onClick={() => agent.stop()}
              >
                停止
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-control bg-accent px-3 text-label font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-40"
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
