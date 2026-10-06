import { describe, expect, it } from 'vitest';
import {
  ContentTabTracker,
  isReadableContentUrl,
  pickContentTab,
} from './resolveContentTab';

describe('isReadableContentUrl', () => {
  it('接受 http / https', () => {
    expect(isReadableContentUrl('https://example.com/a')).toBe(true);
    expect(isReadableContentUrl('http://localhost:3000')).toBe(true);
  });

  it('拒绝扩展页 / 系统页 / 空值', () => {
    expect(isReadableContentUrl('chrome-extension://abc/workspace.html')).toBe(
      false,
    );
    expect(isReadableContentUrl('chrome://extensions')).toBe(false);
    expect(isReadableContentUrl('about:blank')).toBe(false);
    expect(isReadableContentUrl('')).toBe(false);
    expect(isReadableContentUrl(undefined)).toBe(false);
  });
});

describe('pickContentTab', () => {
  const content = {
    id: 1,
    windowId: 10,
    url: 'https://example.com',
    title: 'Example',
    lastAccessed: 100,
  };
  const workspace = {
    id: 2,
    windowId: 10,
    url: 'chrome-extension://ext/workspace.html',
    title: '工作台',
    lastAccessed: 200,
  };
  const other = {
    id: 3,
    windowId: 10,
    url: 'https://other.test',
    title: 'Other',
    lastAccessed: 50,
  };

  it('活动页可读时直接用活动页', () => {
    expect(pickContentTab(content, 3, [content, other, workspace])).toEqual(
      content,
    );
  });

  it('活动页是工作台时回退到最近可读缓存', () => {
    expect(
      pickContentTab(workspace, content.id, [content, other, workspace]),
    ).toEqual(content);
  });

  it('缓存失效时按 lastAccessed 挑最近可读页', () => {
    // 缓存指向已关闭的 tab 4；同窗口里 content 比 other 更新
    expect(pickContentTab(workspace, 4, [content, other, workspace])).toEqual(
      content,
    );
  });

  it('窗口内无可读页时返回 null', () => {
    expect(pickContentTab(workspace, undefined, [workspace])).toBeNull();
  });
});

describe('ContentTabTracker', () => {
  it('只记录可读内容页，并按窗口隔离', () => {
    const tracker = new ContentTabTracker();
    tracker.remember({
      id: 1,
      windowId: 10,
      url: 'https://a.test',
    });
    tracker.remember({
      id: 2,
      windowId: 11,
      url: 'https://b.test',
    });
    tracker.remember({
      id: 99,
      windowId: 10,
      url: 'chrome-extension://x/workspace.html',
    });
    expect(tracker.lastTabId(10)).toBe(1);
    expect(tracker.lastTabId(11)).toBe(2);
  });

  it('标签关闭后清除对应窗口缓存', () => {
    const tracker = new ContentTabTracker();
    tracker.remember({ id: 1, windowId: 10, url: 'https://a.test' });
    tracker.forgetTab(1);
    expect(tracker.lastTabId(10)).toBeUndefined();
  });
});
