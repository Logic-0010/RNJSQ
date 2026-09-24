// 牧场肉牛进出栏管理 & TMR日粮核算工具 - Service Worker
// 用于离线缓存 + 自动更新
//
// 缓存策略:
//   - index.html / sw.js / manifest.json: network-first (优先联网, 离线回退缓存)
//   - 其他静态资源(图标等): stale-while-revalidate (缓存优先, 后台更新)
//
// 更新触发:
//   CACHE_NAME 每次发布新版本时递增(如 v1 → v2), 旧缓存自动清理
//   浏览器检测到 sw.js 内容变化 → 下载新版本 → install → activate(skipWaiting + clients.claim)

const CACHE_VERSION = 2;
const CACHE_NAME = `beef-ranch-tool-v${CACHE_VERSION}`;

// network-first 的资源(这些必须总是最新)
const NETWORK_FIRST_URLS = [
    './',
    './index.html',
    './sw.js',
    './manifest.json'
];

// stale-while-revalidate 的资源
const SWR_URLS = [
    './icon-192.png',
    './icon-512.png',
    './icon-maskable-512.png',
    './apple-touch-icon.png',
    './favicon-32.png',
    './hefeng-logo.png'
];

// 合并所有预缓存资源
const CACHE_URLS = [...NETWORK_FIRST_URLS, ...SWR_URLS];

// ============ Install: 预缓存 + 立即跳过等待 ============
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return Promise.allSettled(
                CACHE_URLS.map(function(url) {
                    return cache.add(url).catch(function(err) {
                        console.warn('[SW] 预缓存失败:', url, err);
                    });
                })
            );
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

// ============ Activate: 清理旧缓存 + 立即接管 ============
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(key) {
                    return key !== CACHE_NAME;
                }).map(function(key) {
                    console.log('[SW] 清理旧缓存:', key);
                    return caches.delete(key);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// ============ Fetch: 分策略处理 ============
self.addEventListener('fetch', function(event) {
    const req = event.request;

    // 只处理 GET 请求
    if (req.method !== 'GET') return;

    // 只处理同源请求
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    // network-first 资源: 优先联网, 失败回退缓存
    if (NETWORK_FIRST_URLS.includes(req.url.replace(url.origin + '/', './')) ||
        (req.url === url.origin + '/' && NETWORK_FIRST_URLS.includes('./')) ||
        req.url.endsWith('/index.html') ||
        req.url.endsWith('/') ||
        req.url.endsWith('/sw.js') ||
        req.url.endsWith('/manifest.json')) {
        event.respondWith(
            fetch(req).then(function(networkResp) {
                if (networkResp && networkResp.status === 200 && networkResp.type === 'basic') {
                    const respClone = networkResp.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(req, respClone).catch(function(){});
                    });
                }
                return networkResp;
            }).catch(function() {
                return caches.match(req).then(function(cached) {
                    if (cached) return cached;
                    throw new Error('离线且无缓存');
                });
            })
        );
        return;
    }

    // 其他静态资源: stale-while-revalidate
    event.respondWith(
        caches.match(req).then(function(cached) {
            const fetchPromise = fetch(req).then(function(networkResp) {
                if (networkResp && networkResp.status === 200 && networkResp.type === 'basic') {
                    const respClone = networkResp.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(req, respClone).catch(function(){});
                    });
                }
                return networkResp;
            }).catch(function() {
                if (cached) return cached;
                throw new Error('离线且无缓存');
            });
            return cached || fetchPromise;
        })
    );
});

// ============ 来自页面的消息 ============
self.addEventListener('message', function(event) {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
