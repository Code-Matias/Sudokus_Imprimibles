/* service-worker.js — PWA offline cache */
const CACHE_VER = 'v1.0.0';
const CACHE_NAME = `sudoku-cache-${CACHE_VER}`;

/* Archivos estáticos a precachear (ajusta si cambias nombres) */
const ASSETS = [
  './',
  'index.html',
  'css/bootswatch-flatly.min.css',
  'css/bootswatch-darkly.min.css',
  'css/styles.css',
  'css/print.css',
  'js/rng.js',
  'js/sudoku-core.js',
  'js/generator-worker.js',
  'js/sudoku-ui.js',
  'js/theme.js',
  'js/sw-register.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png'
];

/* Instalar: precache */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* Activar: limpiar cachés viejos */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k.startsWith('sudoku-cache-') && k !== CACHE_NAME) ? caches.delete(k) : undefined))
    ).then(() => self.clients.claim())
  );
});

/* Fetch: cache-first para assets estáticos; network fallback */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Sólo GET
  if (req.method !== 'GET') return;

  // Estrategia: cache-first para todo lo del scope
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // Cachear de pasada respuestas OK del mismo origen
        try {
          const url = new URL(req.url);
          if (url.origin === self.location.origin && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
        } catch (_) {}
        return res;
      }).catch(() => {
        // Fallback simple: si pide página y falla red, serví index.html
        if (req.headers.get('Accept')?.includes('text/html')) {
          return caches.match('index.html');
        }
      });
    })
  );
});
