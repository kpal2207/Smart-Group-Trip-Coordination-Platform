# ConvoySync PWA & Mobile Checklist (Sprint 2 – Bhavin)

## PWA configuration
- Web app manifest: `frontend/public/manifest.json` (name, short name, ID, start URL, scope, standalone display, theme/background colours and icons).
- App icons: 192×192, 512×512 and 512×512 maskable PNG assets in `frontend/public/icons/`.
- Production-only service worker registration from `frontend/src/main.jsx`.
- Versioned static app-shell cache with obsolete-cache cleanup.
- Offline navigation fallback explains that live trip information is unavailable offline.
- The worker bypasses API/private routes (`/api/`, `/auth/`, `/trips/`, `/notifications`, `/expenses/`, `/disputes/`), non-GET requests, authenticated requests and third-party origins.
- Mobile viewport uses `viewport-fit=cover`, iOS web-app metadata, safe-area CSS and minimum 48px interactive controls.

## Local verification
1. From `frontend/`, run `npm install` if dependencies are not present.
2. Run `npm run build`.
3. Run `npm run preview` and open the local preview URL. The service worker is intentionally not registered by Vite's development server.
4. In Chrome DevTools → Application → Manifest, confirm app name, short name, start URL, display mode and all three icons.
5. In Application → Service Workers, confirm `/sw.js` is activated and running.
6. In Application → Cache Storage, confirm `convoysync-static-v1` contains the app shell/static assets.
7. In Network, verify authenticated/API requests are not served from the service worker cache.
8. Test responsive widths 320px, 360px, 390px and 400px; check the landing navigation, hero actions and scroll behaviour.

## Install
- Android Chrome: open the HTTPS deployment and use Install app / Add to Home screen.
- iOS Safari: Share → Add to Home Screen. iOS behaviour differs from Chromium install prompts.

## Limitations
- Service workers require HTTPS, except on `localhost`.
- Offline support is for the static application shell only. Login, trip APIs and live telemetry require a network connection.
- Background GPS tracking and push notifications are not part of this Sprint 2 PWA deliverable.
- The richer browser install dialog may show optional screenshot warnings; those warnings do not by themselves mean the manifest or service worker is invalid.
