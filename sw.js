// Service worker: apka działa offline, mapy z cache
const APP = "wypad-app-v3";
const TILES = "tiles-v1";
const SHELL = ["./", "index.html", "styles.css", "app.js", "data.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png",
  "vendor/leaflet.css", "vendor/leaflet.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== APP && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // kafelki mapy: najpierw cache, potem sieć (i dopisz do cache)
  if (url.hostname === "tile.openstreetmap.org") {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(e.request.url);
      if (hit) return hit;
      try { const r = await fetch(e.request.url, { mode: "cors" }); if (r.ok) c.put(e.request.url, r.clone()); return r; }
      catch { return new Response("", { status: 504 }); }
    }));
    return;
  }
  if (url.hostname === "nominatim.openstreetmap.org") return;
  // reszta: sieć, a gdy jej brak, cache
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (url.origin === location.origin)) { const cp = r.clone(); caches.open(APP).then(c => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
});
