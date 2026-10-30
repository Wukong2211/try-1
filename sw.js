const CACHE_NAME = 'borrowed-shell-v100';
const APP_SHELL = ['./', './index.html', './styles.css?v=mobile-layout-2', './theme-worlds.css?v=worlds-14', './stark-theme.css?v=stark-interface-5', './app.js?v=hero-slide-copy-1', './theme-worlds.js?v=worlds-7', './community.js?v=campus-notifications-4', './campus-board.js?v=campus-id-cards-3', './map.js?v=real-map-10', './account-features.js', './stark-theme.js?v=stark-startup-1', './irene-easter-egg.js?v=4', './assets/irene-photo.jpg', './manifest.webmanifest', './icon.svg', './friends-wordmark.png', './assets/friends-cast-sheet.png', './supabase-config.js', './supabase-client.js'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)); }
    return response;
  }).catch(() => caches.match('./index.html'))));
});
