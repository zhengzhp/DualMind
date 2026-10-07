import type { AgentPageBinding, AgentTaskReply } from './types';

export interface AgentPageTask {
  taskId: string;
  binding: AgentPageBinding;
  controller: AbortController;
  executing: boolean;
}

/** 内容页只保留一个任务；取消记录阻止迟到的启动请求重新占用页面。 */
export class AgentPageSession {
  private active: AgentPageTask | null = null;
  private readonly cancelled = new Set<string>();

  constructor(private readonly documentToken: string) {}

  begin(taskId: string, expectedUrl: string, url: string, title: string): AgentTaskReply {
    if (!taskId || this.cancelled.has(taskId)) {
      return { ok: false, error: '任务已失效，请重新启动' };
    }
    if (this.active) {
      return { ok: false, error: '本页已有 Agent 任务，请先停止原任务' };
    }
    if (url !== expectedUrl) {
      return { ok: false, error: '页面地址已变化，请重新启动任务并批准计划' };
    }
    const binding = { documentToken: this.documentToken, url, title };
    this.active = { taskId, binding, controller: new AbortController(), executing: false };
    return { ok: true, binding };
  }

  cancel(taskId: string): boolean {
    this.cancelled.add(taskId);
    if (this.active?.taskId !== taskId) return false;
    this.active.controller.abort();
    this.active = null;
    return true;
  }

  stop(): void {
    if (this.active) this.cancel(this.active.taskId);
  }

  invalidate(url: string): void {
    if (this.active && this.active.binding.url !== url) {
      this.cancel(this.active.taskId);
    }
  }

  get(taskId: string, binding: AgentPageBinding, url: string): AgentPageTask {
    this.invalidate(url);
    const task = this.active;
    if (!task || task.taskId !== taskId || task.controller.signal.aborted) {
      throw new Error('任务已停止或页面已变化，请重新启动任务');
    }
    if (binding.documentToken !== this.documentToken || binding.url !== url) {
      throw new Error('页面文档已变化，旧计划与确认已失效');
    }
    return task;
  }
}
