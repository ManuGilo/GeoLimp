/* ==========================================================================
   GeoCampo - Service Worker (100% Offline Mode & Cache Strategy)
   ========================================================================== */

const CACHE_NAME = 'geocampo-cache-v1';

// Static App Shell and CDN assets to pre-cache for offline capability
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/style.css',
  '/src/js/main.js',
  '/src/js/utils.js',
  '/src/js/db.js',
  '/src/js/geoUtils.js',
  '/src/js/mockData.js',
  '/src/js/map.js',
  '/src/js/dashboard.js',
  '/src/js/dailyLog.js',
  '/src/js/photos.js',
  '/src/js/timeline.js',
  '/src/js/reports.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// Service Worker Install Event - Cache all essential assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing GeoLimp Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching App Shell & CDN assets...');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[SW] Pre-cache partial warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Service Worker Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Stale-While-Revalidate Strategy for maximum offline speed
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip browser-extension or chrome-extension schemes
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached response if available
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // If valid response, update cache in background
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and request fails, return cached fallback or placeholder if applicable
          console.log('[SW] Network request failed. Serving offline cache for:', event.request.url);
        });

      return cachedResponse || fetchPromise;
    })
  );
});
