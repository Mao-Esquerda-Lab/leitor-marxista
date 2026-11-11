/* Service worker: deixa o "casco" do app (os catálogos entram no cache ao serem abertos) disponíveis offline. */
const VERSAO = 'lm-v3';
const CASCO = ['./', 'index.html', 'css/app.css', 'js/config.js', 'js/i18n.js', 'js/app.js', 'js/instalar.js',
  'img/emblema.svg', 'img/icone.svg', 'img/icone-192.png', 'img/icone-512.png', 'img/pix.png', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(CASCO)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // textos externos: cache fica no IndexedDB do app
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(VERSAO).then(x => x.put(e.request, c)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
