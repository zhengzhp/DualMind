/**
 * T7 受控表单：复现 React controlled input 的 value tracker 语义（AG-09）。
 *
 * 实现说明：本页用原生 JS **复现** React 受控输入的关键机制 —— 框架在节点上定义
 *   `value` 访问器并维护一个「框架认为的值」。**但请先读下面的局限警告**。
 *
 * ⚠️ 局限（曾导致误报 DM-V3-001，2026-10-08 已撤回）：
 *   本脚本运行在**主世界**，而扩展内容脚本运行在**隔离世界**。主世界在**主世界的节点包装对象**
 *   上定义访问器；隔离世界的 `node.value = x` 碰不到该属性，会落到原生 prototype setter，
 *   于是本页的 `current` 记录滞后 → 判定「有变化」→ 触发 onChange。
 *   换言之：**隔离世界写入等价于「原生 setter 路径」**，真实扩展的 fill 是有效的。
 *   因此两处「受控:直写被判定为无变化并回写」计数只代表**主世界机制演示**，
 *   不能作为「扩展 fill 失效」的证据。
 *
 * 两条路径的差异（**均指主世界内**）：
 *   - 主世界 `node.value = x`（如本页控制台、Runtime.evaluate）→ 命中节点访问器 → current 同步
 *     → 判定「无变化」→ onChange 不触发 → 回写受控值（视觉上被覆盖）
 *   - 主世界 `nativeSetter.call(node, x)` / 真实键盘输入 → 绕过节点访问器 → current 落后
 *     → 判定「有变化」→ onChange 触发 → setState → 重新渲染
 *   - 隔离世界（扩展内容脚本）`node.value = x` → **等价于上面的原生 setter 路径**（见上警告）
 */
(function () {
  const bump = (name, detail) => window.dmTest?.bump(name, detail);
  const $ = (id) => document.getElementById(id);

  const state = { name: '', note: '' };

  function render() {
    $('r-name-state').textContent = state.name || '（空）';
    $('r-note-state').textContent = state.note || '（空）';
    $('r-name-dom').textContent = $('r-name').value || '（空）';
    $('r-note-dom').textContent = $('r-note').value || '（空）';
    // 受控渲染：把 DOM 值对齐到应用状态（React 每次渲染都会做这件事）
    setViaTracker($('r-name'), state.name);
    setViaTracker($('r-note'), state.note);
  }

  /** 通过 tracker 访问器写值（等价于 React 重新渲染时设置 value） */
  function setViaTracker(node, value) {
    if (node.value !== value) node.value = value;
  }

  /**
   * 给节点装上 tracker 并订阅 input：语义与 React 一致。
   * @param {HTMLInputElement | HTMLTextAreaElement} node
   * @param {(value: string) => void} onChange
   */
  function makeControlled(node, onChange) {
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(node),
      'value',
    );
    // 框架记录的「当前值」
    let current = String(node.value ?? '');

    Object.defineProperty(node, 'value', {
      configurable: true,
      get() {
        return descriptor.get.call(this);
      },
      set(next) {
        current = String(next);
        descriptor.set.call(this, next);
      },
    });

    node.addEventListener('input', () => {
      const domValue = String(node.value);
      if (domValue === current) {
        // 直写 .value：tracker 与 DOM 一致 → React 判定「无变化」
        bump('受控:直写被判定为无变化并回写');
        render(); // 回写受控值，视觉效果消失
        return;
      }
      current = domValue;
      bump('受控:onChange 触发', domValue.slice(0, 20));
      onChange(domValue);
    });
  }

  makeControlled($('r-name'), (value) => {
    state.name = value;
    render();
  });
  makeControlled($('r-note'), (value) => {
    state.note = value;
    render();
  });

  // contenteditable：非受控，仅镜像输入
  $('r-bio')?.addEventListener('input', (event) => {
    $('r-bio-state').textContent = event.target.textContent || '（空）';
    bump('contenteditable input');
  });

  // 对照组：用原型上的原生 setter 写值，绕过 tracker → 应正常触发 onChange
  $('r-native-set')?.addEventListener('click', () => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set;
    nativeSetter.call($('r-name'), '张三');
    $('r-name').dispatchEvent(new Event('input', { bubbles: true }));
    bump('原生 setter 模拟真实输入');
  });

  $('r-force-render')?.addEventListener('click', () => {
    bump('强制重渲染');
    render();
  });

  $('r-reset')?.addEventListener('click', () => {
    state.name = '';
    state.note = '';
    render();
    $('r-bio').textContent = '';
    $('r-bio-state').textContent = '（空）';
    bump('重置受控状态');
  });

  render();
  window.dmControlledState = state;
})();
