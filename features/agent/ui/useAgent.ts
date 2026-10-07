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
  result: 'success' | 'incomplete' | 'cancelled' | null;
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
  const [result, setResult] = useState<AgentController['result']>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const pageRequestRef = useRef(0);
  const handlesRef = useRef<AgentTaskHandles | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const handledPendingRef = useRef(0);

  const busy =
    phase === 'planning' ||
    phase === 'awaiting_plan' ||
    phase === 'running' ||
    phase === 'awaiting_danger';

  const refreshPage = useCallback(async () => {
    if (activeTaskIdRef.current) return;
    const request = ++pageRequestRef.current;
    try {
      const info = await sendMessage('chat:page-info', undefined);
      if (mountedRef.current && !activeTaskIdRef.current && request === pageRequestRef.current) setBoundPage(info);
    } catch {
      if (mountedRef.current && !activeTaskIdRef.current && request === pageRequestRef.current) setBoundPage(null);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      try {
        const next = await sendMessage('agent:prefs:get', undefined);
        if (mountedRef.current) setPrefs(next);
      } catch {
        if (mountedRef.current) {
          setPrefs(null);
          setError('读取 Agent 设置失败，请重新打开面板');
        }
      }
      await refreshPage();
    })();
    return () => {
      mountedRef.current = false;
      activeTaskIdRef.current = null;
      handlesRef.current?.abort();
      abortRef.current?.abort();
      handlesRef.current = null;
      abortRef.current = null;
    };
  }, [refreshPage]);

  const resetTaskUi = () => {
    setPlan(null);
    setTimeline([]);
    setDanger(null);
    setError('');
    setResult(null);
  };

  const onMessage = useCallback((msg: AgentPortServerMessage) => {
    if (!mountedRef.current || msg.taskId !== activeTaskIdRef.current) return;
    if (msg.type === 'bound_page') {
      setBoundPage({ url: msg.url, title: msg.title });
      return;
    }
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
      setResult(msg.cancelled ? 'cancelled' : msg.success ? 'success' : 'incomplete');
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
      activeTaskIdRef.current = null;
      return;
    }
    if (msg.type === 'error') {
      setPhase('error');
      setDanger(null);
      setError(msg.message);
      handlesRef.current = null;
      abortRef.current = null;
      activeTaskIdRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    activeTaskIdRef.current = null;
    handlesRef.current?.abort();
    abortRef.current?.abort();
    handlesRef.current = null;
    abortRef.current = null;
    setPhase('aborted');
    setResult('cancelled');
    setDanger(null);
  }, []);

  const start = useCallback(
    (goal: string) => {
      const trimmed = goal.trim();
      if (!trimmed || busy || activeTaskIdRef.current) return;
      if (!prefs || !prefs.enabled) {
        setError('Agent 已在设置中关闭，请先启用');
        setPhase('error');
        return;
      }

      stop();
      resetTaskUi();
      setPhase('planning');
      ++pageRequestRef.current;
      setBoundPage(null);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        handlesRef.current = startAgentTask({
          goal: trimmed,
          onMessage,
          signal: controller.signal,
        });
        activeTaskIdRef.current = handlesRef.current.taskId;
      } catch {
        controller.abort();
        abortRef.current = null;
        setError('无法连接 Background，请 Reload 扩展后重试');
        setPhase('error');
      }
    },
    [busy, prefs, stop, onMessage],
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
    result,
    busy,
    setEnabled: async (enabled) => {
      try {
        const next = await sendMessage('agent:prefs:save', { enabled });
        if (mountedRef.current) setPrefs(next);
      } catch {
        if (mountedRef.current) setError('保存 Agent 设置失败，请重试');
      }
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
