import { describe, expect, it } from 'vitest';
import { parseMarkedSegments, parseSegmentedOutput } from './parse';

describe('parseMarkedSegments', () => {
  it('解析「标记独占一行」的输出', () => {
    const raw = '[[1]]\n你好\n[[2]]\n世界';
    expect(parseMarkedSegments(raw, 2)).toEqual(['你好', '世界']);
  });

  it('解析「标记与译文同行」的输出', () => {
    const raw = '[[1]] Hello\n[[2]] World';
    expect(parseMarkedSegments(raw, 2)).toEqual(['Hello', 'World']);
  });

  it('多行译文完整保留', () => {
    const raw = '[[1]]\n第一行\n第二行\n[[2]]\nAnother';
    expect(parseMarkedSegments(raw, 2)).toEqual(['第一行\n第二行', 'Another']);
  });

  it('缺失的段返回空串', () => {
    const raw = '[[1]]\nA\n[[3]]\nC';
    expect(parseMarkedSegments(raw, 3)).toEqual(['A', '', 'C']);
  });
});

describe('parseSegmentedOutput', () => {
  it('有标记时按标记解析', () => {
    const raw = '[[1]]\n一\n[[2]]\n二';
    expect(parseSegmentedOutput(raw, 2)).toEqual(['一', '二']);
  });

  it('无标记时退化为按空行切分', () => {
    const raw = 'para one\n\npara two';
    expect(parseSegmentedOutput(raw, 2)).toEqual(['para one', 'para two']);
  });

  it('空输入返回等长空数组', () => {
    expect(parseSegmentedOutput('', 3)).toEqual(['', '', '']);
  });

  it('单段纯文本原样返回（单段补译场景）', () => {
    expect(parseSegmentedOutput('plain translation', 1)).toEqual([
      'plain translation',
    ]);
  });
});
