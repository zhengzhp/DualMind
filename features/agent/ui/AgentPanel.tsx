/**
 * 本页 Agent 面板：计划批准 / 步骤时间线 / 危险确认 / 停止
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CircleAlert, Info, List, TriangleAlert } from 'lucide-react';
import { hostnameFromUrl } from '@/shared/siteAccess';
import { controlHeight } from '@/shared/ui';
import type { AgentPendingAction } from '@/shared/storage/types';
import type { AgentTimelineItem } from '../types';
import {
  downloadAgentCsv,
  downloadAgentExport,
  findAgentExportTable,
} from '../export';
import { TimelineSummary } from './TimelineSummary';
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

/**
 * 空态示例：点一下就把完整目标填进输入框。
 * 只描述任务、不规定输出格式：示例保持自然；
 * 模型碰巧输出表格时才出现「导出 CSV」，不保证每条任务都有。
 * 最后一条是用户明确要的「正文 → Markdown 清单」，保留 Markdown 字样。
 */
const GOAL_EXAMPLES = [
  {
    label: '套餐对比',
    goal: '对比本页两个套餐，哪个更划算？按我的用量给建议。',
  },
  {
    label: '页内搜索',
    goal: '在搜索框输入「退款政策」，打开第一条结果并总结关键条款。',
  },
  {
    label: '评论关键词',
    goal: '往下翻 20 条评论，告诉我大家最常抱怨什么。',
  },
  {
    label: '批量勾选',
    goal: '勾选列表里所有「未读」条目，先不要提交。',
  },
  {
    label: '提取正文清单',
    goal: '把本页正文提取成 Markdown 清单，我要导出保存。',
  },
] as const;

/**
 * 时间线图标：统一用 Lucide（与 Select / Tooltip 等控件同一套图标源），
 * 描边 1.6、14px，和文字首行对齐（P2.21）。
 */
function KindIcon({ kind }: { kind: AgentTimelineItem['kind'] }) {
  const Icon =
    kind === 'error' || kind === 'blocked'
      ? CircleAlert
      : kind === 'danger'
        ? TriangleAlert
        : kind === 'plan'
          ? List
          : kind === 'result'
            ? Check
            : Info;
  return <Icon aria-hidden="true" strokeWidth={1.6} className="h-3.5 w-3.5" />;
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
  /** 动作按钮高度：侧栏 32px / 全页工作台 40px（P1.13） */
  const actionHeight = controlHeight(surface);
  const [goal, setGoal] = useState('');
  /** 能力说明默认折叠，把纵向空间留给时间线 */
  const [showHelp, setShowHelp] = useState(false);
  /** 「已导出」短暂反馈，避免用户连点；区分 Markdown / CSV */
  const [exported, setExported] = useState<'md' | 'csv' | null>(null);
  const exportTimerRef = useRef<number | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** 最近一张结果表：有表才显示「导出 CSV」 */
  const csvTable = useMemo(
    () => findAgentExportTable(agent.timeline),
    [agent.timeline],
  );
  /** 点「试试」示例后把焦点送回输入框，键盘用户可直接改词再运行 */
  const goalRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [agent.timeline, agent.plan, agent.danger]);

  // 卸载时清掉「已导出」计时器，避免 focus / 状态泄漏
  useEffect(() => () => window.clearTimeout(exportTimerRef.current), []);

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

  /** 导出当前任务的计划 + 时间线 + 最终结论（本机 Markdown，不经过后台） */
  function handleExport() {
    downloadAgentExport({
      pageLabel,
      goal,
      planSteps: agent.plan?.steps,
      items: agent.timeline,
      result: agent.result,
      error: agent.error,
    });
    setExported('md');
    window.clearTimeout(exportTimerRef.current);
    exportTimerRef.current = window.setTimeout(() => setExported(null), 1500);
  }

  /** 只导出最近一张结果表；按钮仅在有表时出现，这里再兜底一次 */
  function handleExportCsv() {
    if (!downloadAgentCsv({ pageLabel, items: agent.timeline })) return;
    setExported('csv');
    window.clearTimeout(exportTimerRef.current);
    exportTimerRef.current = window.setTimeout(() => setExported(null), 1500);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 顶栏：标题 + 绑定页 chip + 启用开关；长说明收入「说明」折叠 */}
      <div className="shrink-0 rounded-card border border-line bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <p className="shrink-0 text-body font-semibold text-ink">
              本页操作 Agent
            </p>
            <span
              data-testid="agent-bound-page"
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
          <span className="dm-separator" aria-hidden="true">
            ·
          </span>
          <span className="tabular-nums text-ink-2">
            上限 {agent.prefs?.maxSteps ?? 20} 步
          </span>
          <span className="dm-separator" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            className="text-ink-2 underline-offset-2 transition hover:text-ink hover:underline"
            aria-expanded={showHelp}
            onClick={() => setShowHelp((v) => !v)}
          >
            说明 {showHelp ? '▴' : '▾'}
          </button>
          {/* 跑过至少一步才出现：避免空任务导出空文件 */}
          {agent.timeline.length > 0 && (
            <>
              <span className="dm-separator" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                onClick={handleExport}
                className="text-ink-2 underline-offset-2 transition hover:text-ink hover:underline"
              >
                {exported === 'md' ? '已导出' : '导出记录'}
              </button>

            </>
          )}
        </div>
        {showHelp && (
          <p className="mt-1.5 text-meta leading-relaxed text-ink-2">
            需支持 tool calling 的模型。流程：生成计划 → 你批准 → 本页逐步操作。删除
            等危险动作会再次弹窗确认；
            <span className="font-semibold text-danger">
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
            <p className="text-body font-semibold text-ink">请确认执行计划</p>
            <span className="rounded-chip bg-accent-soft px-2 py-0.5 text-meta font-semibold text-accent">
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
              className={`inline-flex ${actionHeight} items-center rounded-control border border-line bg-surface px-3 text-label font-semibold text-ink-2 transition hover:bg-surface-2 hover:text-ink`}
              onClick={() => agent.rejectPlan()}
            >
              取消
            </button>
            <button
              type="button"
              className={`inline-flex ${actionHeight} items-center rounded-control bg-accent px-3 text-label font-semibold text-on-accent transition hover:bg-accent-hover`}
              onClick={() => agent.approvePlan()}
            >
              批准并执行
            </button>
          </div>
        </div>
      )}

      {agent.result && (
        // CSV 放在结果条里：只在有表格时出现，也不会把顶部元信息行挤到换行
        <div
          className={
            'flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-control px-3 py-2 text-label leading-relaxed ' +
            (agent.result === 'success'
              ? 'border border-success/20 bg-success-soft text-success'
              : agent.result === 'cancelled'
                ? 'border border-warn/20 bg-warn-soft text-warn'
                : 'border border-danger/20 bg-danger-soft text-danger')
          }
        >
          <p>
            {agent.result === 'success'
              ? '任务成功完成'
              : agent.result === 'cancelled'
                ? '任务已取消；已发生的页面动作无法撤销'
                : '任务未完成，请查看步骤记录后重试'}
          </p>
          {csvTable && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="shrink-0 rounded-chip px-1.5 py-0.5 font-semibold underline underline-offset-2 opacity-80 transition hover:opacity-100"
            >
              {exported === 'csv' ? '已导出' : '导出 CSV'}
            </button>
          )}
        </div>
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
            <p className="text-body font-semibold text-warn">需要再次确认</p>
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
              className={`inline-flex ${actionHeight} items-center rounded-control border border-warn/30 bg-surface px-3 text-label font-semibold text-warn transition hover:bg-warn-soft`}
              onClick={() => agent.rejectDanger()}
            >
              跳过
            </button>
            <button
              type="button"
              className={`inline-flex ${actionHeight} items-center rounded-control bg-danger px-3 text-label font-semibold text-on-danger transition hover:opacity-90`}
              onClick={() => agent.confirmDanger()}
            >
              仍要执行（不可撤销）
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
          // 空态：说明 + 可点场景。放在时间线里而不是输入框下方，
          // 避免 600px 高的侧栏被示例撑满、把时间线挤成一条缝。
          <div className="flex flex-col gap-2">
            <p className="text-body leading-relaxed text-ink-2">
              输入目标后开始。可以先从只读的对比 / 提取开始，
              <span className="font-semibold text-ink">不要提交</span>
              真实订单或支付。
            </p>
            {!goal.trim() && !agent.busy && enabled && agent.prefs && (
              // 5 个示例：2×2 + 最后一条整行，避免 2+2+1 的孤行。
              // 完整目标在点击后填入，标签只负责让人「想到能做什么」。
              <div className="flex flex-col gap-1.5">
                <span className="text-meta text-ink-2">
                  试试这些场景（点一下填入目标）：
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {GOAL_EXAMPLES.map((example, index) => (
                    <button
                      key={example.label}
                      type="button"
                      onClick={() => {
                        setGoal(example.goal);
                        goalRef.current?.focus();
                      }}
                      className={
                        'flex min-h-8 w-full items-center rounded-chip border border-line bg-surface-2 px-2.5 text-label font-semibold text-ink-2 transition hover:border-line-strong hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ' +
                        (index === GOAL_EXAMPLES.length - 1 &&
                        GOAL_EXAMPLES.length % 2 === 1
                          ? 'col-span-2'
                          : '')
                      }
                    >
                      {example.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
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
                  {/* 结论里的 Markdown 表格渲染成真表格；其余文本保留换行 */}
                  <TimelineSummary
                    text={entry.summary}
                    className={kindTextClass(entry.kind)}
                  />
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
          ref={goalRef}
          data-testid="agent-goal"
          className="min-h-[64px] w-full resize-none border-0 bg-transparent p-1 text-body leading-[22px] text-ink outline-none placeholder:text-ink-2 focus-visible:outline-none"
          placeholder="例如：对比套餐哪个划算，或把正文提取成清单"
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
                className={`inline-flex ${actionHeight} items-center rounded-control border border-danger/20 bg-danger-soft px-3 text-label font-semibold text-danger transition hover:opacity-90`}
                onClick={() => agent.stop()}
              >
                停止
              </button>
            ) : (
              <button
                type="button"
                className={`inline-flex ${actionHeight} items-center rounded-control bg-accent px-3 text-label font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-40`}
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
