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
        'brand-mark': '#1B7FD1',
      },
      borderRadius: {
        panel: '18px',
        card: '14px',
        control: '10px',
        chip: '6px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0, 0, 0, 0.04)',
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
