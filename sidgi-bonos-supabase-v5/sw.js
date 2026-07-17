const CACHE = 'sidgibonos-v5';
const FILES = ['/', '/index.html', '/app.html', '/style.css', '/env.js', '/helpers.js', '/config.js', '/public-client.js', '/reservar.html', '/reserva.html', '/manifest.json', '/icon512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// La app ahora depende de un backend real (Supabase): siempre se intenta
// la red primero; el caché solo es una salvaguarda si la red falla.
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
