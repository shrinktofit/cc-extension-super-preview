import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  publicDir: 'public',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  resolve: {
    alias: {
      cc: fileURLToPath(new URL('./src/boot/cc.ts', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'lib',
    emptyOutDir: true,
    manifest: true,
    minify: false,
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: {
        'assets/boot': 'src/boot.ts',
        'assets/runtime': 'src/runtime.ts',
      },
      formats: ['es'],
      cssFileName: 'style',
    },
    rollupOptions: {
      external: [
        'super-preview',
      ],
      output: {
        assetFileNames: 'assets/[name][extname]',
        chunkFileNames: 'assets/[name].js',
      },
    },
  },
});
