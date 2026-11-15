// Offline support: precache every built file and static asset; every page is the same client-rendered shell.
import { immutable, assets } from "$app/manifest";
import { version } from "$app/env";

const C = `routine-${version}`;
const SHELL = "/";
const PRECACHE = [SHELL, ...immutable.map((f) => f.path), ...assets.map((f) => f.path)].map((p) => (p.startsWith("/") ? p : "/" + p));

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== C).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // /api/ is live household data: never cache it.
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    (async () => {
      const c = await caches.open(C);
      // Pages: network first (fresh shell after a deploy), the cached shell when offline.
      if (e.request.mode === "navigate") return fetch(e.request).catch(() => c.match(SHELL));
      return (await c.match(e.request)) ?? fetch(e.request);
    })(),
  );
});
