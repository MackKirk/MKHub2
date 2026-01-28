// Service Worker for MK Hub PWA
// Version: 1.0.0
// Cache static assets only - DO NOT cache API responses

const CACHE_NAME = 'mkhub-v1';
const STATIC_CACHE_NAME = 'mkhub-static-v1';
const OFFLINE_PAGE = '/offline.html';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[Service Worker] Failed to cache some assets:', err);
      });
    })
  );
  // Force activation of new service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE_NAME && cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event - handle requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Don't intercept cross-origin requests (e.g. Azure Blob Storage upload URLs)
  // Let the browser handle PUT/POST to external domains natively
  try {
    const pageOrigin = new URL(self.location.origin).hostname;
    const requestHost = url.hostname;
    if (requestHost !== pageOrigin && requestHost !== 'localhost' && !requestHost.endsWith('.localhost')) {
      return;
    }
  } catch (_) {}

  // NEVER cache API or auth endpoints
  if (url.pathname.startsWith('/api/') || 
      url.pathname.startsWith('/auth/') ||
      url.pathname.startsWith('/files/')) {
    // Network only - do not cache
    event.respondWith(fetch(request));
    return;
  }

  // Handle navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    // Always fetch from network for install page to ensure fresh content
    if (url.pathname === '/install') {
      event.respondWith(fetch(request));
      return;
    }
    
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful HTML responses (except /install) - only GET requests
          if (response.ok && url.pathname !== '/install' && request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline fallback (but not for /install)
          if (url.pathname === '/install') {
            return fetch(request);
          }
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return offline page if available
            return caches.match(OFFLINE_PAGE);
          });
        })
    );
    return;
  }

  // Handle static assets (JS, CSS, images, fonts)
  if (request.destination === 'script' ||
      request.destination === 'style' ||
      request.destination === 'image' ||
      request.destination === 'font' ||
      url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Return from cache
          return cachedResponse;
        }
        // Fetch from network and cache - only GET requests
        return fetch(request).then((response) => {
          if (response.ok && request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        }).catch(() => {
          // If offline and not in cache, return a valid response (never undefined)
          return new Response('', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
    );
    return;
  }

  // Default: network first, fallback to cache - only GET requests
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only cache GET requests (Cache API doesn't support POST/PATCH/PUT/DELETE)
        if (response.ok && request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Only try to get from cache if it's a GET request
        if (request.method === 'GET') {
          return caches.match(request).then((cached) => {
            return cached || caches.match(OFFLINE_PAGE) || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
          });
        }
        // For non-GET requests, return error response (same-origin only; cross-origin not intercepted)
        return new Response('Method not supported offline', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});

// Message handler for skip waiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

