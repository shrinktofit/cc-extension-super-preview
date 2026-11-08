import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      cc: fileURLToPath(new URL('./test/fixtures/cc.ts', import.meta.url)),
      'pal/screen-adapter/web': fileURLToPath(new URL('./test/fixtures/screen-adapter.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
