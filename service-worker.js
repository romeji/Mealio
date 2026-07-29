importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAwP90Fj_snhR6udxhFIsl-M5EMic5edt0',
  authDomain: 'smartcard-4c62c.firebaseapp.com',
  projectId: 'smartcard-4c62c',
  storageBucket: 'smartcard-4c62c.firebasestorage.app',
  messagingSenderId: '126521073547',
  appId: '1:126521073547:web:bdf2c727024098527f198e'
});
firebase.messaging();

const CACHE = 'mealio-shell-v16';
const APP_SHELL = [
  './',
  './index.html',
  './mealio-quality.js',
  './recipe-store.js',
  './api-client.js',
  './daily-recipes.js',
  './liste.js',
  './scan.js',
  './notifications.js',
  './ingredients.js',
  './manifest.webmanifest',
  './mealio-logo-final.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.pathname.includes('/api/')) return;

  const isExternalData =
    url.origin !== self.location.origin &&
    /firebase|googleapis|gstatic|anthropic|jow\.fr|openfoodfacts/i.test(url.hostname);
  if (isExternalData) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
