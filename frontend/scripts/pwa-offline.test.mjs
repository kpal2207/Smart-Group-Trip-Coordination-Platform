import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serviceWorkerSource = await readFile(path.resolve(scriptDir, '../public/sw.js'), 'utf8');
const origin = 'https://convoysync.test';

function normalizeKey(input) {
  const value = typeof input === 'string' ? input : input.url;
  return new URL(value, origin).pathname;
}

class MemoryCache {
  constructor() { this.entries = new Map(); }
  async addAll(urls) {
    for (const url of urls) {
      // Model an install-time fetch whose Sec-Fetch-Dest differs from a later
      // browser script/style request. This catches Cache.match Vary misses.
      this.entries.set(normalizeKey(url), {
        response: new Response(`cached:${url}`, { headers: { Vary: 'Sec-Fetch-Dest' } }),
        requestHeaders: new Headers(),
      });
    }
  }
  async match(request, options = {}) {
    const entry = this.entries.get(normalizeKey(request));
    if (!entry) return undefined;
    if (!options.ignoreVary) {
      const vary = entry.response.headers.get('Vary');
      if (vary && vary !== '*') {
        for (const headerName of vary.split(',').map((name) => name.trim()).filter(Boolean)) {
          if (entry.requestHeaders.get(headerName) !== request.headers?.get(headerName)) return undefined;
        }
      }
    }
    return entry.response.clone();
  }
  async put(request, response) {
    this.entries.set(normalizeKey(request), { response: response.clone(), requestHeaders: request.headers || new Headers() });
  }
  async keys() { return [...this.entries.keys()]; }
}

class MemoryCacheStorage {
  constructor() { this.entries = new Map(); }
  async open(name) {
    if (!this.entries.has(name)) this.entries.set(name, new MemoryCache());
    return this.entries.get(name);
  }
  async keys() { return [...this.entries.keys()]; }
  async delete(name) { return this.entries.delete(name); }
  async match(request, options = {}) {
    for (const cache of this.entries.values()) {
      const hit = await cache.match(request, options);
      if (hit) return hit;
    }
    return undefined;
  }
}

function createWorkerHarness(fetchImpl) {
  const listeners = new Map();
  const cacheStorage = new MemoryCacheStorage();
  const self = {
    location: new URL(origin),
    clients: { claim: async () => {} },
    addEventListener: (name, callback) => listeners.set(name, callback),
    skipWaiting: async () => {},
  };
  const context = { self, caches: cacheStorage, URL, Response, fetch: fetchImpl, Promise };
  const executable = serviceWorkerSource.replace('/*__PRECACHE_URLS__*/ []', JSON.stringify([
    '/', '/offline.html', '/manifest.json', '/icons/convoysync-192.png',
    '/assets/index-example.js', '/assets/index-example.css',
  ]));
  vm.runInNewContext(executable, context, { filename: 'sw.js' });
  return { listeners, caches: cacheStorage };
}

function makeRequest(pathname, { mode = 'cors', headers = new Headers(), method = 'GET' } = {}) {
  return { url: new URL(pathname, origin).href, method, mode, headers };
}

async function runFetchHandler(harness, request) {
  const event = {
    request,
    responsePromise: null,
    respondWith(value) { this.responsePromise = Promise.resolve(value); },
  };
  harness.listeners.get('fetch')(event);
  return event.responsePromise;
}

test('service worker install precaches offline page and the built app assets', async () => {
  const harness = createWorkerHarness(async () => new Response('network'));
  let installPromise;
  harness.listeners.get('install')({ waitUntil(value) { installPromise = value; } });
  await installPromise;
  const cache = await harness.caches.open('convoysync-static-v2');
  const keys = await cache.keys();
  assert.ok(keys.includes('/'));
  assert.ok(keys.includes('/offline.html'));
  assert.ok(keys.includes('/assets/index-example.js'));
  assert.ok(keys.includes('/assets/index-example.css'));
});

test('offline saved /trips/:id navigation returns the standalone offline page', async () => {
  const harness = createWorkerHarness(async () => { throw new TypeError('Network unavailable'); });
  const cache = await harness.caches.open('convoysync-static-v2');
  await cache.put('/offline.html', new Response('<h1>ConvoySync offline fallback</h1>'));
  const responsePromise = await runFetchHandler(harness, makeRequest('/trips/42', { mode: 'navigate' }));
  assert.ok(responsePromise, 'navigation should be handled by the service worker');
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.match(await response.text(), /ConvoySync offline fallback/);
});


test('pre-cached JS/CSS assets still match when browser fetch headers vary', async () => {
  let networkCalls = 0;
  const harness = createWorkerHarness(async () => {
    networkCalls += 1;
    throw new TypeError('Network unavailable');
  });
  let installPromise;
  harness.listeners.get('install')({ waitUntil(value) { installPromise = value; } });
  await installPromise;

  const responsePromise = await runFetchHandler(
    harness,
    makeRequest('/assets/index-example.js?v=build-hash', {
      headers: new Headers({ 'Sec-Fetch-Dest': 'script' }),
    })
  );
  const response = await responsePromise;
  assert.match(await response.text(), /cached:\/assets\/index-example.js/);
  assert.equal(networkCalls, 0, 'a pre-cached static asset must not fall through to the offline network');
});

test('private convoy telemetry GET is not intercepted or cached', async () => {
  let networkCalls = 0;
  const harness = createWorkerHarness(async () => { networkCalls += 1; return new Response('private coordinates'); });
  const responsePromise = await runFetchHandler(
    harness,
    makeRequest('/trips/42/convoy/locations', { mode: 'cors' })
  );
  assert.equal(responsePromise, null, 'private API request must bypass the service worker cache handler');
  assert.equal(networkCalls, 0, 'service worker should not issue a replacement fetch for the API request');
  const cache = await harness.caches.open('convoysync-static-v2');
  const keys = await cache.keys();
  assert.ok(!keys.some((key) => key.includes('/trips/') || key.includes('/convoy/locations')));
});

test('requests with Authorization headers are not intercepted', async () => {
  const harness = createWorkerHarness(async () => new Response('should not be fetched here'));
  const headers = new Headers({ Authorization: 'Bearer test-token' });
  const responsePromise = await runFetchHandler(
    harness,
    makeRequest('/assets/private-looking.js', { headers })
  );
  assert.equal(responsePromise, null);
});

test('offline root navigation returns the precached application shell', async () => {
  const harness = createWorkerHarness(async () => { throw new TypeError('Network unavailable'); });
  const cache = await harness.caches.open('convoysync-static-v2');
  await cache.put('/', new Response('<div id="root">cached app shell</div>'));
  const responsePromise = await runFetchHandler(harness, makeRequest('/', { mode: 'navigate' }));
  const response = await responsePromise;
  assert.match(await response.text(), /cached app shell/);
});
