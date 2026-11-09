/* Cálculo de Apoyos BT · trabajo sin conexión: primero la red, si falla la copia guardada */
const CACHE = 'apoyos-bt-1.34.0';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'index.html', 'manifest.webmanifest', 'icon-192.png']).catch(() => { }))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const propio = u.origin === location.origin && !u.pathname.startsWith('/__/auth');
  const sdk = u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/');
  const fuentes = /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if (!propio && !sdk && !fuentes) return;            // Firestore, autenticación, mapas y cotas: siempre a la red
  e.respondWith(fetch(r).then(resp => { if (resp.ok || resp.type === 'opaque') { const cp = resp.clone(); caches.open(CACHE).then(c => c.put(r, cp)); } return resp; })
    .catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
