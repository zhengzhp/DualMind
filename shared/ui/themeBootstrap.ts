import {
  getUiTheme,
  watchUiTheme,
  type UiTheme,
} from '@/shared/storage/uiTheme';
import { applyTheme, DARK_MEDIA_QUERY } from './theme';

let current: UiTheme = 'system';
let started = false;

/**
 * 扩展页面首屏主题引导。
 *
 * 在 React 渲染前 `await` 一次，避免「先浅后深」闪一下；
 * 之后监听 storage 与系统偏好，设置页切换即时生效。
 */
export async function bootstrapTheme(): Promise<void> {
  if (started) return;
  started = true;

  current = await getUiTheme();
  applyTheme(current);

  watchUiTheme((next) => {
    current = next;
    applyTheme(next);
  });

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = () => {
      if (current === 'system') applyTheme('system');
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
    } else if (typeof media.addListener === 'function') {
      media.addListener(onChange);
    }
  }
}
