/** Register the PWA service worker in production without blocking React startup. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!import.meta.env.PROD) return Promise.resolve(null);

  return navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then((registration) => registration)
    .catch((error) => {
      console.warn('ConvoySync service worker registration failed:', error);
      return null;
    });
}
