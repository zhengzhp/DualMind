/**
 * Agent 工具 schema / 参数校验单测
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_TOOL_DEFINITIONS,
  AGENT_TOOL_NAMES,
  flattenToolArgs,
  parseAgentToolCall,
} from './tools';

describe('AGENT_TOOL_DEFINITIONS', () => {
  it('覆盖 V3.0 全部工具名且唯一', () => {
    const names = AGENT_TOOL_DEFINITIONS.map((t) => t.function.name);
    expect(names.sort()).toEqual([...AGENT_TOOL_NAMES].sort());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('parseAgentToolCall', () => {
  it('拒绝未知工具', () => {
    expect(parseAgentToolCall('hack', '{}')).toMatchObject({
      ok: false,
      error: expect.stringContaining('未知'),
    });
  });

  it('拒绝非法 JSON', () => {
    expect(parseAgentToolCall('click', '{')).toMatchObject({ ok: false });
  });

  it('解析 click / fill / finish', () => {
    expect(parseAgentToolCall('click', '{"index":2}')).toEqual({
      ok: true,
      tool: 'click',
      args: { tool: 'click', index: 2 },
    });
    expect(
      parseAgentToolCall('fill', '{"index":0,"value":"hello"}'),
    ).toEqual({
      ok: true,
      tool: 'fill',
      args: { tool: 'fill', index: 0, value: 'hello' },
    });
    expect(
      parseAgentToolCall('finish', '{"summary":"完成","success":false}'),
    ).toEqual({
      ok: true,
      tool: 'finish',
      args: { tool: 'finish', summary: '完成', success: false },
    });
  });

  it('wait 必须提供 ms 或 text，并钳制上限', () => {
    expect(parseAgentToolCall('wait', '{}')).toMatchObject({ ok: false });
    const w = parseAgentToolCall('wait', '{"ms":999999}');
    expect(w).toMatchObject({
      ok: true,
      args: { tool: 'wait', ms: 15_000 },
    });
  });

  it('flattenToolArgs 去掉 tool 判别字段', () => {
    expect(flattenToolArgs({ tool: 'click', index: 3 })).toEqual({ index: 3 });
  });
});
