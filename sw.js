const CACHE_NAME = 'mosaic-champ-v2';

// Archivos a cachear para funcionamiento offline
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/licenses.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Firebase Cloud Messaging (push notifications) ──
// Compat libs funcionan directamente dentro de un service worker clásico.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyBPLE08QsDhA4JkRXAiAM5m98hsiHkuBGY",
  authDomain:        "mosaic-champ-db.firebaseapp.com",
  databaseURL:       "https://mosaic-champ-db-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "mosaic-champ-db",
  storageBucket:     "mosaic-champ-db.firebasestorage.app",
  messagingSenderId: "217247862933",
  appId:             "1:217247862933:web:232fb770b3974dd6c20b9c",
});

// getMessaging puede fallar en navegadores sin soporte (ej. Safari antiguo); no debe romper el SW.
let messaging = null;
try { messaging = firebase.messaging(); } catch (e) { /* push no soportado */ }

if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'Mosaic Champ';
    const options = {
      body: payload.notification?.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: payload.data || {},
    };
    self.registration.showNotification(title, options);
  });
}

// Al pulsar la notificación, enfocar o abrir la app (y unirse a la partida si viene un código)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const code = event.notification.data?.code;
  const targetUrl = code ? `/index.html?code=${code}` : '/index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ── Instalación: precachear recursos estáticos ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── Activación: limpiar caches antiguas ──
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

// ── Fetch: network-first para Firebase/CDN, cache-first para assets locales ──
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
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});

// ── Background Sync: reintentar la limpieza de lobby cuando vuelva la red ──
const SYNC_TAG = 'mc-lobby-cleanup';
const DB_NAME = 'mc-sync-queue';
const STORE_NAME = 'requests';

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function drainQueue() {
  const db = await openQueueDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const all = await new Promise((res, rej) => {
    const r = store.getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

  for (const item of all) {
    try {
      await fetch(item.url, { method: item.method });
      store.delete(item.id);
    } catch (e) {
      // sigue sin red: se reintentará en el próximo evento 'sync'
    }
  }
}

self.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(drainQueue());
  }
});
