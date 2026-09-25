/* Restova service worker — estrategia básica y segura.
   - Estáticos inmutables (_next/static, iconos): cache-first.
   - Navegaciones: network-first con fallback offline.
   - Datos (API, RSC, server actions): siempre red, nunca cacheados. */

const VERSION = "1";
const STATIC_CACHE = `restova-static-${VERSION}`;
const PAGE_CACHE = `restova-pages-${VERSION}`;

const PRECACHE = [
  "/manifest.webmanifest",
  "/icons/icon-96.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:png|jpe?g|svg|webp|ico|woff2?)$/.test(url.pathname)
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === "basic") {
      const cache = await caches.open(PAGE_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineResponse();
  }
}

function offlineResponse() {
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sin conexión · Restova</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: system-ui, -apple-system, Segoe UI, sans-serif;
        background: #faf9ff;
        color: #1f1b2e;
        padding: 24px;
      }
      main { text-align: center; max-width: 420px; }
      .mark {
        width: 72px; height: 72px; margin: 0 auto 20px;
        border-radius: 18px; background: #7c3aed; color: #fff;
        display: grid; place-items: center; font-size: 34px; font-weight: 800;
      }
      h1 { font-size: 22px; margin: 0 0 8px; }
      p { margin: 0 0 24px; line-height: 1.5; color: #5b5570; }
      button {
        border: 0; border-radius: 10px; padding: 12px 20px;
        background: #7c3aed; color: #fff; font-size: 15px; font-weight: 600;
        cursor: pointer;
      }
      button:active { opacity: 0.85; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">R</div>
      <h1>Sin conexión</h1>
      <p>No hay internet. Los datos de mesas, comandas y caja siempre se cargan desde el servidor, así que volvé a intentar cuando la señal vuelva.</p>
      <button onclick="location.reload()">Reintentar</button>
    </main>
  </body>
</html>`;

  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
