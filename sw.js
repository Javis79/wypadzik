// Service worker: apka działa offline, mapy z cache
const APP = "wypad-app-v11";
const TILES = "tiles-v1";
const SHELL = ["./", "index.html", "styles.css", "app.js", "data.js", "info.js", "motion.js", "group.js", "flights.js", "sync.js", "auth.js", "trips.js", "fares.js", "wizard.js", "airports.json", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png",
  "vendor/leaflet.css", "vendor/leaflet.js",
  "fonts/archivo-latin.woff2", "fonts/archivo-latin-ext.woff2", "fonts/shantell-latin.woff2", "fonts/shantell-latin-ext.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== APP && k !== TILES && k !== "img-v2").map(k => caches.delete(k)))).then(() => self.clients.claim()));
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
  if (url.hostname === "nominatim.openstreetmap.org" || url.hostname.endsWith(".supabase.co") || url.hostname.endsWith("ryanair.com")) return;
  // zdjęcia miast (Wikipedia, Openverse, Flickr...): najpierw sieć, a bez internetu wersja z cache
  if (e.request.destination === "image" && url.origin !== location.origin) {
    e.respondWith(fetch(e.request).then(r => {
      if (r.ok || r.type === "opaque") { const cp = r.clone(); caches.open("img-v2").then(c => c.put(e.request, cp)).catch(() => {}); }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || Response.error())));
    return;
  }
  if (url.hostname.endsWith("openverse.org")) return;
  // reszta: sieć, a gdy jej brak, cache
  const same = url.origin === location.origin;
  e.respondWith(fetch(same ? new Request(e.request.url, { cache: "no-cache", credentials: "same-origin" }) : e.request).then(r => {
    if (r.ok && same) { const cp = r.clone(); caches.open(APP).then(c => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
});
