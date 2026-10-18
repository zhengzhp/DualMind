/** @type {import('tailwindcss').Config} */
// 语义色统一走 CSS 变量（RGB 三元组）：组件只写语义名，浅/深色只换变量值。
// 见 docs/ui-refresh-plan.md §4。
const token = (name) => `rgb(var(--dm-${name}) / <alpha-value>)`;

export default {
  content: [
    './entrypoints/**/*.{html,ts,tsx}',
    './features/**/*.{ts,tsx}',
    './shared/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 旧品牌色阶：只为仍在使用历史类名的位置保留，新代码请用下方语义 token
        brand: {
          50: '#eef8ff',
          100: '#d9eeff',
          500: '#1b7fd1',
          600: '#1466ad',
          700: '#12528c',
          900: '#0f2f4d',
        },
        canvas: token('canvas'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        line: token('line'),
        'line-strong': token('line-strong'),
        ink: token('ink'),
        'ink-2': token('ink-2'),
        'ink-3': token('ink-3'),
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          soft: token('accent-soft'),
        },
        success: token('success'),
        'success-soft': token('success-soft'),
        warn: token('warn'),
        'warn-soft': token('warn-soft'),
        danger: token('danger'),
        'danger-soft': token('danger-soft'),
        'on-accent': token('on-accent'),
        'on-danger': token('on-danger'),
        'on-warn': token('on-warn'),
        // 品牌标记色：浅色 #1B7FD1 / 深色 #6FAEEC，由 CSS 变量按主题切换
        'brand-mark': token('brand-mark'),
      },
      borderRadius: {
        panel: '18px',
        card: '14px',
        control: '10px',
        chip: '6px',
      },
      boxShadow: {
        // 值走 CSS 变量：深色下自动换成 1px 描边（阴影在深底上不可见）
        card: 'var(--dm-shadow-card)',
        popover: '0 12px 32px rgba(15, 23, 32, 0.14)',
      },
      fontFamily: {
        sans: [
          'IBM Plex Sans',
          'IBM Plex Sans SC',
          'PingFang SC',
          'Microsoft YaHei',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
      // 内置中文字体只有 400 / 600 两档：UI 一律用 font-normal / font-semibold，
      // 不用 font-medium（500）——否则中文会回退到 400，与拉丁字重不一致。
      fontSize: {
        display: ['20px', '28px'],
        title: ['16px', '24px'],
        body: ['14px', '22px'],
        'body-strong': ['14px', '22px'],
        reading: ['15px', '26px'],
        label: ['12px', '18px'],
        meta: ['11px', '16px'],
        mono: ['12px', '18px'],
      },
    },
  },
  plugins: [],
};
