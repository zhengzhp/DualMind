/**
 * 沉浸式全文翻译的内容脚本挂载入口。
 *
 * 入口形态自 V2 起收归共享悬浮入口（`features/page-fab/`）：
 * 本模块不再自建悬浮按钮，只向入口壳注册「沉浸译」动作；
 * 另保留来自 Background 的指令 / 状态查询（右键菜单「翻译整页」、侧栏控制区）。
 */
import { browser } from 'wxt/browser';
import { type ContentScriptContext } from 'wxt/utils/content-script-context';
import { getImmersivePrefs } from '@/shared/storage/settings';
import type {
  AppSettings,
  ImmersiveDisplayMode,
} from '@/shared/storage/types';
import type { PageFabApi, PageFabActionHandle } from '../page-fab/types';
import { ImmersiveController } from './controller';
import { createImmersiveFabAction } from './fab';

interface ImmersiveCommandMessage {
  type: 'content:immersive-command';
  command: 'start' | 'stop' | 'toggle';
  displayMode?: ImmersiveDisplayMode;
}

/**
 * 挂载沉浸式全文翻译。
 *
 * @param fab 共享悬浮入口。**省略表示不显示悬浮入口**（用户在设置里关了，或本站被排除）——
 *   此时只是没有菜单里的那个动作，翻译能力本身照常：右键「翻译整页」、侧栏控制区、
 *   自动翻译都不受影响。因此本函数**不能**因为入口隐藏就整体跳过，
 *   否则会静默弄坏整页翻译（用户只是不想看到悬浮球）。
 */
export async function mountImmersive(
  ctx: ContentScriptContext,
  _settings: AppSettings,
  fab?: PageFabApi,
): Promise<void> {
  // 读取偏好失败不阻塞功能：退回默认模式
  const prefs = await getImmersivePrefs().catch(() => null);
  const initialMode = prefs?.displayMode ?? 'bilingual';

  // 先声明句柄再建 controller：controller 的状态回调需要把「状态已变」推给入口壳
  let handle: PageFabActionHandle | null = null;
  const controller = new ImmersiveController(() => handle?.update());
  controller.setDisplayMode(initialMode);

  /** 点击时重新读取偏好，避免用户改了设置后页面仍用旧模式 */
  async function toggleWithLatestPrefs(): Promise<void> {
    const latest = await getImmersivePrefs().catch(() => null);
    const mode = latest?.displayMode ?? initialMode;
    controller.setDisplayMode(mode);
    await controller.toggle(mode);
  }

  handle =
    fab?.registerAction(
      createImmersiveFabAction({
        getStatus: () => controller.getStatus(),
        onActivate: toggleWithLatestPrefs,
      }),
    ) ?? null;
  handle?.update();

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
    handle?.dispose();
    controller.stop();
    controller.dispose();
  });

  if (prefs?.autoTranslate) {
    void controller.start(initialMode);
  }
}
