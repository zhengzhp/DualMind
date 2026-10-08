import { defineConfig } from 'wxt';

// DualMind 扩展配置：Chrome/Edge MV3，Side Panel 为主入口
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'DualMind',
    description:
      'AI 浏览器助手（BYOK）：划词与整页翻译、网页摘要与问答，以及逐次批准的本页操作 Agent',
    // sidePanel API 需 Chrome 114+；显式声明最低版本，避免老版本上 chrome.sidePanel 为 undefined
    minimum_chrome_version: '114',
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
          // macOS 上 Alt 即 Option，故 Alt+K 等价于 Option+K
          default: 'Alt+K',
          mac: 'Alt+K',
        },
        description: '翻译当前选中文本',
      },
    },
  },
});
