// Offline support: precache every built file and static asset; every page is the same client-rendered shell.
import { immutable, assets } from "$app/manifest";
import { version } from "$app/env";

const CACHE = `routine-${version}`;
const SHELL = "/";
const PRECACHE = [SHELL, ...immutable.map((file) => file.path), ...assets.map((file) => file.path)].map((path) =>
  path.startsWith("/") ? path : "/" + path,
);

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // /api/ is live household data: never cache it.
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Pages: network first (fresh shell after a deploy), the cached shell when offline.
      if (event.request.mode === "navigate") return fetch(event.request).catch(() => cache.match(SHELL));
      return (await cache.match(event.request)) ?? fetch(event.request);
    })(),
  );
});
