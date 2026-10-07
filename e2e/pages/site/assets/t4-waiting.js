/**
 * T4 等待页：把「延时 / 定时 / 导航」都变成可独立观测的计数与状态，
 * 以便判定停止之后是否还有后续动作落地（LIFE-04 / LIFE-06）。
 */
(function () {
  const bump = (name, detail) => window.dmTest?.bump(name, detail);

  // 1. 点击计数
  let clicks = 0;
  const clickCount = document.getElementById('w-click-count');
  document.getElementById('w-click')?.addEventListener('click', () => {
    clicks += 1;
    clickCount.textContent = String(clicks);
    bump('点击一次', String(clicks));
  });

  // 2. 延时出现文本：供 wait({ text: '延时完成' }) 与 LIFE-04 使用
  const delayState = document.getElementById('w-delay-state');
  const delayedText = document.getElementById('w-delayed-text');
  let delayTimer;
  document.getElementById('w-delay')?.addEventListener('click', () => {
    clearTimeout(delayTimer);
    delayedText.style.display = 'none';
    delayState.textContent = '等待中…';
    bump('开始延时');
    delayTimer = setTimeout(() => {
      delayedText.style.display = 'block';
      delayState.textContent = '已出现';
      bump('延时完成'); // 若停止后仍 +1，说明取消未生效
    }, 3000);
  });

  // 3. 定时连续变化：停止后仍持续 +1 即说明未清理定时器
  let ticks = 0;
  let tickTimer;
  const tickCount = document.getElementById('w-tick-count');
  document.getElementById('w-tick-start')?.addEventListener('click', () => {
    clearInterval(tickTimer);
    bump('开始定时');
    tickTimer = setInterval(() => {
      ticks += 1;
      tickCount.textContent = String(ticks);
      bump('定时记数', String(ticks));
    }, 500);
  });
  document.getElementById('w-tick-stop')?.addEventListener('click', () => {
    clearInterval(tickTimer);
    bump('停止定时');
  });

  // 4. 导航
  document.getElementById('w-nav')?.addEventListener('click', () => {
    bump('导航:同页 query');
    location.href = `/t4-waiting?nav=${Date.now()}`;
  });
  document.getElementById('w-nav-other')?.addEventListener('click', () => {
    bump('导航:/checkout');
    location.href = '/checkout';
  });
})();
