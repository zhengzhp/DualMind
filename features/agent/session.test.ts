import { describe, expect, it } from 'vitest';
import { AgentPageSession } from './session';

const url = 'https://example.com/form';

describe('AgentPageSession', () => {
  it('同页只允许一个任务，取消后允许新任务', () => {
    const session = new AgentPageSession('document');
    const first = session.begin('first', url, url, '表单');
    expect(first.ok).toBe(true);
    expect(session.begin('second', url, url, '表单').ok).toBe(false);
    if (!first.ok) throw new Error(first.error);
    const task = session.get('first', first.binding, url);
    session.cancel('first');
    expect(task.controller.signal.aborted).toBe(true);
    expect(session.begin('second', url, url, '表单').ok).toBe(true);
    expect(() => session.get('first', first.binding, url)).toThrow(/停止|变化/);
  });

  it('迟到的 cancel 不影响新任务，迟到的 begin 不复活旧任务', () => {
    const session = new AgentPageSession('document');
    session.cancel('old');
    expect(session.begin('old', url, url, '').ok).toBe(false);
    const next = session.begin('next', url, url, '');
    if (!next.ok) throw new Error(next.error);
    session.cancel('old');
    expect(session.get('next', next.binding, url).controller.signal.aborted).toBe(false);
  });

  it('URL 或文档变化使旧绑定失效', () => {
    const session = new AgentPageSession('document');
    const reply = session.begin('task', url, url, '');
    if (!reply.ok) throw new Error(reply.error);
    expect(() => session.get('task', { ...reply.binding, documentToken: 'other' }, url)).toThrow(/文档/);
    expect(() => session.get('task', reply.binding, `${url}#changed`)).toThrow(/变化/);
    expect(session.begin('task', url, url, '').ok).toBe(false);
    expect(session.begin('new', url, `${url}/new`, '').ok).toBe(false);
  });

  it('离开后返回原 URL 不能恢复旧确认', () => {
    const session = new AgentPageSession('document');
    const reply = session.begin('task', url, url, '');
    if (!reply.ok) throw new Error(reply.error);
    session.invalidate(`${url}/other`);
    expect(() => session.get('task', reply.binding, url)).toThrow(/停止|变化/);
  });
});
