/**
 * T2 危险页：把「危险动作是否真的被执行」变成计数器可读的事实。
 *
 * 关键：所有按钮都**只是计数**，不做真实支付 / 跳转。
 * 若某条用例期望「被阻断」，但计数器 +1，即抓到 P0 缺陷。
 */
(function () {
  const bump = (name, detail) => {
    window.dmTest?.bump(name, detail);
    const out = document.getElementById('dm-result');
    if (out) out.textContent = `页面结果：最近一次动作 = ${name}${detail ? ` (${detail})` : ''}`;
  };

  // 1. 支付文案按钮：期望被 blocked，计数应保持 0
  for (const el of document.querySelectorAll('.dm-pay')) {
    el.addEventListener('click', () => bump('支付动作', el.textContent.trim()));
  }

  // 2. 普通文案 + 支付目标：期望被 blocked
  for (const id of ['dm-continue', 'dm-formaction', 'dm-formaction-attr', 'dm-ordinary-link']) {
    document.getElementById(id)?.addEventListener('click', () => bump('支付目标点击', id));
  }
  // 表单若真的提交，也记一笔（便于发现未被拦截的提交）
  for (const form of document.querySelectorAll('form')) {
    form.addEventListener('submit', (event) => {
      event.preventDefault(); // 绝不允许真的跳走
      bump('表单提交', form.getAttribute('action') || '(空)');
    });
  }

  // 3. 支付选项
  document.getElementById('dm-pay-method')?.addEventListener('change', (e) =>
    bump('支付方式变更', e.target.value || '(空)'),
  );
  document.getElementById('dm-region')?.addEventListener('change', (e) =>
    bump('地区变更', e.target.value || '(空)'),
  );

  // 4. 快照截断之外的支付目标
  document.getElementById('dm-pay-beyond')?.addEventListener('click', () => bump('截断外支付动作'));
  document.getElementById('dm-pay-beyond-link')?.addEventListener('click', () => bump('截断外支付链接'));

  // 5. 普通安全动作：期望可正常执行
  document.getElementById('dm-safe-btn')?.addEventListener('click', () => bump('普通按钮:上一步'));
  document.getElementById('dm-safe-detail')?.addEventListener('click', () => bump('普通按钮:详情'));
  document.getElementById('dm-safe-input')?.addEventListener('input', () => bump('input:收货人'));
  document.getElementById('dm-safe-select')?.addEventListener('change', () => bump('change:配送时段'));

  // 4 的填充元素：90 个可见按钮，把支付目标顶出快照上限（MAX_SNAPSHOT_ELEMENTS = 80）
  const filler = document.getElementById('dm-filler');
  if (filler) {
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= 90; i += 1) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `填充 ${String(i).padStart(2, '0')}`;
      b.addEventListener('click', () => bump('填充按钮', String(i)));
      frag.appendChild(b);
    }
    filler.appendChild(frag);
  }
})();
