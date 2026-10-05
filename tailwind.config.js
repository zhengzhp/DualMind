/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './entrypoints/**/*.{html,ts,tsx}',
    './features/**/*.{ts,tsx}',
    './shared/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef8ff',
          100: '#d9eeff',
          500: '#1b7fd1',
          600: '#1466ad',
          700: '#12528c',
          900: '#0f2f4d',
        },
      },
      fontFamily: {
        sans: [
          'IBM Plex Sans',
          'Noto Sans SC',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
