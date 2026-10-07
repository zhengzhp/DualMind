/**
 * T6-2 CSP 限制页（UI-10）。
 *
 * 两个「应当失败」的控件：
 * 1. inline `onclick`：被页面 CSP 的 script-src 'self' 拦下，永远不会执行
 * 2. `isTrusted` 校验：ignoreEvent 只接受真实用户输入，`el.click()` 产生的合成事件不算
 *
 * 对照组（普通按钮）用于证明「页面本身是好的」，把失败归因到能力限制而非页面损坏。
 */
(function () {
  const bump = (name) => window.dmTest?.bump(name);

  // 2. 只接受可信事件：合成点击（isTrusted === false）不计入
  let trusted = 0;
  const trustedCount = document.getElementById('trusted-count');
  document.getElementById('trusted-only')?.addEventListener('click', (event) => {
    if (!event.isTrusted) return; // 明确忽略自动化产生的合成事件
    trusted += 1;
    trustedCount.textContent = String(trusted);
    bump('trusted:真实点击');
  });

  // 3. 对照组：普通按钮照常计数
  document.getElementById('plain-csp')?.addEventListener('click', () => bump('普通按钮'));
})();
