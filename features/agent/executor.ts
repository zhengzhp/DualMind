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
import type {
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

function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return truncate(aria, MAX_NAME_CHARS);

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (parts.trim()) return truncate(parts, MAX_NAME_CHARS);
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.labels && el.labels.length > 0) {
      const lab = Array.from(el.labels)
        .map((l) => l.textContent ?? '')
        .join(' ');
      if (lab.trim()) return truncate(lab, MAX_NAME_CHARS);
    }
  }

  if (el instanceof HTMLElement && el.title?.trim()) {
    return truncate(el.title, MAX_NAME_CHARS);
  }

  const text = el.textContent ?? '';
  if (text.trim()) return truncate(text, MAX_NAME_CHARS);
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

  return stub;
}

function fail(tool: AgentToolName, error: string): AgentToolResult {
  return { ok: false, tool, summary: error, error };
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

  const elements = sliced.map((el, i) => describeElement(el, i));
  const payload: SnapshotPayload = {
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
    if (el instanceof HTMLElement) el.focus();
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
      el.focus();
      el.value = `${el.value}${text}`;
      dispatchInputEvents(el);
    } else if (el instanceof HTMLElement && el.isContentEditable) {
      el.focus();
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
      el.focus();
      el.value = value;
      dispatchInputEvents(el);
    } else if (el instanceof HTMLElement && el.isContentEditable) {
      el.focus();
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWait(
  args: Extract<AgentToolArgs, { tool: 'wait' }>,
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
      await sleep(200);
    }
    return fail('wait', `等待文本超时（${timeout}ms）：${truncate(needle, 40)}`);
  }
  const ms = Math.min(MAX_WAIT_MS, args.ms ?? DEFAULT_WAIT_MS);
  await sleep(ms);
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
export async function executeAgentTool(
  args: AgentToolArgs,
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
      return runWait(args);
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

/**
 * 从原始 name + arguments JSON 执行（内容脚本入口也可直接用）
 */
export async function executeAgentToolRaw(
  name: string,
  argumentsJson: string,
): Promise<AgentToolResult> {
  const parsed = parseAgentToolCall(name, argumentsJson);
  if (!parsed.ok) {
    const tool: AgentToolName = AGENT_TOOL_NAME_SET.has(name)
      ? (name as AgentToolName)
      : 'snapshot';
    return { ok: false, tool, summary: parsed.error, error: parsed.error };
  }
  return executeAgentTool(parsed.args);
}

/** 测试 / 调试：清空 snapshot 缓存 */
export function resetAgentSnapshotForTests(): void {
  lastNodes = [];
}
