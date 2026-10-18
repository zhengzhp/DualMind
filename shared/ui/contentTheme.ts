import {
  getUiTheme,
  watchUiTheme,
  type UiTheme,
} from '@/shared/storage/uiTheme';
import { DARK_MEDIA_QUERY, resolveTheme } from './theme';

/**
 * 把扩展主题绑定到内容脚本的 shadow 容器上。
 *
 * 不写宿主页面的 `data-theme`：那是页面的命名空间，扩展不应改动；
 * CSS 侧统一用 `[data-dm-theme="dark"]` 作用域。返回解绑函数，随上下文失效调用。
 */
export function bindContentTheme(el: HTMLElement): () => void {
  let current: UiTheme = 'system';
  let alive = true;

  const apply = () => {
    el.dataset.dmTheme = resolveTheme(current);
  };
  apply();

  void getUiTheme().then((theme) => {
    if (!alive) return;
    current = theme;
    apply();
  });

  const unwatch = watchUiTheme((theme) => {
    current = theme;
    apply();
  });

  const media =
    typeof window.matchMedia === 'function'
      ? window.matchMedia(DARK_MEDIA_QUERY)
      : null;
  const onChange = () => {
    if (current === 'system') apply();
  };
  media?.addEventListener?.('change', onChange);

  return () => {
    alive = false;
    unwatch();
    media?.removeEventListener?.('change', onChange);
  };
}
