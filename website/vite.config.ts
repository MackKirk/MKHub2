import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: '/website/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5175,
    proxy: {
      '/public/metals': { target: 'http://localhost:8000', changeOrigin: true },
      '/portal/metals': { target: 'http://localhost:8000', changeOrigin: true },
      '/assets': { target: 'http://localhost:8000', changeOrigin: true },
      '/ui': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  // Dev uses Vite root; production assets live under /website/assets
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
