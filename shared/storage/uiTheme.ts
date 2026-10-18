import { storage } from 'wxt/utils/storage';

/** 外观偏好：跟随系统 / 浅色 / 深色 */
export type UiTheme = 'system' | 'light' | 'dark';

export const DEFAULT_UI_THEME: UiTheme = 'system';

function normalize(value: unknown): UiTheme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/**
 * 外观偏好（`local:uiTheme`）。
 *
 * 独立 storage 键：主题切换不应触发 settings / chat / immersive 等业务监听。
 * 扩展页面通过 `bootstrapTheme` 在首屏前读取；内容脚本通过 `bindContentTheme`
 * 写入自己的 shadow 容器，不污染宿主页面的 `data-theme`。
 */
export const uiThemeItem = storage.defineItem<UiTheme>('local:uiTheme', {
  fallback: DEFAULT_UI_THEME,
});

export async function getUiTheme(): Promise<UiTheme> {
  try {
    return normalize(await uiThemeItem.getValue());
  } catch {
    return DEFAULT_UI_THEME;
  }
}

export async function saveUiTheme(theme: UiTheme): Promise<UiTheme> {
  const next = normalize(theme);
  await uiThemeItem.setValue(next);
  return next;
}

export function watchUiTheme(cb: (theme: UiTheme) => void): () => void {
  try {
    return uiThemeItem.watch((next) => cb(normalize(next)));
  } catch {
    return () => {
      /* storage 不可用时静默降级为跟随系统 */
    };
  }
}
