const CACHE_VERSION = "v4";
const CACHE_NAME = `callcenter-cache-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

const STATIC_FILES = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// INSTALAR
self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_FILES);
    })
  );
});

// ACTIVAR
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );

      await self.clients.claim();
    })()
  );
});

// Detectar navegación HTML
function isNavigationRequest(request) {
  return (
    request.mode === "navigate" ||
    (request.destination === "" && request.method === "GET")
  );
}

// FETCH
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // NO cachear Apps Script
  const isAppsScriptEndpoint =
    url.hostname === "script.google.com" &&
    url.pathname.includes("/macros/s/") &&
    url.pathname.endsWith("/exec");

  if (isAppsScriptEndpoint) {
    event.respondWith(
      fetch(request, {
        cache: "no-store"
      })
    );
    return;
  }

  // NO cachear JSON/API
  const acceptHeader = request.headers.get("accept") || "";
  const isApiJson = acceptHeader.includes("application/json");
  const hasNoCacheParam = url.searchParams.has("nocache");

  if (isApiJson || hasNoCacheParam) {
    event.respondWith(
      fetch(request, {
        cache: "no-store"
      })
    );
    return;
  }

  // HTML → network first
  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);

          const cache = await caches.open(CACHE_NAME);
          cache.put(request, fresh.clone());

          return fresh;
        } catch (error) {
          const cached = await caches.match(request);

          if (cached) return cached;

          const offline = await caches.match(OFFLINE_URL);

          if (offline) return offline;

          throw error;
        }
      })()
    );

    return;
  }

  // Archivos estáticos → cache first
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);

      if (cached) return cached;

      try {
        const fresh = await fetch(request);

        const cache = await caches.open(CACHE_NAME);
        cache.put(request, fresh.clone());

        return fresh;
      } catch (error) {
        console.log("Error fetch:", error);
      }
    })()
  );
});