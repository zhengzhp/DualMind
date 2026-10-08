import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginAgentPageTask, cancelAgentPageTask, executeAgentTool, stopAgentPageTask,
} from './executor';
import type { AgentExecuteMessage, AgentPageBinding, AgentToolArgs, SnapshotPayload } from './types';

/** 沿用仓库伪 DOM 测试模式，不引入浏览器模拟依赖。 */
class FakeElement {
  tagName = 'DIV';
  textContent = '';
  hidden = false;
  title = '';
  isConnected = true;
  isContentEditable = false;
  ownerDocument = null;
  attrs = new Map<string, string>();
  get attributes() { return Array.from(this.attrs, ([name, value]) => ({ name, value })); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  getBoundingClientRect() { return { width: 100, height: 30 }; }
}
class FakeButton extends FakeElement {
  override tagName = 'BUTTON';
  type = 'button';
  disabled = false;
  form: FakeElement | null = null;
  click = vi.fn();
}
class FakeInput extends FakeElement {}
class FakeTextarea extends FakeElement {}
class FakeSelect extends FakeElement {}
class FakeAnchor extends FakeElement {}

const url = 'https://example.com/form';
let binding: AgentPageBinding;
let taskId: string;
let nodes: FakeElement[];
let pageLocation: { href: string };

function request(args: AgentToolArgs, guard: AgentExecuteMessage['guard'] = {}): AgentExecuteMessage {
  return {
    type: 'content:agent-execute', taskId, binding, guard,
    expiresAt: Date.now() + 15000, tool: args.tool, args: {},
  };
}

async function snapshot(): Promise<SnapshotPayload> {
  const args = { tool: 'snapshot' as const };
  const result = await executeAgentTool(args, request(args));
  expect(result.ok).toBe(true);
  return result.data as SnapshotPayload;
}

beforeEach(() => {
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('HTMLButtonElement', FakeButton);
  vi.stubGlobal('HTMLInputElement', FakeInput);
  vi.stubGlobal('HTMLTextAreaElement', FakeTextarea);
  vi.stubGlobal('HTMLSelectElement', FakeSelect);
  vi.stubGlobal('HTMLAnchorElement', FakeAnchor);
  nodes = [];
  pageLocation = { href: url };
  vi.stubGlobal('location', pageLocation);
  vi.stubGlobal('document', {
    title: '模拟页面', body: { innerText: '' }, querySelectorAll: () => nodes,
    getElementById: () => null,
  });
  stopAgentPageTask();
  taskId = crypto.randomUUID();
  const reply = beginAgentPageTask(taskId, url);
  if (!reply.ok) throw new Error(reply.error);
  binding = reply.binding;
});

afterEach(() => {
  stopAgentPageTask();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('内容页执行前安全复核', () => {
  it('普通按钮可执行，旧快照版本不能执行', async () => {
    const button = new FakeButton();
    button.textContent = '展开详情';
    nodes = [button];
    const first = await snapshot();
    const args = { tool: 'click' as const, index: 0 };
    const guard = { snapshotId: first.snapshotId, expectedElement: first.elements[0] };
    expect((await executeAgentTool(args, request(args, guard))).ok).toBe(true);
    await snapshot();
    expect((await executeAgentTool(args, request(args, guard))).ok).toBe(false);
    expect(button.click).toHaveBeenCalledTimes(1);
  });

  it('确认后元素变成删除 / 支付动作时拒绝旧授权', async () => {
    const button = new FakeButton();
    button.textContent = '提交反馈';
    nodes = [button];
    const data = await snapshot();
    button.textContent = '立即支付';
    const args = { tool: 'click' as const, index: 0 };
    const result = await executeAgentTool(args, request(args, {
      snapshotId: data.snapshotId, expectedElement: data.elements[0], dangerConfirmed: true,
    }));
    expect(result.ok).toBe(false);
    expect(button.click).not.toHaveBeenCalled();
  });

  it('支付动作即使携带确认也不能执行', async () => {
    const button = new FakeButton();
    button.textContent = '立即支付';
    nodes = [button];
    const data = await snapshot();
    const args = { tool: 'click' as const, index: 0 };
    const result = await executeAgentTool(args, request(args, {
      snapshotId: data.snapshotId, expectedElement: data.elements[0], dangerConfirmed: true,
    }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/支付/);
    expect(button.click).not.toHaveBeenCalled();
  });

  it('初始支付文案超过快照截断长度也阻断', async () => {
    const button = new FakeButton();
    button.textContent = `${'详情'.repeat(60)}立即支付`;
    nodes = [button];
    const data = await snapshot();
    const args = { tool: 'click' as const, index: 0 };
    expect((await executeAgentTool(args, request(args, {
      snapshotId: data.snapshotId, expectedElement: data.elements[0], dangerConfirmed: true,
    }))).error).toMatch(/支付/);
    expect(button.click).not.toHaveBeenCalled();
  });

  it('危险动作必须带本次确认', async () => {
    const button = new FakeButton();
    button.textContent = '删除草稿';
    nodes = [button];
    const data = await snapshot();
    const args = { tool: 'click' as const, index: 0 };
    const guard = { snapshotId: data.snapshotId, expectedElement: data.elements[0] };
    expect((await executeAgentTool(args, request(args, guard))).ok).toBe(false);
    expect(button.click).not.toHaveBeenCalled();
    expect((await executeAgentTool(args, request(args, { ...guard, dangerConfirmed: true }))).ok).toBe(true);
    expect(button.click).toHaveBeenCalledTimes(1);
  });

  it('完整属性改变但截断文案不变也拒绝', async () => {
    const button = new FakeButton();
    button.textContent = '详情'.repeat(60);
    nodes = [button];
    const data = await snapshot();
    button.textContent += '支付';
    const args = { tool: 'click' as const, index: 0 };
    expect((await executeAgentTool(args, request(args, {
      snapshotId: data.snapshotId, expectedElement: data.elements[0],
    }))).ok).toBe(false);
    expect(button.click).not.toHaveBeenCalled();
  });

  it('确认期间表单提交地址变化拒绝旧授权', async () => {
    const button = new FakeButton();
    button.textContent = '提交反馈';
    button.type = 'submit';
    const form = Object.assign(new FakeElement(), { action: `${url}/submit` });
    form.attrs.set('action', form.action);
    button.form = form;
    nodes = [button];
    const data = await snapshot();
    form.action = 'https://example.com/payment';
    form.attrs.set('action', form.action);
    const args = { tool: 'click' as const, index: 0 };
    expect((await executeAgentTool(args, request(args, {
      snapshotId: data.snapshotId, expectedElement: data.elements[0], dangerConfirmed: true,
    }))).ok).toBe(false);
    expect(button.click).not.toHaveBeenCalled();
  });

  it('执行中的等待到请求截止时间即终止', async () => {
    vi.useFakeTimers();
    const args = { tool: 'wait' as const, ms: 5000 };
    const waiting = executeAgentTool(args, { ...request(args), expiresAt: Date.now() + 10 });
    await vi.advanceTimersByTimeAsync(11);
    expect(await waiting).toMatchObject({ ok: false, fatal: true });
  });

  it('不同任务或文档不能复用当前快照', async () => {
    const args = { tool: 'snapshot' as const };
    expect((await executeAgentTool(args, { ...request(args), taskId: 'other' })).fatal).toBe(true);
    expect((await executeAgentTool(args, { ...request(args), binding: { ...binding, documentToken: 'other' } })).fatal).toBe(true);
  });

  it('取消等待立即结束，旧任务请求不能继续', async () => {
    vi.useFakeTimers();
    const args = { tool: 'wait' as const, ms: 5000 };
    const waiting = executeAgentTool(args, request(args));
    cancelAgentPageTask(taskId);
    expect(await waiting).toMatchObject({ ok: false, fatal: true });
    expect((await executeAgentTool(args, request(args))).fatal).toBe(true);
  });

  it('超时请求不执行；页面改变后旧任务失效', async () => {
    const args = { tool: 'snapshot' as const };
    pageLocation.href = `${url}#new`;
    expect((await executeAgentTool(args, request(args))).fatal).toBe(true);
    pageLocation.href = url;
    expect((await executeAgentTool(args, request(args))).fatal).toBe(true);
    expect((await executeAgentTool(args, { ...request(args), expiresAt: Date.now() - 1 })).fatal).toBe(true);
  });
});
