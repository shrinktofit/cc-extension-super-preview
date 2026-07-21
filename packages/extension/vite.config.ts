import { existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
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
