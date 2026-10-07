/**
 * T1 静态表单：把每个可观测动作接到计数器上（ENV-01）。
 * 提交一律 preventDefault，保证只是「本页可观测」，不会真的发请求。
 */
(function () {
  const bump = (name) => window.dmTest?.bump(name);

  // 普通按钮：AG-11 期望点击后计数 +1，且不产生额外点击
  document.getElementById('dm-plain')?.addEventListener('click', () => bump('普通按钮'));

  // 删除 / 清空：SEC-06 期望执行前有危险确认
  document.getElementById('dm-delete')?.addEventListener('click', () => bump('删除草稿'));
  document.getElementById('dm-clear')?.addEventListener('click', () => {
    document.getElementById('dm-form')?.reset();
    bump('清空表单');
  });

  // 表单提交：SEC-06 期望点击提交控件前有危险确认；这里只记数
  document.getElementById('dm-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    bump('表单提交');
  });

  // checkbox / radio：AG-11
  for (const id of ['dm-news', 'dm-agree', 'dm-mail', 'dm-phone']) {
    document.getElementById(id)?.addEventListener('change', () => bump(`选中:${id}`));
  }

  // select：AG-10
  document.getElementById('dm-city')?.addEventListener('change', (event) => {
    const select = event.target;
    bump('选择城市', select.value || '(空)');
  });

  // 输入类：观察 fill / type 是否真的派发了 input / change
  for (const id of ['dm-name', 'dm-note', 'dm-prefill', 'dm-password']) {
    const el = document.getElementById(id);
    el?.addEventListener('input', () => bump(`input:${id}`));
    el?.addEventListener('change', () => bump(`change:${id}`));
  }
  document.getElementById('dm-bio')?.addEventListener('input', () => bump('input:dm-bio'));

  // 无障碍名称按钮 / 空名称按钮：仅用于快照与点击，不额外记数
  document.getElementById('dm-aria')?.addEventListener('click', () => bump('无障碍名称按钮'));
})();
