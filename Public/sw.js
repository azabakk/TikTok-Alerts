const CACHE_NAME = 'tiktok-alerts-v1';
const ASSETS = [
    './',
    './index.html',
    './manifest.json'
];

// Instalación
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activación
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Interceptación de red (Vital: IGNORAR WebSockets y Render)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Si la petición es hacia WebSockets (wss:// o ws://) o hacia el servidor externo, NO INTERCEPTAR
    if (url.protocol.includes('ws') || url.hostname.includes('onrender.com')) {
        return; // Deja que la red actúe libremente
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
