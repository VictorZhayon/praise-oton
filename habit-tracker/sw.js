// ============================================
// STRIDE — Service Worker (Offline-first PWA)
// ============================================

const CACHE_NAME = 'stride-v1';
const SHELL_FILES = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/firebase-sync.js',
    '/manifest.json',
    '/icon-512.png',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
];

// Install: cache app shell
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: cache-first for app shell, network-first for Firestore/APIs
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Network-first for Firebase / API calls
    if (url.hostname.includes('firestore') || url.hostname.includes('googleapis')) {
        e.respondWith(
            fetch(e.request).catch(() => caches.match(e.request))
        );
        return;
    }

    // Cache-first for everything else
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(response => {
                // Cache successful GET responses
                if (e.request.method === 'GET' && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return response;
            });
        })
    );
});
