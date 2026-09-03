self.addEventListener('install', (e) => {
    console.log('[Service Worker] Instalado');
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    console.log('[Service Worker] Activado');
});

// Chrome exige que este evento exista para permitir la instalación de la app.
self.addEventListener('fetch', (e) => {
    // Por ahora simplemente dejamos que la conexión fluya normal al servidor
});
