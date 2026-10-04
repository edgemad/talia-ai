/* Talia AI offline shell.
 * Caches the built app assets so the UI loads with zero network.
 * API calls are never cached (they're local anyway); pulls/streaming pass through.
 *
 * Two rules make updates safe, and both matter:
 *
 *  1. The app shell (the document) is NETWORK-FIRST, never cache-first. A
 *     cache-first shell is how an update gets stuck: the cached index.html
 *     points at last release's hashed JS, which the new bundle no longer
 *     contains, so the app never mounts no matter how many times it reloads.
 *     Network-first means an update lands on the very next reload, while the
 *     cache still covers a reload when the server isn't up yet.
 *
 *  2. The cache name carries the build stamp (see scripts/patch-sw.mjs), so
 *     sw.js itself differs every build. The browser therefore reinstalls the
 *     worker on each release and the activate handler below deletes the
 *     previous cache instead of letting hashed assets pile up forever.
 */
const CACHE = "__TALIA_SHELL_CACHE__";

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

  // The app shell: network-first with a cache fallback (rule 1 above).
  // ignoreSearch keeps "/?anything" hitting the one cached copy of "/".
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/", { ignoreSearch: true })),
    );
    return;
  }

  // Everything else: cache-first, refresh in background. Safe because these
  // are content-hashed filenames — a new build brings new names.
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
