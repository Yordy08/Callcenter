const CACHE_VERSION = 'v3';
const CACHE_NAME = `callcenter-cache-${CACHE_VERSION}`;


self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
      await self.clients.claim();
    })()
  );
});

function isNavigationRequest(request) {
  return request.mode === 'navigate' || (request.destination === '' && request.method === 'GET');
}

const OFFLINE_URL = '/offline.html';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Nunca cachear el backend de Apps Script (evita que celulares vean datos viejos)
  // endpoint: https://script.google.com/macros/s/<id>/exec
  const url = new URL(request.url);
  const isAppsScriptEndpoint =
    url.hostname === 'script.google.com' &&
    url.pathname.includes('/macros/s/') &&
    url.pathname.endsWith('/exec');

  if (isAppsScriptEndpoint) {
    event.respondWith(
      (async () => {
        return fetch(request, { cache: 'no-store' });
      })()
    );
    return;
  }

  // Evitar cachear peticiones API/JSON o cuando se incluye nocache en params
  const acceptHeader = request.headers.get('accept') || '';
  const isApiJson = acceptHeader.includes('application/json');
  const hasNoCacheParam = url.searchParams.has('nocache');
  if (isApiJson || hasNoCacheParam) {
    event.respondWith((async () => fetch(request, { cache: 'no-store' }))());
    return;
  }

  // For navigations (HTML), go network-first to reflect changes quickly.
  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, fresh.clone());
          return fresh;
        } catch (err) {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          throw err;
        }
      })()
    );
    return;
  }

  // For everything else: cache-first.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      const fresh = await fetch(request);
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, fresh.clone()).catch(() => {});
      return fresh;
    })()
  );
});


