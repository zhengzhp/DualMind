import { mountImmersive } from '@/features/immersive/mount';
import { mountChatContext, mountChatFabAction } from '@/features/chat/mount';
import { mountPageFab } from '@/features/page-fab/mount';
import { mountSelectionToolbar } from '@/features/selection-toolbar/mount';
import { isHostDisabled, shouldShowPageFab } from '@/shared/siteAccess';
import { sendMessage } from '@/shared/messaging/client';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    let settings;
    try {
      settings = await sendMessage('settings:get', undefined);
    } catch {
      return;
    }

    const host = window.location.hostname;
    // 整站停用：划词与悬浮入口一起不注入（沿用既有语义）
    if (isHostDisabled(settings.disabledHosts, host)) {
      return;
    }

    await mountSelectionToolbar(ctx, settings);

    /*
     * 悬浮入口是**可独立关闭**的（见 docs/decisions-v2.md「入口级开关与粒度」）：
     * 用户可能只想关掉悬浮球、仍要用划词翻译与整页翻译，
     * 因此这里不能与上面的「整站停用」合并成一个早退。
     * 不显示时干脆不建壳、不注册动作（比挂了再隐藏更干净，也不占监听）。
     */
    const fab = shouldShowPageFab(settings, host)
      ? await mountPageFab(ctx)
      : undefined;

    /*
     * 沉浸式全文翻译：既能注册入口动作（有入口时），也负责右键「翻译整页」、
     * 侧栏指令与「打开网页自动翻译」。**入口隐藏时仍必须挂载**，
     * 否则用户只是不想看悬浮球，却把整页翻译一起弄坏了。
     */
    await mountImmersive(ctx, settings, fab);

    if (fab) {
      // V2 网页总结：注册「总结本页」动作（入口动作，无入口则无可注册之处）
      mountChatFabAction(fab);
    }
    // V2 网页上下文提取：仅注册监听，按需响应（不主动做任何请求）
    // 与悬浮入口无关 —— 右键菜单的「总结本页」同样依赖它
    mountChatContext();
  },
});
