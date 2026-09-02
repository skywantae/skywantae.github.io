const CACHE_NAME = 'kostat-pwa-v1.0.113'; // {AUTO_REPLACE_CACHE_VERSION}

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './updater.js',
  './manifest.json',
  './icon.png',
  './logo.png',
  './data/skyworks_data.js',
  './data/shipplan_data.js',
  './data/quotations_data.js',
  './data/knowledge_data.js'
];

// 1. Install Event: 초기 캐싱 및 즉시 skipWaiting
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Caching updated assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Activate Event: 구버전의 모든 캐시를 강제 삭제 및 즉시 제어권 획득
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Purging old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Network-First (네트워크 우선 조회 -> 실패 시 오프라인 캐시 폴백)
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  // 외부 API 호출은 캐시 제외
  if (event.request.url.includes('api.github.com') || event.request.url.includes('raw.githubusercontent.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // 오프라인(비행기 모드) 시 캐시 반환
        return caches.match(event.request).then(cachedResponse => {
          return cachedResponse || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});
