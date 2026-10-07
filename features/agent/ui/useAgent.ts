/**
 * Agent 面板状态（计划 / 危险确认 / 时间线）
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { sendMessage } from '@/shared/messaging/client';
import type { AgentPortServerMessage } from '@/shared/messaging/protocol';
import type { AgentPrefs, AgentPendingAction } from '@/shared/storage/types';
import { startAgentTask, type AgentTaskHandles } from '../client';
import { formatPlanForUi } from '../prompts';
import type {
  AgentPlan,
  AgentTaskPhase,
  AgentTimelineItem,
} from '../types';

export interface DangerPrompt {
  stepId: string;
  tool: string;
  summary: string;
  reasons: string[];
}

export interface AgentController {
  prefs: AgentPrefs | null;
  boundPage: { url: string; title: string } | null;
  phase: AgentTaskPhase;
  plan: AgentPlan | null;
  planText: string;
  timeline: AgentTimelineItem[];
  danger: DangerPrompt | null;
  error: string;
  busy: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  refreshPage: () => Promise<void>;
  start: (goal: string) => void;
  approvePlan: () => void;
  rejectPlan: () => void;
  confirmDanger: () => void;
  rejectDanger: () => void;
  stop: () => void;
}

export function useAgent(options?: {
  pendingAction?: AgentPendingAction | null;
  onPendingHandled?: () => void;
}): AgentController {
  const [prefs, setPrefs] = useState<AgentPrefs | null>(null);
  const [boundPage, setBoundPage] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [phase, setPhase] = useState<AgentTaskPhase>('idle');
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [timeline, setTimeline] = useState<AgentTimelineItem[]>([]);
  const [danger, setDanger] = useState<DangerPrompt | null>(null);
  const [error, setError] = useState('');
  const handlesRef = useRef<AgentTaskHandles | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const handledPendingRef = useRef(0);

  const busy =
    phase === 'planning' ||
    phase === 'awaiting_plan' ||
    phase === 'running' ||
    phase === 'awaiting_danger';

  const refreshPage = useCallback(async () => {
    try {
      const info = await sendMessage('chat:page-info', undefined);
      setBoundPage(info);
    } catch {
      setBoundPage(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setPrefs(await sendMessage('agent:prefs:get', undefined));
      } catch {
        setPrefs(null);
      }
      await refreshPage();
    })();
  }, [refreshPage]);

  const resetTaskUi = () => {
    setPlan(null);
    setTimeline([]);
    setDanger(null);
    setError('');
  };

  const onMessage = useCallback((msg: AgentPortServerMessage) => {
    if (msg.type === 'phase') {
      setPhase(msg.phase);
      return;
    }
    if (msg.type === 'plan') {
      setPlan(msg.plan);
      setPhase('awaiting_plan');
      return;
    }
    if (msg.type === 'timeline') {
      setTimeline((prev) => [...prev, msg.item]);
      return;
    }
    if (msg.type === 'awaiting_danger') {
      setDanger({
        stepId: msg.stepId,
        tool: msg.tool,
        summary: msg.summary,
        reasons: msg.reasons,
      });
      setPhase('awaiting_danger');
      return;
    }
    if (msg.type === 'done') {
      setPhase('done');
      setDanger(null);
      setTimeline((prev) => [
        ...prev,
        {
          id: `done-${Date.now()}`,
          at: Date.now(),
          kind: 'info',
          summary: msg.summary,
        },
      ]);
      handlesRef.current = null;
      abortRef.current = null;
      return;
    }
    if (msg.type === 'error') {
      setPhase('error');
      setDanger(null);
      setError(msg.message);
      handlesRef.current = null;
      abortRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    handlesRef.current?.abort();
    abortRef.current?.abort();
    handlesRef.current = null;
    abortRef.current = null;
    setPhase('aborted');
    setDanger(null);
  }, []);

  const start = useCallback(
    (goal: string) => {
      const trimmed = goal.trim();
      if (!trimmed || busy) return;
      if (prefs && !prefs.enabled) {
        setError('Agent 已在设置中关闭，请先启用');
        setPhase('error');
        return;
      }

      stop();
      resetTaskUi();
      setPhase('planning');
      void refreshPage();

      const controller = new AbortController();
      abortRef.current = controller;
      handlesRef.current = startAgentTask({
        goal: trimmed,
        onMessage,
        signal: controller.signal,
      });
    },
    [busy, prefs, stop, onMessage, refreshPage],
  );

  // FAB 信箱：切到 Agent 后仅刷新页面信息（目标由用户填写）
  useEffect(() => {
    const pending = options?.pendingAction;
    if (!pending) return;
    if (handledPendingRef.current === pending.createdAt) return;
    handledPendingRef.current = pending.createdAt;
    void refreshPage();
    options?.onPendingHandled?.();
  }, [options?.pendingAction, options?.onPendingHandled, refreshPage]);

  return {
    prefs,
    boundPage,
    phase,
    plan,
    planText: plan ? formatPlanForUi(plan) : '',
    timeline,
    danger,
    error,
    busy,
    setEnabled: async (enabled) => {
      const next = await sendMessage('agent:prefs:save', { enabled });
      setPrefs(next);
    },
    refreshPage,
    start,
    approvePlan: () => handlesRef.current?.approvePlan(),
    rejectPlan: () => handlesRef.current?.rejectPlan(),
    confirmDanger: () => {
      const stepId = danger?.stepId;
      if (!stepId) return;
      handlesRef.current?.confirmDanger(stepId);
      setDanger(null);
    },
    rejectDanger: () => {
      const stepId = danger?.stepId;
      if (!stepId) return;
      handlesRef.current?.rejectDanger(stepId);
      setDanger(null);
    },
    stop,
  };
}
