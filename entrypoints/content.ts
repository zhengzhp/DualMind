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
  },
});
