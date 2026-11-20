import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, '..');
const distDir = path.join(frontendDir, 'dist');
const assetsDir = path.join(distDir, 'assets');
const serviceWorkerPath = path.join(distDir, 'sw.js');

async function walkFiles(directory, relativeTo = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(absolutePath, relativeTo));
    } else if (entry.isFile()) {
      files.push(path.relative(relativeTo, absolutePath).split(path.sep).join('/'));
    }
  }
  return files;
}

const emittedAssets = await walkFiles(assetsDir);
if (emittedAssets.length === 0) {
  throw new Error('No Vite assets were found in dist/assets; refusing to generate an incomplete PWA precache.');
}

const requiredShellFiles = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icons/convoysync-192.png',
  '/icons/convoysync-512.png',
  '/icons/convoysync-maskable-512.png',
];
const precacheUrls = [...new Set([
  ...requiredShellFiles,
  ...emittedAssets.map((asset) => `/assets/${asset}`),
])];

let serviceWorker = await readFile(serviceWorkerPath, 'utf8');
const placeholder = '/*__PRECACHE_URLS__*/ []';
if (!serviceWorker.includes(placeholder)) {
  throw new Error('Precache placeholder not found in dist/sw.js. Check frontend/public/sw.js.');
}
serviceWorker = serviceWorker.replace(placeholder, JSON.stringify(precacheUrls, null, 2));
await writeFile(serviceWorkerPath, serviceWorker, 'utf8');

console.log(`Generated PWA precache with ${precacheUrls.length} URLs (${emittedAssets.length} Vite build assets).`);
