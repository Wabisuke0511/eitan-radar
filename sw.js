// network-first の Service Worker。
// ★ push のたびに CACHE_VERSION を必ず上げること（iOS PWA で古いキャッシュが残る問題の対策）。
const CACHE_VERSION = 'eitan-v6';
const CORE = ['./', './index.html', './manifest.json'];
// オフラインでも開けるよう、Supabase JS（CDN）だけは同じ方式で保存する。Supabase の API はキャッシュしない
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => c.addAll(CORE).then(() => fetch(LIB, { mode: 'no-cors' }).then((r) => c.put(LIB, r)).catch(() => {})))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 自サイトと LIB 以外（Supabase の API など）はキャッシュしない
  if (url.origin !== self.location.origin && req.url !== LIB) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || (req.destination === 'script' ? Response.error() : caches.match('./index.html'))))
  );
});
