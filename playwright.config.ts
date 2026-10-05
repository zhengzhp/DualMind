import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: path.resolve(here, 'e2e'),
  // 只收集 *.e2e.ts；*.test.ts 归 Vitest（两者互不误收）
  testMatch: '**/*.e2e.ts',
  // 扩展的 storage / service worker 在用例间共享，必须串行
  workers: 1,
  fullyParallel: false,
  // 真实本地模型推理较慢，放宽超时
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
  },
});
