/**
 * 内容脚本：本页 DOM 工具执行（永不持有 Key、不调模型）
 * 元素以最近一次 snapshot 的 index 寻址。
 */
import {
  AGENT_TOOL_NAMES,
  DEFAULT_WAIT_MS,
  MAX_SNAPSHOT_ELEMENTS,
  MAX_WAIT_MS,
  parseAgentToolCall,
} from './tools';
import { classifyDanger } from './danger';
import { AgentPageSession, type AgentPageTask } from './session';
import type {
  AgentExecuteMessage,
  AgentTaskReply,
  AgentToolArgs,
  AgentToolName,
  AgentToolResult,
  SnapshotElement,
  SnapshotPayload,
} from './types';

const AGENT_TOOL_NAME_SET = new Set<string>(AGENT_TOOL_NAMES);

/** 可交互元素选择器（a11y 风格，V3.0 不穿越 Shadow / 跨域 iframe） */
const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="combobox"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[contenteditable="true"]',
  'summary',
].join(',');

const MAX_NAME_CHARS = 80;
const MAX_VALUE_CHARS = 60;
const MAX_OPTIONS = 12;

/** 最近一次 snapshot 的实节点（与返回的 index 对齐） */
let lastNodes: Element[] = [];
let lastSignatures: string[] = [];
let lastSnapshotId = '';
const session = new AgentPageSession(crypto.randomUUID());

export function beginAgentPageTask(taskId: string, expectedUrl: string): AgentTaskReply {
  session.invalidate(location.href);
  const reply = session.begin(taskId, expectedUrl, location.href, document.title || '');
  if (reply.ok) resetAgentSnapshotForTests();
  return reply;
}

export function cancelAgentPageTask(taskId: string): void {
  if (session.cancel(taskId)) resetAgentSnapshotForTests();
}

export function stopAgentPageTask(): void {
  session.stop();
  resetAgentSnapshotForTests();
}

export function invalidateAgentPageTask(): void {
  session.invalidate(location.href);
}

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const style = el.ownerDocument?.defaultView?.getComputedStyle(el);
  if (style) {
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function accessibleName(el: Element, maxChars = MAX_NAME_CHARS): string {
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return truncate(aria, maxChars);

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (parts.trim()) return truncate(parts, maxChars);
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.labels && el.labels.length > 0) {
      const lab = Array.from(el.labels)
        .map((l) => l.textContent ?? '')
        .join(' ');
      if (lab.trim()) return truncate(lab, maxChars);
    }
  }

  if (el instanceof HTMLElement && el.title?.trim()) {
    return truncate(el.title, maxChars);
  }

  const text = el.textContent ?? '';
  if (text.trim()) return truncate(text, maxChars);
  return '';
}

function describeElement(el: Element, index: number): SnapshotElement {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role') ?? undefined;
  const name = accessibleName(el) || undefined;
  const stub: SnapshotElement = { index, tag, ...(role ? { role } : {}), ...(name ? { name } : {}) };

  if (el instanceof HTMLInputElement) {
    const inputType = (el.type || 'text').toLowerCase();
    stub.inputType = inputType;
    if (el.placeholder) stub.placeholder = truncate(el.placeholder, MAX_NAME_CHARS);
    if (inputType === 'password') {
      stub.value = el.value ? '••••' : '';
    } else if (el.value) {
      stub.value = truncate(el.value, MAX_VALUE_CHARS);
    }
    if (el.disabled) stub.disabled = true;
    if (inputType === 'checkbox' || inputType === 'radio') {
      stub.checked = el.checked;
    }
  } else if (el instanceof HTMLTextAreaElement) {
    stub.inputType = 'textarea';
    if (el.placeholder) stub.placeholder = truncate(el.placeholder, MAX_NAME_CHARS);
    if (el.value) stub.value = truncate(el.value, MAX_VALUE_CHARS);
    if (el.disabled) stub.disabled = true;
  } else if (el instanceof HTMLSelectElement) {
    stub.inputType = 'select';
    if (el.disabled) stub.disabled = true;
    const opts = Array.from(el.options)
      .slice(0, MAX_OPTIONS)
      .map((o) => truncate(o.text || o.value, 40));
    if (opts.length) stub.options = opts;
    if (el.value) stub.value = truncate(el.value, MAX_VALUE_CHARS);
  } else if (el instanceof HTMLAnchorElement && el.href) {
    stub.href = truncate(el.href, 120);
  } else if (el instanceof HTMLButtonElement) {
    stub.inputType = el.type || 'submit';
    if (el.disabled) stub.disabled = true;
  }

  if (el instanceof HTMLElement && el.isContentEditable) {
    stub.inputType = stub.inputType ?? 'contenteditable';
  }

  if ((el instanceof HTMLButtonElement || el instanceof HTMLInputElement) && el.form) {
    stub.formAction = truncate(el.getAttribute('formaction') ? el.formAction : el.form.action, 120);
  }

  return stub;
}

function fail(tool: AgentToolName, error: string): AgentToolResult {
  return { ok: false, tool, summary: error, error };
}

/** 完整属性仅在内容页比较，不把长 URL 或密码明文发给模型。 */
function nodeSignature(element: Element): string {
  const attributes = Array.from(element.attributes)
    .filter((attribute) => attribute.name !== 'value')
    .map((attribute) => [attribute.name, attribute.value]);
  const value = element instanceof HTMLInputElement
    ? element.type === 'password' ? '' : element.value
    : element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
      ? element.value : '';
  const form = element instanceof HTMLButtonElement || element instanceof HTMLInputElement
    ? element.form : null;
  const formAttributes = form ? Array.from(form.attributes).map((attribute) => [attribute.name, attribute.value]) : null;
  return JSON.stringify([element.tagName, attributes, element.textContent, value, formAttributes]);
}

function resolveNode(
  index: number,
  tool: AgentToolName,
): { ok: true; el: Element; meta: SnapshotElement } | { ok: false; result: AgentToolResult } {
  if (!lastNodes.length) {
    return {
      ok: false,
      result: fail(tool, '尚无 snapshot，请先调用 snapshot'),
    };
  }
  if (index < 0 || index >= lastNodes.length) {
    return {
      ok: false,
      result: fail(
        tool,
        `index ${index} 越界（当前 snapshot 共 ${lastNodes.length} 个）`,
      ),
    };
  }
  const el = lastNodes[index];
  if (!el || !el.isConnected) {
    return {
      ok: false,
      result: fail(tool, `index ${index} 对应节点已从文档移除，请重新 snapshot`),
    };
  }
  if (nodeSignature(el) !== lastSignatures[index]) {
    return { ok: false, result: fail(tool, '目标属性已变化，请重新 snapshot，旧确认不可复用') };
  }
  return { ok: true, el, meta: describeElement(el, index) };
}

function dispatchInputEvents(el: Element): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function runSnapshot(maxElements = MAX_SNAPSHOT_ELEMENTS): AgentToolResult {
  const cap = Math.min(MAX_SNAPSHOT_ELEMENTS, Math.max(1, maxElements));
  const all = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR)).filter(
    isVisible,
  );
  const sliced = all.slice(0, cap);
  lastNodes = sliced;
  lastSignatures = sliced.map(nodeSignature);
  lastSnapshotId = crypto.randomUUID();

  const elements = sliced.map((el, i) => describeElement(el, i));
  const payload: SnapshotPayload = {
    snapshotId: lastSnapshotId,
    url: location.href,
    title: document.title || '',
    elements,
    truncated: all.length > cap,
    totalCandidates: all.length,
  };

  return {
    ok: true,
    tool: 'snapshot',
    summary: `快照 ${elements.length}/${all.length} 个可交互元素${payload.truncated ? '（已截断）' : ''}`,
    data: payload,
  };
}

function runClick(index: number): AgentToolResult {
  const resolved = resolveNode(index, 'click');
  if (!resolved.ok) return resolved.result;
  const { el, meta } = resolved;
  if (el instanceof HTMLElement && 'disabled' in el && (el as HTMLButtonElement).disabled) {
    return fail('click', `index ${index} 已禁用`);
  }
  try {
    if (typeof (el as HTMLElement).click === 'function') {
      (el as HTMLElement).click();
    } else {
      el.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
      );
    }
  } catch (err) {
    return fail(
      'click',
      err instanceof Error ? err.message : '点击失败',
    );
  }
  return {
    ok: true,
    tool: 'click',
    summary: `已点击 [#${index}] ${meta.name || meta.tag}`,
    element: meta,
  };
}

function runType(index: number, text: string): AgentToolResult {
  const resolved = resolveNode(index, 'type');
  if (!resolved.ok) return resolved.result;
  const { el, meta } = resolved;
  try {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.value = `${el.value}${text}`;
      dispatchInputEvents(el);
    } else if (el instanceof HTMLElement && el.isContentEditable) {
      el.textContent = `${el.textContent ?? ''}${text}`;
      dispatchInputEvents(el);
    } else {
      return fail('type', `index ${index} 不是可输入控件`);
    }
  } catch (err) {
    return fail('type', err instanceof Error ? err.message : '输入失败');
  }
  return {
    ok: true,
    tool: 'type',
    summary: `已在 [#${index}] 追加 ${text.length} 字`,
    element: meta,
  };
}

function runFill(index: number, value: string): AgentToolResult {
  const resolved = resolveNode(index, 'fill');
  if (!resolved.ok) return resolved.result;
  const { el, meta } = resolved;
  try {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.value = value;
      dispatchInputEvents(el);
    } else if (el instanceof HTMLElement && el.isContentEditable) {
      el.textContent = value;
      dispatchInputEvents(el);
    } else {
      return fail('fill', `index ${index} 不是可填写控件（下拉请用 select）`);
    }
  } catch (err) {
    return fail('fill', err instanceof Error ? err.message : '填写失败');
  }
  return {
    ok: true,
    tool: 'fill',
    summary: `已填写 [#${index}]（${value.length} 字）`,
    element: meta,
  };
}

function runSelect(index: number, value: string): AgentToolResult {
  const resolved = resolveNode(index, 'select');
  if (!resolved.ok) return resolved.result;
  const { el, meta } = resolved;
  if (!(el instanceof HTMLSelectElement)) {
    return fail('select', `index ${index} 不是 <select>`);
  }
  const match = Array.from(el.options).find(
    (o) => o.value === value || o.text.trim() === value.trim(),
  );
  if (!match) {
    return fail('select', `未找到 value/文案为「${value}」的 option`);
  }
  el.value = match.value;
  dispatchInputEvents(el);
  return {
    ok: true,
    tool: 'select',
    summary: `已选择 [#${index}] → ${truncate(match.text || match.value, 40)}`,
    element: meta,
  };
}

function runScroll(
  args: Extract<AgentToolArgs, { tool: 'scroll' }>,
): AgentToolResult {
  if (args.index !== undefined) {
    const resolved = resolveNode(args.index, 'scroll');
    if (!resolved.ok) return resolved.result;
    try {
      resolved.el.scrollIntoView({ block: 'center', inline: 'nearest' });
    } catch (err) {
      return fail(
        'scroll',
        err instanceof Error ? err.message : 'scrollIntoView 失败',
      );
    }
    return {
      ok: true,
      tool: 'scroll',
      summary: `已将 [#${args.index}] 滚入视口`,
      element: resolved.meta,
    };
  }
  const amount = args.amount ?? 400;
  const delta = (args.direction ?? 'down') === 'up' ? -amount : amount;
  window.scrollBy(0, delta);
  return {
    ok: true,
    tool: 'scroll',
    summary: `页面已滚动 ${delta > 0 ? '下' : '上'} ${Math.abs(delta)}px`,
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('任务已停止'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('任务已停止'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function runWait(
  args: Extract<AgentToolArgs, { tool: 'wait' }>,
  signal?: AbortSignal,
): Promise<AgentToolResult> {
  if (args.text) {
    const timeout = Math.min(
      MAX_WAIT_MS,
      args.timeoutMs ?? MAX_WAIT_MS,
    );
    const needle = args.text;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const body = document.body?.innerText ?? '';
      if (body.includes(needle)) {
        return {
          ok: true,
          tool: 'wait',
          summary: `已出现文本「${truncate(needle, 40)}」`,
        };
      }
      await sleep(200, signal);
    }
    return fail('wait', `等待文本超时（${timeout}ms）：${truncate(needle, 40)}`);
  }
  const ms = Math.min(MAX_WAIT_MS, args.ms ?? DEFAULT_WAIT_MS);
  await sleep(ms, signal);
  return { ok: true, tool: 'wait', summary: `已等待 ${ms}ms` };
}

function runExtractText(
  args: Extract<AgentToolArgs, { tool: 'extract_text' }>,
): AgentToolResult {
  const maxChars = args.maxChars ?? 2000;
  if (args.index !== undefined) {
    const resolved = resolveNode(args.index, 'extract_text');
    if (!resolved.ok) return resolved.result;
    const text = truncate(
      (resolved.el as HTMLElement).innerText ??
        resolved.el.textContent ??
        '',
      maxChars,
    );
    return {
      ok: true,
      tool: 'extract_text',
      summary: `已抽取 [#${args.index}] ${text.length} 字`,
      data: { text },
      element: resolved.meta,
    };
  }
  const text = truncate(document.body?.innerText ?? '', maxChars);
  return {
    ok: true,
    tool: 'extract_text',
    summary: `已抽取页面文本 ${text.length} 字`,
    data: { text, url: location.href, title: document.title || '' },
  };
}

function runFinish(
  args: Extract<AgentToolArgs, { tool: 'finish' }>,
): AgentToolResult {
  const success = args.success !== false;
  return {
    ok: true,
    tool: 'finish',
    summary: args.summary,
    data: { success, summary: args.summary },
  };
}

/**
 * 执行已校验的工具（args 为 parseAgentToolCall 的结果）
 */
async function runAgentTool(
  args: AgentToolArgs,
  signal: AbortSignal,
): Promise<AgentToolResult> {
  switch (args.tool) {
    case 'snapshot':
      return runSnapshot(args.maxElements);
    case 'click':
      return runClick(args.index);
    case 'type':
      return runType(args.index, args.text);
    case 'fill':
      return runFill(args.index, args.value);
    case 'select':
      return runSelect(args.index, args.value);
    case 'scroll':
      return runScroll(args);
    case 'wait':
      return runWait(args, signal);
    case 'extract_text':
      return runExtractText(args);
    case 'finish':
      return runFinish(args);
    default: {
      const _e: never = args;
      return fail('snapshot', `未实现：${JSON.stringify(_e)}`);
    }
  }
}

/** 同步复核到实际 DOM 写入之间不 await，避免确认与执行使用不同目标。 */
export async function executeAgentTool(
  args: AgentToolArgs,
  message: AgentExecuteMessage,
): Promise<AgentToolResult> {
  let task: AgentPageTask;
  try {
    if (!Number.isFinite(message.expiresAt) || Date.now() >= message.expiresAt) {
      session.cancel(message.taskId);
      throw new Error('工具请求已超时，任务已失效');
    }
    task = session.get(message.taskId, message.binding, location.href);
  } catch (error) {
    return { ...fail(args.tool, error instanceof Error ? error.message : '任务失效'), fatal: true };
  }
  if (task.executing) return fail(args.tool, '工具仍在执行，请勿并发调用');

  let element: SnapshotElement | null = null;
  if ('index' in args && args.index !== undefined) {
    if (!message.guard.snapshotId || message.guard.snapshotId !== lastSnapshotId) {
      return fail(args.tool, '快照已失效，请重新 snapshot');
    }
    const resolved = resolveNode(args.index, args.tool);
    if (!resolved.ok) return resolved.result;
    if (!isVisible(resolved.el) || resolved.meta.disabled) {
      return fail(args.tool, '目标已隐藏或禁用，请重新 snapshot');
    }
    element = resolved.meta;
    if (JSON.stringify(element) !== JSON.stringify(message.guard.expectedElement)) {
      return fail(args.tool, '目标元素已变化，旧确认不可复用，请重新 snapshot');
    }
    // 安全判断使用完整文案 / 链接，不让模型快照的截断掩盖支付语境。
    element = { ...element, name: accessibleName(resolved.el, Number.MAX_SAFE_INTEGER) };
    if (resolved.el instanceof HTMLAnchorElement) element.href = resolved.el.href;
    if ((resolved.el instanceof HTMLButtonElement || resolved.el instanceof HTMLInputElement) && resolved.el.form) {
      element.formAction = resolved.el.getAttribute('formaction') ? resolved.el.formAction : resolved.el.form.action;
    }
    if (args.tool === 'select' && resolved.el instanceof HTMLSelectElement) {
      const selected = Array.from(resolved.el.options).find(
        (option) => option.value === args.value || option.text.trim() === args.value.trim(),
      );
      element.name = `${element.name ?? ''} ${selected?.text ?? ''}`;
    }
  }

  const danger = classifyDanger({ tool: args.tool, args, element, pageUrl: location.href });
  if (danger.level === 'blocked') return fail(args.tool, danger.reasons.join('；'));
  if (danger.level === 'dangerous' && !message.guard.dangerConfirmed) {
    return fail(args.tool, '真实目标需要危险动作确认，请重新观测并确认');
  }

  task.executing = true;
  const deadline = setTimeout(() => cancelAgentPageTask(message.taskId), message.expiresAt - Date.now());
  try {
    const result = await runAgentTool(args, task.controller.signal);
    session.get(message.taskId, message.binding, location.href);
    return result;
  } catch (error) {
    return {
      ...fail(args.tool, error instanceof Error ? error.message : '执行失败'),
      fatal: task.controller.signal.aborted || location.href !== task.binding.url,
    };
  } finally {
    clearTimeout(deadline);
    task.executing = false;
  }
}

/**
 * 从原始 name + arguments JSON 执行（内容脚本入口也可直接用）
 */
export async function executeAgentToolRaw(
  name: string,
  argumentsJson: string,
  message: AgentExecuteMessage,
): Promise<AgentToolResult> {
  const parsed = parseAgentToolCall(name, argumentsJson);
  if (!parsed.ok) {
    const tool: AgentToolName = AGENT_TOOL_NAME_SET.has(name)
      ? (name as AgentToolName)
      : 'snapshot';
    return { ok: false, tool, summary: parsed.error, error: parsed.error };
  }
  return executeAgentTool(parsed.args, message);
}

/** 测试 / 调试：清空 snapshot 缓存 */
export function resetAgentSnapshotForTests(): void {
  lastNodes = [];
  lastSignatures = [];
  lastSnapshotId = '';
}
