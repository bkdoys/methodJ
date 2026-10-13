// Service worker de l'application. Au build, le plugin `serviceWorkerManifest` de vite.config.ts remplace
// la version et la liste des fichiers ci-dessous (en développement elles restent vides).
const VERSION = '__BUILD_VERSION__';
const BUILD_ASSETS = []; /* __BUILD_ASSETS__ */

const CACHE_NAME = `medj-${VERSION}`;
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/icon.svg'];

// Installation : met en cache l'app complète (dont les vues chargées à la demande) pour l'usage hors ligne
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([...APP_SHELL, ...BUILD_ASSETS]))
  );
  self.skipWaiting();
});

// Activation : supprime les caches des versions précédentes (sinon chaque déploiement s'y ajoute)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // On ne touche pas à Firebase, Google Fonts, etc.
  if (url.origin !== self.location.origin) return;

  // Fichiers versionnés du build (nom avec empreinte, jamais modifiés) : le cache d'abord
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Le reste (page, manifeste, icônes) : le réseau d'abord, le cache hors ligne
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('/index.html');
        return Response.error();
      })
  );
});

// Rappel du matin (Cloud Function `morningReminder` via Firebase Cloud Messaging) : le message ne porte que des
// données ; c'est ici qu'on affiche la notification. Chaque message en affiche une (exigé par Safari / iPadOS).
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const data = payload.data || payload.notification || payload;
  const title = data.title || 'methodJ';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'medj-morning', // un nouveau rappel remplace le précédent
      data: { url: data.url || '/' },
    })
  );
});

// Toucher la notification : revient sur l'app si elle est ouverte, sinon l'ouvre
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) return open.focus();
      return self.clients.openWindow(url);
    })
  );
});
