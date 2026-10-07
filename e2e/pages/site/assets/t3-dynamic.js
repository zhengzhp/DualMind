/**
 * T3 动态页：在 snapshot 之后改动目标的**文案 / 属性 / 结构**或导航，
 * 用来验证「旧快照 + 旧确认」必须失效（SEC-09 / SEC-10 / SEC-11 / SEC-16）。
 */
(function () {
  const bump = (name, detail) => {
    window.dmTest?.bump(name, detail);
    const out = document.getElementById('dm-result');
    if (out) out.textContent = `页面结果：最近一次动作 = ${name}${detail ? ` (${detail})` : ''}`;
  };

  const $ = (id) => document.getElementById(id);
  const target = () => $('dm-target');

  const showUrl = () => {
    $('dm-url').textContent = location.href;
  };

  // 目标自身的可观测动作
  target()?.addEventListener('click', () => bump('目标点击'));
  $('dm-target-link')?.addEventListener('click', () => bump('目标链接点击'));
  $('dm-select-target')?.addEventListener('change', () => bump('目标下拉变更'));
  $('dm-form-target-btn')?.addEventListener('click', () => bump('目标提交按钮点击'));
  $('dm-form-target')?.addEventListener('submit', (e) => {
    e.preventDefault();
    bump('目标表单提交');
  });

  /** 变异：把点击后的可见变化记到日志里，便于人工对照 */
  const mutations = {
    text() {
      const el = target();
      if (el) el.textContent = '删除全部';
      bump('变异:改文案', '删除全部');
    },
    'type-submit'() {
      const el = target();
      if (el) el.type = 'submit';
      bump('变异:改type', 'submit');
    },
    'aria-label'() {
      const el = target();
      el?.setAttribute('aria-label', '支付');
      bump('变异:改aria-label', '支付');
    },
    'aria-labelledby'() {
      const el = target();
      el?.setAttribute('aria-labelledby', 'dm-mut-label');
      bump('变异:改aria-labelledby', '转账');
    },
    href() {
      const link = $('dm-target-link');
      if (link) link.setAttribute('href', '/payment');
      bump('变异:改href', '/payment');
    },
    'form-action'() {
      const form = $('dm-form-target');
      if (form) form.setAttribute('action', '/payment');
      bump('变异:改form action', '/payment');
    },
    'option-text'() {
      const select = $('dm-select-target');
      const option = select?.options[1];
      if (option) option.text = '转账';
      bump('变异:改option文案', '转账');
    },
    /** 直接替换 option 节点：旧节点失效，验证 index / 文案匹配不能误选 */
    'option-replace'() {
      const select = $('dm-select-target');
      const old = select?.options[1];
      if (select && old) {
        const next = document.createElement('option');
        next.value = old.value;
        next.text = '转账（新节点）';
        select.replaceChild(next, old);
      }
      bump('变异:替换option节点');
    },
    'input-type'() {
      const el = $('dm-type-target');
      if (el) el.type = 'password';
      bump('变异:改input type', 'password');
    },
    remove() {
      target()?.remove();
      bump('变异:移除目标节点');
    },
    /** 原位置插入新按钮：index 不应指向这个新的危险对象 */
    replace() {
      const el = target();
      if (el) {
        const next = document.createElement('button');
        next.type = 'button';
        next.id = 'dm-target';
        next.textContent = '立即支付';
        next.addEventListener('click', () => bump('替换后的危险按钮点击'));
        el.replaceWith(next);
      }
      bump('变异:替换目标节点');
    },
    hide() {
      const el = target();
      if (el) el.style.display = 'none';
      bump('变异:隐藏目标');
    },
    disable() {
      const el = target();
      if (el) el.disabled = true;
      bump('变异:禁用目标');
    },
    'insert-before'() {
      const el = target();
      if (el?.parentNode) {
        const danger = document.createElement('button');
        danger.type = 'button';
        danger.textContent = '立即支付';
        danger.addEventListener('click', () => bump('插入的危险按钮点击'));
        el.parentNode.insertBefore(danger, el);
      }
      bump('变异:插入危险按钮');
    },
    reorder() {
      const el = target();
      const parent = el?.parentNode;
      if (el && parent) parent.appendChild(el);
      bump('变异:重排目标到末尾');
    },
  };

  for (const btn of document.querySelectorAll('[data-mut]')) {
    btn.addEventListener('click', () => mutations[btn.dataset.mut]?.());
  }

  const navigations = {
    hash() {
      location.hash = `#step-${Date.now()}`;
    },
    push() {
      history.pushState({ step: Date.now() }, '', '/t3-dynamic?step=push');
    },
    replace() {
      history.replaceState({ step: Date.now() }, '', '/t3-dynamic?step=replace');
    },
    full() {
      location.href = `/t3-dynamic?nav=${Date.now()}`;
    },
    other() {
      location.href = '/checkout';
    },
  };

  for (const btn of document.querySelectorAll('[data-nav]')) {
    btn.addEventListener('click', () => {
      bump(`导航:${btn.dataset.nav}`);
      navigations[btn.dataset.nav]?.();
      showUrl();
    });
  }

  window.addEventListener('popstate', showUrl);
  window.addEventListener('hashchange', showUrl);
  showUrl();
})();
