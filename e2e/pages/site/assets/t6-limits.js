/**
 * T6 限制页：构造 open / closed Shadow DOM，并刻意让边界行为可观测。
 *
 * 说明：内容脚本的 `document.querySelectorAll` 不会穿透 shadow root，
 * 因此下列 shadow 内按钮**不应**出现在 snapshot 中；若 Agent 声称点到了它们，即为虚假成功。
 */
(function () {
  const bump = (name) => window.dmTest?.bump(name);

  // 对照组：普通按钮，应可被观测并可被点击
  document.getElementById('ok-button')?.addEventListener('click', () => bump('普通按钮'));

  // open shadow root：外部仍可通过 host.shadowRoot 深入，但常规 querySelectorAll 不会
  const openHost = document.getElementById('host-open');
  const openRoot = openHost.attachShadow({ mode: 'open' });
  openRoot.innerHTML =
    '<style>button{padding:6px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer}</style>' +
    '<p>open shadow root</p>' +
    '<button id="shadow-open-btn" type="button">Shadow 内按钮（open）</button>';
  openRoot.getElementById('shadow-open-btn').addEventListener('click', () => bump('shadow:open'));

  // closed shadow root：外部拿不到 shadowRoot，连脚本也不能从外部查询
  const closedHost = document.getElementById('host-closed');
  const closedRoot = closedHost.attachShadow({ mode: 'closed' });
  closedRoot.innerHTML =
    '<p>closed shadow root</p>' +
    '<button id="shadow-closed-btn" type="button">Shadow 内按钮（closed）</button>';
  closedRoot.getElementById('shadow-closed-btn').addEventListener('click', () => bump('shadow:closed'));
})();
