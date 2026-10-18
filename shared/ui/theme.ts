import type { UiTheme } from '@/shared/storage/uiTheme';

export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/** 系统当前是否偏好深色（非浏览器环境退回浅色） */
export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

/** 把偏好解析成实际主题 */
export function resolveTheme(theme: UiTheme): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  return systemPrefersDark() ? 'dark' : 'light';
}

/**
 * 把解析后的主题写到 `document.documentElement`。
 *
 * 总是写显式的 light / dark（而不是在 system 时删属性）：
 * 这样 CSS 里的媒体查询只作为「JS 尚未执行」的首屏兜底，
 * 不会在用户手动选浅色、系统却是深色时把页面改回深色。
 */
export function applyTheme(theme: UiTheme): 'light' | 'dark' {
  const resolved = resolveTheme(theme);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
  }
  return resolved;
}
