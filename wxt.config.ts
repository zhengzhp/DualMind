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
    // 仅保留实际使用的权限：
    // - storage：设置与会话；sidePanel：侧边栏工作台；contextMenus：右键翻译
    // - 不使用 activeTab / scripting：tabs.sendMessage 只需目标页已有 content script，
    //   无需 host 权限或 activeTab；项目也未调用 scripting.executeScript
    permissions: ['storage', 'sidePanel', 'contextMenus'],
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
          // macOS 上 Chrome 会把 Ctrl 自动转换为 Command（即 ⌘+Shift+K）
          default: 'Ctrl+Shift+K',
          mac: 'Command+Shift+K',
        },
        description: '翻译当前选中文本',
      },
    },
  },
});
