/**
 * T5 长文页：动态插入段落 / 列表，验证沉浸译只移除扩展新增的译文、
 * 不误删站点内容（REG-09），以及 Agent 与翻译 / Chat 共存（UI-11）。
 */
(function () {
  const bump = (name) => window.dmTest?.bump(name);
  const host = document.getElementById('t5-dynamic');
  let seq = 0;

  const append = (node) => {
    host.appendChild(node);
    seq += 1;
  };

  document.getElementById('t5-insert-p')?.addEventListener('click', () => {
    const p = document.createElement('p');
    p.textContent = `动态插入的中文段落 #${seq + 1}：这段文字是运行时创建的，用于观察翻译是否只处理新增内容并正确回退。`;
    append(p);
    bump('插入中文段落');
  });

  document.getElementById('t5-insert-en')?.addEventListener('click', () => {
    const p = document.createElement('p');
    p.textContent = `Dynamically inserted English paragraph #${seq + 1}: this node appears after load so translators must pick it up without duplicating earlier translations.`;
    append(p);
    bump('插入英文段落');
  });

  document.getElementById('t5-insert-list')?.addEventListener('click', () => {
    const ul = document.createElement('ul');
    for (let i = 1; i <= 3; i += 1) {
      const li = document.createElement('li');
      li.textContent = `动态列表项 ${i} · dynamic list item ${i}`;
      ul.appendChild(li);
    }
    append(ul);
    bump('插入列表');
  });

  document.getElementById('t5-normal')?.addEventListener('click', () => bump('普通按钮'));

  // 锚点链接不应被视为危险导航
  document.getElementById('t5-anchor')?.addEventListener('click', () => bump('锚点链接'));
})();
