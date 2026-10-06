/**
 * 沉浸式全文翻译的内容脚本挂载入口。
 *
 * 提供两类入口：
 * 1. 页面右下角悬浮按钮（toggle）
 * 2. 来自 Background 的指令 / 状态查询（右键菜单「翻译整页」、侧栏控制区）
 */
import { browser } from 'wxt/browser';
import { type ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { getImmersivePrefs } from '@/shared/storage/settings';
import type {
  AppSettings,
  ImmersiveDisplayMode,
} from '@/shared/storage/types';
import { ImmersiveController } from './controller';
import { createFabStyles, renderFab } from './dom';

interface ImmersiveCommandMessage {
  type: 'content:immersive-command';
  command: 'start' | 'stop' | 'toggle';
  displayMode?: ImmersiveDisplayMode;
}

export async function mountImmersive(
  ctx: ContentScriptContext,
  _settings: AppSettings,
): Promise<void> {
  // 读取偏好失败不阻塞功能：退回默认模式
  const prefs = await getImmersivePrefs().catch(() => null);
  const initialMode = prefs?.displayMode ?? 'bilingual';

  const ui = await createShadowRootUi(ctx, {
    name: 'dualmind-immersive',
    position: 'overlay',
    alignment: 'top-left',
    zIndex: 2147483645,
    onMount(container) {
      const root = document.createElement('div');
      root.id = 'dualmind-immersive-root';
      const style = document.createElement('style');
      style.textContent = createFabStyles();
      container.append(style, root);
      return root;
    },
  });

  ui.mount();
  const root = ui.mounted!;

  const wrap = document.createElement('div');
  wrap.className = 'dm-fab-wrap';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dm-fab';
  wrap.append(button);
  root.append(wrap);

  const controller = new ImmersiveController((status) =>
    renderFab(button, status),
  );
  controller.setDisplayMode(initialMode);
  renderFab(button, controller.getStatus());

  // 点击时重新读取偏好，避免用户改了设置后页面仍用旧模式
  button.addEventListener('click', () => {
    void (async () => {
      const latest = await getImmersivePrefs().catch(() => null);
      const mode = latest?.displayMode ?? initialMode;
      controller.setDisplayMode(mode);
      await controller.toggle(mode);
    })();
  });

  // 接收 Background 转发过来的指令 / 状态查询（需 return true 保持异步响应通道）
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const type = (message as { type?: string })?.type;
    if (
      type !== 'content:immersive-command' &&
      type !== 'content:immersive-query'
    ) {
      return undefined;
    }

    void (async () => {
      if (type === 'content:immersive-command') {
        const command = (message as ImmersiveCommandMessage).command;
        const mode = (message as ImmersiveCommandMessage).displayMode;
        if (command === 'stop') controller.stop();
        else if (command === 'start') await controller.start(mode ?? initialMode);
        else await controller.toggle(mode ?? initialMode);
      }
      sendResponse(controller.getStatus());
    })();
    return true;
  });

  // 页面上下文失效（导航 / 扩展更新）时退出翻译并清理观察者
  ctx.onInvalidated(() => {
    controller.stop();
    controller.dispose();
  });

  if (prefs?.autoTranslate) {
    void controller.start(initialMode);
  }
}
