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
      '/admin': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/onboarding': {
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
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // React + React-DOM must be in the SAME chunk to avoid "multiple React copies" crash
            if (id.includes('react-dom') || id.includes('/react/')) return 'vendor-react';
            if (id.includes('react-router') || id.includes('react-router-dom')) return 'vendor-router';
            if (id.includes('@tanstack/react-query')) return 'vendor-query';
            if (id.includes('framer-motion')) return 'vendor-motion';
            // Do NOT split react-grid-layout: it extends React.Component and can run before React is ready in another chunk
          }
        }
      }
    }
  },
  publicDir: 'public'
});


