// ============================================
// VELTRONIK PLATFORM - SERVICE WORKER
// Caches static assets for instant subsequent loads
// ============================================

const CACHE_NAME = 'veltronik-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/register.html',
    '/platform-lobby.html',
    '/dashboard.html',
    '/members.html',
    '/payments.html',
    '/classes.html',
    '/access.html',
    '/reports.html',
    '/settings.html',
    '/retention.html',
    '/team.html',
    // CSS
    '/css/main.css',
    '/css/components.css',
    '/css/dashboard.css',
    // JS Core
    '/js/config.js',
    '/js/utils.js',
    '/js/supabase.js',
    '/js/auth.js',
    '/js/icons.js',
    '/js/sidebar.js',
    '/js/theme.js',
    '/js/permissions.js',
    '/js/notifications.js',
    // JS Offline
    '/js/offline-storage.js',
    '/js/connection-monitor.js',
    '/js/sync-manager.js',
    '/js/offline-ui.js',
    // Assets
    '/assets/VeltronikGym.png',
    '/assets/logo-main.png',
    '/assets/logo-gym.png'
];

// Install: cache all static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch(err => {
                console.warn('[SW] Some assets failed to cache:', err);
                // Don't block install if some assets fail
                return self.skipWaiting();
            })
    );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Network-first for API calls, Cache-first for static assets
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip Supabase API requests (always go to network)
    if (url.hostname.includes('supabase')) return;

    // Skip external CDNs (fonts, ionicons, etc.)
    if (url.origin !== self.location.origin) return;

    // For our own assets: Stale-While-Revalidate strategy
    // Return cached version immediately, fetch update in background
    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return cache.match(event.request).then(cachedResponse => {
                const fetchPromise = fetch(event.request).then(networkResponse => {
                    // Update cache with fresh version
                    if (networkResponse.ok) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(() => {
                    // Network failed, cached version will be used
                    return null;
                });

                // Return cached version immediately, or wait for network
                return cachedResponse || fetchPromise;
            });
        })
    );
});

