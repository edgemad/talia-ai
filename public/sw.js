/* Talia AI offline shell.
 * Caches the built app assets so the UI loads with zero network.
 * API calls are never cached (they're local anyway); pulls/streaming pass through.
 */
const CACHE = "talia-shell-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(["/", "/mascot.svg", "/dragon.svg", "/dino.svg"]),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never touch API traffic (local server, streams, posts)
  if (url.pathname.startsWith("/api/") || req.method !== "GET") return;
  // Never cache cross-origin (research, CDNs) — pass straight through
  if (url.origin !== self.location.origin) return;

  // App shell & assets: cache-first, refresh in background
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const fetching = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fetching;
    }),
  );
});
