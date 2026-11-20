# ConvoySync PWA & Mobile Checklist (Sprint 2 – Bhavin)

## PWA configuration
- Web app manifest: `frontend/public/manifest.json` (name, short name, ID, start URL, scope, standalone display, theme/background colours and icons).
- App icons: 192×192, 512×512 and 512×512 maskable PNG assets in `frontend/public/icons/`.
- Production-only service worker registration from `frontend/src/main.jsx`.
- Versioned static app-shell cache. The production build script enumerates every emitted Vite asset under `dist/assets/` and injects the list into `dist/sw.js` before deployment.
- The install event precaches `/`, `/offline.html`, the manifest, app icons, and every hashed JS/CSS/media asset emitted by Vite. Installation does not complete if a required shell asset cannot be cached.
- Offline navigations to `/trips/...` are handled by the navigation fallback and show the standalone offline page.
- Non-navigation API/private routes (`/api/`, `/auth/`, `/trips/`, `/notifications`, `/expenses/`, `/disputes/`, `/telemetry`, `/convoy/locations`) bypass Cache Storage. Requests with an `Authorization` header and cross-origin requests also bypass the cache handler.
- No navigation HTML responses or arbitrary GET responses are dynamically stored.
- Mobile viewport uses `viewport-fit=cover`, iOS web-app metadata, safe-area CSS and minimum 48px interactive controls.

## Build and automated tests
1. From `frontend/`, run `npm ci`.
2. Run `npm run build`. This runs Vite and then `scripts/generate-sw-precache.mjs` to inject the exact generated asset list into `dist/sw.js`.
3. Run `npm test`. This runs the GIS utility tests and service-worker offline/privacy behaviour tests.
4. Run `npm run preview` and open the local preview URL. The service worker is intentionally not registered by Vite's development server.

## Manual offline regression checks (run before marking the review request complete)

- [ ] **Fresh-install first offline launch:** Clear the site's data and unregister any older worker. Open the production preview online once, wait for the new worker to show *activated and running*, and inspect Cache Storage to confirm `convoysync-static-v2` contains `/`, `/offline.html`, `/manifest.json`, icons and all `/assets/...` JS/CSS files. Install the PWA, close it, enable Chrome's Offline simulation, and launch the installed app without an intervening online reload. Confirm the landing UI renders with its JS and CSS.
- [ ] **Saved trip link offline:** With the new worker installed and its shell cache present, enable Offline simulation and open a saved `/trips/<tripId>` URL in a fresh tab/window. Confirm the standalone ConvoySync offline fallback appears rather than a browser network error.
- [ ] **Private telemetry is not cached:** Restore online mode, load a test trip and allow its convoy/telemetry requests to occur. In Application → Cache Storage, confirm no `/auth/`, `/trips/`, `/telemetry` or `/convoy/locations` API response is present. Confirm that private API requests with bearer tokens are network-only and not inserted into `convoysync-static-v2`.

Record the actual result for each manual check in the PR discussion. Do not mark these manual checks as passed until they have been run on the production preview.

## Install
- Android Chrome: open the HTTPS deployment and use Install app / Add to Home screen.
- iOS Safari: Share → Add to Home Screen. iOS behaviour differs from Chromium install prompts.

## Limitations
- Service workers require HTTPS, except on `localhost` / loopback development origins.
- Offline support is for the static application shell only. Login, trip APIs and live telemetry require a network connection.
- Background GPS tracking and push notifications are not part of this Sprint 2 PWA deliverable.
- Richer browser install UI screenshot warnings are optional enhancements and do not by themselves mean the manifest or service worker is invalid.


## Reviewer follow-up: cold-install offline regression
- The static asset Cache Storage lookup uses `ignoreVary: true` because browser script/style requests can differ in `Sec-Fetch-Dest` from install-time precache requests. The request remains constrained to same-origin, known static asset paths.
- Added a regression test that simulates a `Vary: Sec-Fetch-Dest` mismatch for a pre-cached JS asset and verifies it is returned from Cache Storage without a network request.
- Manual browser acceptance remains required on a fresh app installation: install while online, stop the preview server before first app launch, then open the installed app. Confirm the app shell loads without a blank screen. Repeat by opening a saved `/trips/<id>` link offline and confirm the offline page appears. Check Cache Storage to ensure API/telemetry URLs are absent.
