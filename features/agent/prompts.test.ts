import { describe, expect, it } from 'vitest';
import { parseAgentPlan } from './prompts';

describe('parseAgentPlan', () => {
  it('解析标准 JSON', () => {
    expect(
      parseAgentPlan(
        '{"steps":["打开表单","填写姓名","完成"],"notes":"勿提交"}',
      ),
    ).toEqual({
      steps: ['打开表单', '填写姓名', '完成'],
      notes: '勿提交',
    });
  });

  it('容忍 markdown 代码围栏', () => {
    const plan = parseAgentPlan(
      '```json\n{"steps":["A","B"]}\n```',
    );
    expect(plan?.steps).toEqual(['A', 'B']);
  });

  it('回退为 bullet 行', () => {
    expect(
      parseAgentPlan('- 先 snapshot\n1. 填写邮箱\n* finish'),
    ).toEqual({
      steps: ['先 snapshot', '填写邮箱', 'finish'],
    });
  });

  it('空内容返回 null', () => {
    expect(parseAgentPlan('   ')).toBeNull();
  });
});
