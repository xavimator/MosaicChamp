/* ============================================================
   SERVICE WORKER
   1708 · Sostenibilidad aplicada a los sectores productivos
   ============================================================
   Estrategia:
   - El documento principal (index.html) usa "network-first": si hay
     internet, siempre se sirve la versión más reciente y se actualiza
     la caché; si no hay conexión, se sirve la última copia guardada.
   - Los recursos externos (fuentes, librería de Supabase) usan
     "cache-first": una vez descargados, no vuelven a pedirse por red.
   - Las llamadas a Supabase (api/rest) NUNCA se cachean: necesitan
     red real siempre, así que se dejan pasar directamente.
*/

const CACHE_VERSION = 'v1';
const CACHE_NAME = `sasp-1708-${CACHE_VERSION}`;

// Se precachea el propio documento para que la primera visita
// ya deje una copia utilizable sin conexión.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('sasp-1708-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function isSupabaseRequest(url) {
  return url.hostname.endsWith('.supabase.co');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // no cachear POST/PATCH (los inserts/updates de Supabase)

  const url = new URL(req.url);

  // Nunca interceptar llamadas a Supabase: deben ir siempre a la red.
  if (isSupabaseRequest(url)) return;

  // El documento HTML principal: network-first con fallback a caché.
  if (req.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname === '/' ) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  // Resto de recursos externos (fuentes, CDN de Supabase JS, etc.): cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
