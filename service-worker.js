const CACHE_NAME = "llamada-directa-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/imagen/danilo.jpg",
  "/imagen/yordy.jpg",
  "/imagen/nafer.jpg",
  "/imagen/dina.jpg",
  "/imagen/yuli.jpg",
  "/imagen/jose.jpg",
  "/imagen/estaban.jpg",
  "/imagen/eduar.jpg",
  "/imagen/duvan.jpg",
  "/imagen/yeli.jpg",
  "/imagen/lenis.jpg",
  "/imagen/nuvis.jpg",
  "/imagen/tibu.jpg",
  "/imagen/buena.png",
  "/imagen/elor.jpg"
];

// Instalar y guardar en caché
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Activar y limpiar cachés viejos
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

// Interceptar requests
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});
