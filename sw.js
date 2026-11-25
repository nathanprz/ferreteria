/* Service worker: la app abre aunque no haya señal (sin datos nuevos). Los datos viven en Supabase. */
const CACHE = 'ferreteria-v2';
const SHELL = ['./','./admin/','./config.js','./assets/style.css','./assets/app.js','./assets/store.js','./assets/pdf.js',
  './assets/vendor/supabase.js','./assets/vendor/jspdf.umd.min.js','./assets/vendor/jspdf.plugin.autotable.min.js',
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(()=>{})).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return; /* Supabase y fuentes: directo a la red */
  e.respondWith(fetch(r).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); return res; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match(u.pathname.includes('/admin') ? './admin/' : './'))));
});
