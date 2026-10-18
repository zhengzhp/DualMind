import { browser } from 'wxt/browser';

/**
 * 字体 unicode-range：与 assets/tailwind.css 的 @font-face 保持一致。
 * 中文子集只覆盖 UI 文案实际用字；模型返回的正文按 unicode-range 交给系统字体兜底。
 */
const LATIN_UNICODE_RANGE =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, ' +
  'U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, ' +
  'U+2212, U+2215, U+FEFF, U+FFFD';

const SC_UNICODE_RANGE = 'U+3000-303F, U+4E00-9FFF, U+FF00-FFEF';

function fontUrl(name: string): string {
  // public/ 下的字体不在 WXT 自动生成的 PublicPath 联合类型里，这里显式收窄
  const path = `/fonts/${name}` as Parameters<typeof browser.runtime.getURL>[0];
  return browser.runtime.getURL(path);
}

/**
 * 内容脚本用的 @font-face。
 *
 * 必须用绝对 chrome-extension:// URL（相对路径会解析到宿主页面）；
 * 字体文件在 manifest 的 web_accessible_resources 中开放，否则内容脚本取不到。
 *
 * 注意：@font-face 注入 **document.head**，不能只放在 shadow root 的 <style> 里 ——
 * Chromium 实测不会为 shadow root 内的 @font-face 发起字体请求。
 */
export function contentFontFaceCss(): string {
  return `
    @font-face {
      font-family: 'IBM Plex Sans';
      font-style: normal;
      font-weight: 100 700;
      font-display: swap;
      src: url('${fontUrl('IBMPlexSansVar-Roman.woff2')}') format('woff2');
      unicode-range: ${LATIN_UNICODE_RANGE};
    }
    @font-face {
      font-family: 'IBM Plex Sans SC';
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url('${fontUrl('IBMPlexSansSC-Regular.woff2')}') format('woff2');
      unicode-range: ${SC_UNICODE_RANGE};
    }
    @font-face {
      font-family: 'IBM Plex Sans SC';
      font-style: normal;
      font-weight: 600;
      font-display: swap;
      src: url('${fontUrl('IBMPlexSansSC-SemiBold.woff2')}') format('woff2');
      unicode-range: ${SC_UNICODE_RANGE};
    }
  `;
}
/** 全局字体样式只注入一次；返回解绑函数（引用计数，供多个内容脚本挂载点共用） */
const FONT_STYLE_ID = 'dualmind-content-fonts';
let fontStyleRefCount = 0;

export function installContentFontFaces(): () => void {
  if (typeof document === 'undefined') return () => {};
  let style = document.getElementById(FONT_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = FONT_STYLE_ID;
    style.setAttribute('data-dualmind', 'fonts');
    style.textContent = contentFontFaceCss();
    (document.head ?? document.documentElement).appendChild(style);
  }
  fontStyleRefCount += 1;
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    fontStyleRefCount = Math.max(0, fontStyleRefCount - 1);
    if (fontStyleRefCount === 0) {
      document.getElementById(FONT_STYLE_ID)?.remove();
    }
  };
}
