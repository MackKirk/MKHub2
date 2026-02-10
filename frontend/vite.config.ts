import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // react-grid-layout subpaths (Rollup may not resolve package exports for ESM build)
      'react-grid-layout/legacy': path.resolve(__dirname, 'node_modules/react-grid-layout/dist/legacy.mjs'),
      'react-grid-layout': path.resolve(__dirname, 'node_modules/react-grid-layout/dist/index.mjs'),
    }
  },
  optimizeDeps: {
    include: ['qrcode', 'react-grid-layout']
  },
  server: { 
    port: 5173, 
    host: true,
    proxy: {
      // Proxy para APIs do backend durante desenvolvimento
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/files': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ui': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/users': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/projects': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/tasks': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/quotes': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    }
  },
  build: { 
    outDir: 'dist',
    commonjsOptions: {
      include: [/qrcode/, /node_modules/],
      transformMixedEsModules: true
    },
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  publicDir: 'public'
});


