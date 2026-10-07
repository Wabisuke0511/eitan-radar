// network-first の Service Worker。
// ★ push のたびに CACHE_VERSION を必ず上げること（iOS PWA で古いキャッシュが残る問題の対策）。
const CACHE_VERSION = 'eitan-v7';
const CORE = ['./', './index.html', './manifest.json'];
// オフラインでも開けるよう、Supabase JS（CDN）だけは同じ方式で保存する。Supabase の API はキャッシュしない
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      // cache:'reload'：ブラウザの HTTP キャッシュ（GitHub Pages は10分）を通さず、必ず最新を取る
      .then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))).then(() => fetch(LIB, { mode: 'no-cors' }).then((r) => c.put(LIB, r)).catch(() => {})))
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
  // 自サイトのファイルは cache:'no-cache'（毎回サーバーに更新を確認する。変わっていなければ 304 で軽い）
  const net = url.origin === self.location.origin ? fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })) : fetch(req);
  e.respondWith(
    net
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || (req.destination === 'script' ? Response.error() : caches.match('./index.html'))))
  );
});
