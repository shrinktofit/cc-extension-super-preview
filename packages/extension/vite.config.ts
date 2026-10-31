import { existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

function defineEntries(files: string[]) {
  return Object.fromEntries(files.map((file) => {
    const source = `./src/${file}`;
    if (!existsSync(source)) {
      console.warn(`file not exists: ${source}`);
      return undefined;
    }
    return [file.replace(/\.[^.]+$/, ''), source];
  }).filter((entry) => !!entry));
}

const entries = defineEntries([
  'main.ts',
  'contributions/server/index.ts',
  'contributions/toolbar/index.ts',
]);

export default defineConfig({
  plugins: [vue({
    template: {
      compilerOptions: {
        isCustomElement: (tag) => tag.startsWith('ui-'),
      },
    },
  })],
  define: {
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  resolve: {
    dedupe: ['vue'],
    alias: {
      '@vortex/vue3': 'vue',
    },
  },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: 'inline',
    lib: {
      entry: entries,
      formats: ['cjs'],
      fileName: (_format, entryName) => `${entryName}.cjs`,
      cssFileName: 'style',
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        /^node:.*/,
      ],
    },
  },
});
