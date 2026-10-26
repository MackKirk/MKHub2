import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubUi = path.resolve(__dirname, '../frontend/src/components/ui');
const hubSrc = path.resolve(__dirname, '../frontend/src');
const portalSrc = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  base: '/portal/',
  plugins: [react()],
  resolve: {
    alias: [
      // Hub UI primitives (design system)
      { find: '@mkhub/ui', replacement: hubUi },
      // Hub-only imports pulled in by shared UI (must be before portal `@`)
      { find: '@/lib/overlayRoot', replacement: path.join(hubSrc, 'lib/overlayRoot') },
      // Portal local aliases
      { find: '@', replacement: portalSrc },
    ],
  },
  server: {
    port: 5174,
    proxy: {
      '/portal/hub': { target: 'http://localhost:8000', changeOrigin: true },
      '/clients': { target: 'http://localhost:8000', changeOrigin: true },
      '/proposals': { target: 'http://localhost:8000', changeOrigin: true },
      '/quotes': { target: 'http://localhost:8000', changeOrigin: true },
      '/ui': { target: 'http://localhost:8000', changeOrigin: true },
      '/privacy': { target: 'http://localhost:8000', changeOrigin: true },
      '/privacy-policy': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
