// Service worker: deixa o app instalável e abre a "casca" mesmo sem rede.
// Dados (/api) sempre vão à rede — nada de dados de negócio fica em cache.
const VERSAO = 'alicerce-v1';
const CASCA = [
  '/', '/index.html', '/css/app.css', '/manifest.webmanifest', '/icons/icone.svg',
  '/js/app.js', '/js/api.js', '/js/ui.js', '/js/grafico.js',
  '/js/views/login.js', '/js/views/painel.js', '/js/views/processos.js', '/js/views/compras.js',
  '/js/views/financeiro.js', '/js/views/fiscal.js', '/js/views/rh.js', '/js/views/cadastros.js', '/js/views/ajustes.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // rede primeiro (sempre a versão mais nova), cache como reserva offline
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(VERSAO).then((c) => c.put(e.request, copia));
        }
        return resp;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html'))),
  );
});
