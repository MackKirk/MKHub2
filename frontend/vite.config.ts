import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage } from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Browser refresh / address-bar navigation to SPA routes like `/reviews/compare` sends
 * `GET /reviews/...` with `Accept: text/html`. Without this bypass, the dev proxy forwards
 * that request to FastAPI (same `/reviews` prefix as the JSON API), so the shell HTML never
 * loads — users stay stuck on the static "Loading MK Hub..." from index.html or see API errors.
 * Client code uses `fetch` with `Accept: application/json` (see `src/lib/api.ts`), so real API
 * calls still hit the backend.
 */
function spaDocumentBypass(req: IncomingMessage): string | undefined {
  if (req.method !== 'GET' && req.method !== 'HEAD') return undefined;
  const dest = String(req.headers['sec-fetch-dest'] ?? '');
  if (dest === 'document') return '/index.html';
  const accept = String(req.headers.accept ?? '');
  if (accept.includes('text/html')) return '/index.html';
  return undefined;
}

/** Proxies that must always reach the backend (file downloads, bundled UI, etc.). */
const PROXY_NO_SPA_BYPASS = new Set(['/files', '/ui']);

/** Same-origin API paths served by FastAPI (localhost:8000). Must match app/routes * APIRouter prefixes so `npm run dev` proxies JSON to the backend instead of returning SPA HTML. */
const BACKEND_DEV_TARGET = 'http://localhost:8000';
const backendProxyPrefixes = [
  '/admin',
  '/api',
  '/auth',
  '/bug-report',
  '/calendar',
  '/chat',
  '/clients',
  '/community',
  '/company',
  '/company-credit-cards',
  '/dispatch',
  '/document-creator',
  '/employees',
  '/estimate',
  '/files',
  '/fleet',
  '/form-custom-lists',
  '/form-templates',
  '/integrations',
  '/inventory',
  '/notifications',
  '/onboarding',
  '/offboarding',
  '/orders',
  '/permissions',
  '/projects',
  '/proposals',
  '/quotes',
  '/reviews',
  '/safety',
  '/search',
  '/settings',
  '/subcontractors',
  '/task-requests',
  '/tasks',
  '/training',
  '/ui',
  '/users',
] as const;

const backendDevProxy = Object.fromEntries(
  backendProxyPrefixes.map((prefix) => {
    const cfg: {
      target: string;
      changeOrigin: boolean;
      ws?: boolean;
      bypass?: typeof spaDocumentBypass;
    } = {
      target: BACKEND_DEV_TARGET,
      changeOrigin: true,
    };
    if (prefix === '/chat') cfg.ws = true;
    if (!PROXY_NO_SPA_BYPASS.has(prefix)) cfg.bypass = spaDocumentBypass;
    return [prefix, cfg];
  })
);

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
    include: ['qrcode', 'html5-qrcode', 'react-grid-layout']
  },
  server: { 
    port: 5173, 
    host: true,
    proxy: backendDevProxy,
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


