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
  './data/knowledge_data.js',
  './data/trello_data.js'
];

// 1. Install Event: 초기 에셋 캐싱
self.addEventListener('install', event => {
  self.skipWaiting(); // 즉시 활성화
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching all assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// 2. Activate Event: 구버전 캐시 삭제
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch Event: 네트워크 우선, 실패 시 캐시 폴백 (Stale-While-Revalidate 변형)
self.addEventListener('fetch', event => {
  // GET 요청만 캐시 처리
  if (event.request.method !== 'GET') return;
  
  // 외부 도메인 API 호출(GitHub Raw 등)은 캐싱에서 제외하고 네트워크만 사용
  if (event.request.url.includes('api.github.com') || event.request.url.includes('raw.githubusercontent.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // 응답이 유효한 경우 캐시 갱신
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(err => {
        // 네트워크 오프라인 시 무조건 캐시 반환
        return cachedResponse;
      });

      // 캐시가 있으면 즉시 반환(제로 지연), 없으면 네트워크 응답 대기
      return cachedResponse || fetchPromise;
    })
  );
});
