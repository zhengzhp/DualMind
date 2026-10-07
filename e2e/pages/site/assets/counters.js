/**
 * 测试页共享「动作计数器 + 动作日志」（对应测试清单 ENV-01 / ENV-03）
 *
 * 目的：让「动作到底有没有发生、发生了几次」可被**独立观测**，
 * 而不是只相信 Agent 的自然语言摘要。每条用例开始前点「重置」即可归零。
 *
 * 对外暴露 `window.dmTest`：
 *   dmTest.bump(name, detail?)  计数 +1 并记一条带时间戳的动作日志
 *   dmTest.reset()              归零（页面内的「重置计数」按钮同此）
 *   dmTest.state()              { counts, actions } 快照，便于 E2E / 人工断言
 *
 * 面板固定在**左下角**：右下角要留给扩展的 page-fab，避免遮挡。
 */
(function () {
  /** 记数表：name -> number */
  const counts = Object.create(null);
  /** 动作日志：[{ name, detail, at }]，用于区分「模型慢 / DOM 失败 / 超时 / 停止」 */
  const actions = [];

  let panel;
  let listEl;
  let logEl;

  function render() {
    if (!panel) return;
    const names = Object.keys(counts).sort();
    listEl.textContent = '';
    if (names.length === 0) {
      const empty = document.createElement('li');
      empty.textContent = '（无动作）';
      listEl.appendChild(empty);
    }
    for (const name of names) {
      const li = document.createElement('li');
      // data-dm-count 便于 Playwright 直接断言，不必解析文本
      li.dataset.dmCounter = name;
      li.dataset.dmCount = String(counts[name]);
      li.textContent = `${name}: ${counts[name]}`;
      listEl.appendChild(li);
    }
    logEl.textContent = actions
      .slice(-8)
      .map((a) => `${new Date(a.at).toLocaleTimeString()} ${a.name}${a.detail ? ` (${a.detail})` : ''}`)
      .join('\n');
  }

  function ensurePanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'dm-counter-panel';
    panel.style.cssText = [
      'position:fixed', 'left:8px', 'bottom:8px', 'z-index:2147483647',
      'max-width:260px', 'padding:8px 10px', 'border-radius:10px',
      'background:rgba(15,23,42,.92)', 'color:#e2e8f0',
      'font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
      'box-shadow:0 6px 20px rgba(0,0,0,.35)',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = '动作计数（ENV-01）';
    title.style.cssText = 'font-weight:600;margin-bottom:4px';
    panel.appendChild(title);

    listEl = document.createElement('ul');
    listEl.id = 'dm-counter-list';
    listEl.style.cssText = 'margin:0;padding-left:14px';
    panel.appendChild(listEl);

    const logTitle = document.createElement('div');
    logTitle.textContent = '动作日志（ENV-03）';
    logTitle.style.cssText = 'font-weight:600;margin:6px 0 2px';
    panel.appendChild(logTitle);

    logEl = document.createElement('pre');
    logEl.id = 'dm-counter-log';
    logEl.style.cssText = 'margin:0;white-space:pre-wrap;color:#94a3b8';
    panel.appendChild(logEl);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.id = 'dm-reset';
    reset.textContent = '重置计数';
    reset.style.cssText =
      'margin-top:6px;padding:2px 8px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;cursor:pointer';
    reset.addEventListener('click', () => {
      window.dmTest.reset();
    });
    panel.appendChild(reset);

    document.body.appendChild(panel);
    render();
  }

  window.dmTest = {
    /** 记一次动作 */
    bump(name, detail) {
      counts[name] = (counts[name] || 0) + 1;
      actions.push({ name, detail: detail ?? '', at: Date.now() });
      render();
    },
    /** 归零（不刷新页面） */
    reset() {
      for (const key of Object.keys(counts)) delete counts[key];
      actions.length = 0;
      render();
    },
    /** 只读快照 */
    state() {
      return { counts: { ...counts }, actions: actions.slice() };
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensurePanel);
  } else {
    ensurePanel();
  }
})();
