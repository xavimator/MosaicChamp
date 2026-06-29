const CACHE_NAME = 'mosaic-champ-v1';

// Archivos a cachear para funcionamiento offline
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/licenses.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Instalación: precachear recursos estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activación: limpiar caches antiguas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first para Firebase/CDN, cache-first para assets locales
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Dejar pasar Firebase, CDN y Google Fonts sin cachear
  const passThrough = [
    'firebaseio.com',
    'googleapis.com',
    'gstatic.com',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
  ];
  if (passThrough.some(domain => url.hostname.includes(domain))) {
    return; // red directa
  }

  // Cache-first para assets locales
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Solo cachear respuestas válidas del mismo origen
        if (
          response.ok &&
          url.origin === self.location.origin
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Fallback offline: devolver index.html para navegación
      if (event.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});
