// 牧场肉牛进出栏管理 & TMR日粮核算工具 - Service Worker
// 用于离线缓存:首次访问后,即使无网络也能打开

const CACHE_NAME = 'beef-ranch-tool-v1';
const CACHE_URLS = [
    './',
    './index.html'
];

// 安装:预缓存核心资源
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            // 使用 non-blocking 方式逐个缓存,避免单个失败导致整体失败
            return Promise.allSettled(
                CACHE_URLS.map(function(url) {
                    return cache.add(url).catch(function(err) {
                        console.warn('[SW] 缓存失败:', url, err);
                    });
                })
            );
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

// 激活:清理旧缓存
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(key) {
                    return key !== CACHE_NAME;
                }).map(function(key) {
                    return caches.delete(key);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// fetch:策略
// - 同源 GET 请求:stale-while-revalidate (优先缓存,后台更新)
// - 其他请求:直接放行
self.addEventListener('fetch', function(event) {
    const req = event.request;

    // 只处理 GET 请求
    if (req.method !== 'GET') return;

    // 只处理同源请求
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(req).then(function(cached) {
            const fetchPromise = fetch(req).then(function(networkResp) {
                // 后台更新缓存(只缓存成功的 basic 响应)
                if (networkResp && networkResp.status === 200 && networkResp.type === 'basic') {
                    const respClone = networkResp.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(req, respClone).catch(function(){});
                    });
                }
                return networkResp;
            }).catch(function() {
                // 网络失败,如果有缓存就用缓存,否则报错
                if (cached) return cached;
                throw new Error('离线且无缓存');
            });
            // 优先返回缓存,后台同步更新
            return cached || fetchPromise;
        })
    );
});

// 允许页面立即激活新的 SW
self.addEventListener('message', function(event) {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});
