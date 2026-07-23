// ─────────────────────────────────────────────────────────
//  MosaicChamp — Service Worker
//  Coloca este archivo en la raíz del servidor (junto a index.html)
//  El registro se hace automáticamente desde index.html
// ─────────────────────────────────────────────────────────

const CACHE_NAME = 'mosaicchamp-v76';

// Recursos que se precachean en la instalación
const PRECACHE = [
  '/',
  '/index.html',

  // React + ReactDOM
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',

  // Babel (necesario para JSX en runtime)
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js',

  // Google Fonts — solo el CSS; los ficheros de fuente los gestiona el browser
  'https://fonts.googleapis.com/css2?family=Pacifico&display=swap',
];

// Dominios que van siempre a red (Firebase, tiempo real)
const NETWORK_ONLY_ORIGINS = [
  'firebasedatabase.app',
  'firebaseio.com',
  'googleapis.com',
  'identitytoolkit.googleapis.com',
];

// ── Install ───────────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // addAll falla si algún recurso no carga; usamos add individual para ser resilientes
      Promise.allSettled(PRECACHE.map(url => cache.add(url)))
    )
  );
});

// ── Activate ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Firebase y APIs de tiempo real → siempre red, nunca caché
  if (NETWORK_ONLY_ORIGINS.some(o => url.hostname.includes(o))) {
    event.respondWith(fetch(request));
    return;
  }

  // 2. Página principal y recursos locales → Cache-first, fallback a red
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
      }).catch(() => caches.match('/index.html')) // fallback offline
    );
    return;
  }

  // 3. CDNs (React, Babel, Fonts) → Cache-first, fallback a red
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
