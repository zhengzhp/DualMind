import { mountImmersive } from '@/features/immersive/mount';
import { mountSelectionToolbar } from '@/features/selection-toolbar/mount';
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
    if (settings.disabledHosts.includes(host)) {
      return;
    }

    await mountSelectionToolbar(ctx, settings);
    // 沉浸式全文翻译：独立 feature，与划词浮层并列，互不干扰
    await mountImmersive(ctx, settings);
  },
});
