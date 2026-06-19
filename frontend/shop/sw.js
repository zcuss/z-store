// Z Store PWA Service Worker
const VERSION = 'v5.0.0';
const CACHE_NAME = `zstore-${VERSION}`;
const CORE_ASSETS = [
  '/shop/',
  '/shop/index.html',
  '/shop/product.html',
  '/shop/payment.html',
  '/shop/order-success.html',
  '/shop/invoice.html',
  '/shop/orders.html',
  '/shop/wishlist.html',
  '/shop/settings.html',
  '/shop/notifications.html',
  '/shop/admin.html',
  '/shop/seller.html',
  '/shop/affiliate.html',
  '/shop/support.html',
  '/shop/track.html',
  '/shop/about.html',
  '/shop/faq.html',
  '/shop/404.html',
  '/shop/styles.css',
  '/shop/app.js',
  '/shop/products.js',
  '/shop/favicon.svg',
  '/shop/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css'
];

// Install: cache core assets
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CORE_ASSETS).catch(() => null)));
  self.skipWaiting();
});

// Activate: cleanup old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Fetch: network-first for HTML, cache-first for assets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Skip non-GET and cross-origin (except CDN)
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin && !url.host.includes('cdnjs.cloudflare.com')) return;

  const isHTML = e.request.headers.get('accept')?.includes('text/html');
  if (isHTML) {
    e.respondWith(
      fetch(e.request).then(r => {
        const clone = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => null);
        return r;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('/shop/404.html')))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
        const clone = resp.clone();
        if (resp.status === 200) caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => null);
        return resp;
      }))
    );
  }
});
