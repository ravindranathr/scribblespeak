/*
 * Service Worker for ScribbleSpeak PWA
 * Caches core local assets, Font Awesome styles, Google Fonts, and CDNs (Tesseract)
 * to provide a 100% seamless offline user experience.
 */

const CACHE_NAME = 'scribblespeak-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/canvas.js',
  './js/recognizer.js',
  './js/app.js',
  './js/register-sw.js',
  './manifest.json',
  
  // Font Awesome and Google Fonts
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Outfit:wght@400;500;600;700;800&display=swap',
  
  // CDN scripts cached on installation for complete offline capability
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
];

// 1. Install Hook: Open cache and write resources
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching application assets and CDN wrappers...');
        // We use addAll but wrap it in catch to prevent failure if single external resource is blocked during build
        return cache.addAll(ASSETS_TO_CACHE).catch(err => {
          console.warn('[SW] Caching warning (some assets could not be pre-cached):', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Activate Hook: Cleanup deprecated caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Clearing deprecated cache version:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Interceptions: Cache-First or Network fallback
self.addEventListener('fetch', (e) => {
  // Only intercept HTTP/HTTPS GET requests (prevent intercepting API POST calls)
  if (e.request.method !== 'GET') return;
  
  e.respondWith(
    caches.match(e.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse; // Return cache match
        }
        
        // Fetch from network and cache for next time
        return fetch(e.request).then((networkResponse) => {
          // Check for valid response status
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
            return networkResponse;
          }
          
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
          
          return networkResponse;
        }).catch(() => {
          // If network is completely down and resource not cached:
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html'); // return shell offline fallback page
          }
        });
      })
  );
});
