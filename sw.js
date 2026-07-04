/*  Córtex: service worker (PWA / offline)
    Estratégia: network-first pro shell (o app sempre pega a versão nova quando online)
    com fallback no cache quando offline. Só GET da MESMA ORIGEM passa por aqui:
    chamadas externas (api.github.com, provedores de IA, worker) vão direto pra rede,
    então nada de dado dinâmico fica preso em cache. O app é local-first (localStorage),
    logo offline ele funciona inteiro em cima do shell cacheado. */
const CACHE = "cortex-shell-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== location.origin) return;   // externo: rede direto
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      const c = await caches.open(CACHE);
      c.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") {
        const shell = await caches.match("./index.html");
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
