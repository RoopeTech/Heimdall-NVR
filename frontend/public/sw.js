const CACHE_NAME = 'nvr-app-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install Event - cache initial UI shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - clear old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - intercept fetches, bypassing cache for media streaming and auth APIs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // CRITICAL: Always bypass service worker caching for real-time video, PTZ, and Auth
  if (
    url.pathname.includes('/live') ||
    url.pathname.includes('/recordings/play/') ||
    url.pathname.includes('/ptz') ||
    url.pathname.includes('/mock_motion') ||
    url.pathname.includes('/api/auth/')
  ) {
    return; // Let browser process request normally
  }

  // Network-First with Cache Fallback for static assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache a clone of static assets if valid
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
