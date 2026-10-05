import { defineConfig } from 'wxt';

// DualMind 扩展配置：Chrome/Edge MV3，Side Panel 为主入口
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'DualMind',
    description: 'AI 浏览器助手 — 划词翻译 / Side Panel / 本地 Ollama',
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    permissions: [
      'storage',
      'sidePanel',
      'activeTab',
      'scripting',
      'contextMenus',
    ],
    host_permissions: [
      'http://127.0.0.1:11434/*',
      'http://localhost:11434/*',
      '<all_urls>',
    ],
    action: {
      default_title: '打开 DualMind',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
      },
    },
    commands: {
      'translate-selection': {
        suggested_key: {
          default: 'Alt+Shift+K',
          mac: 'Alt+Shift+K',
        },
        description: '翻译当前选中文本',
      },
    },
  },
});
