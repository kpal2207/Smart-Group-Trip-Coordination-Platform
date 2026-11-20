/* ConvoySync service worker.
 * Only the app shell and build-generated static assets are cached. API, auth,
 * trip and telemetry responses are deliberately never written to Cache Storage.
 */
const CACHE_NAME = 'convoysync-static-v2';
const OFFLINE_PAGE = '/offline.html';
// Replaced during `npm run build` with URLs for every emitted Vite asset.
const PRECACHE_URLS = /*__PRECACHE_URLS__*/ [];

const PRIVATE_API_PATHS = [
  /^\/api(?:\/|$)/i,
  /^\/auth(?:\/|$)/i,
  /^\/trips(?:\/|$)/i,
  /^\/notifications(?:\/|$)/i,
  /^\/expenses(?:\/|$)/i,
  /^\/disputes(?:\/|$)/i,
  /^\/telemetry(?:\/|$)/i,
  /^\/convoy\/locations(?:\/|$)/i,
];

function isPrivateApiPath(pathname) {
  return PRIVATE_API_PATHS.some((pattern) => pattern.test(pathname));
}

function hasAuthorizationHeader(request) {
  return Boolean(
    request.headers &&
    typeof request.headers.has === 'function' &&
    request.headers.has('Authorization')
  );
}

function offlineResponse() {
  return new Response(
    'ConvoySync is offline. Reconnect to access saved trips, login and live convoy information.',
    {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Install does not complete until the HTML, offline fallback, icons,
    // manifest, and every hashed JS/CSS/media asset from the Vite build exist.
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith('convoysync-static-') && name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Handle document navigations BEFORE API-path exclusions. A saved /trips/...
  // URL is a page navigation; if it cannot reach the server, return our offline
  // page. No navigation response is dynamically cached, so personalized HTML
  // can never be persisted accidentally.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        if (/^\/trips(?:\/|$)/i.test(url.pathname)) {
          return (await cache.match(OFFLINE_PAGE)) || offlineResponse();
        }
        // Root/app-shell navigations use the fully precached Vite index and
        // its bundled JS/CSS. Other failed navigations can show offline.html.
        return (await cache.match('/')) ||
          (await cache.match(OFFLINE_PAGE)) ||
          offlineResponse();
      }
    })());
    return;
  }

  // For non-navigation requests, reject all API/private paths and requests
  // carrying bearer authorization before considering any cache strategy.
  if (isPrivateApiPath(url.pathname) || hasAuthorizationHeader(request)) return;

  // Runtime caching is intentionally limited to known static asset locations.
  // The production build precaches these assets; this cache-first branch only
  // serves those known files and never stores arbitrary GET responses.
  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.ico';
  if (!isStaticAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Script/style requests often have different Sec-Fetch-Dest headers from
    // the install-time precache requests. Ignore Vary so the exact same
    // same-origin hashed build asset remains available offline. Ignore search
    // as well so harmless cache-busting query parameters do not cause misses.
    const cached = await cache.match(url.href, { ignoreSearch: true, ignoreVary: true });
    if (cached) return cached;
    return fetch(request);
  })());
});
