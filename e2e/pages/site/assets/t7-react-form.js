/**
 * T7 受控表单：复现 React controlled input 的 value tracker 语义（AG-09）。
 *
 * 为什么不用真实 React：
 *   本仓库不引前端运行时到测试页（避免新增依赖 / 打包步骤），但 AG-09 关心的是
 *   **受控输入的判定机制**，而不是 React 本体。React 的 `inputValueTracking`
 *   在节点上定义 value 访问器 + 闭包 current，事件系统比较
 *   `current === node.value` 来决定是否触发 onChange —— 下面如实复现该行为。
 *
 * 两种写入路径的差异：
 *   - `node.value = x`（内容脚本 fill/type 的做法）→ 命中节点访问器 → current 同步
 *     → 判定「无变化」→ onChange 不触发 → 回写受控值（视觉上被覆盖）
 *   - `nativeSetter.call(node, x)`（真实输入 / 键盘）→ 绕过节点访问器 → current 落后
 *     → 判定「有变化」→ onChange 触发 → setState → 重新渲染
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
