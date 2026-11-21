import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatDistance } from '../utils/geolocation';
import {
  buildMapEntries,
  getNextStaleAt,
  toFiniteNumber,
  DEFAULT_STALE_AFTER_MS,
  MARKER_STATUS,
} from '../utils/convoyMapUtils';

/**
 * ConvoyMap — Leaflet + OpenStreetMap view of the convoy.
 *
 * Purely presentational: it reads the `members` array owned by ConvoyTracker
 * (simulator, device GPS and Supabase Realtime all feed that one state) and
 * keeps no location state, timers for data, or subscriptions of its own.
 *
 * Props
 *  - members      ConvoyTracker's members array (required)
 *  - leaderId     id of the lead vehicle as computed by ConvoyTracker (optional, falls back to member.is_lead)
 *  - staleAfterMs a ping older than this is shown as Stale (default 60 s)
 */

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Shown only when there is nothing to plot (no marker is ever placed here): India overview.
const EMPTY_VIEW = { center: [20.5937, 78.9629], zoom: 5 };
const SINGLE_VEHICLE_ZOOM = 15;
const MAX_FIT_ZOOM = 16;
const FIT_PADDING = [48, 48];

const STATUS_LABEL = {
  [MARKER_STATUS.FRESH]: 'Fresh',
  [MARKER_STATUS.STALE]: 'Stale',
  [MARKER_STATUS.UNAVAILABLE]: 'Unavailable',
  [MARKER_STATUS.GHOST]: 'Ghost',
};

const PIN_COLORS = {
  [MARKER_STATUS.FRESH]: { fill: '#22c55e', stroke: '#14532d' },
  [MARKER_STATUS.STALE]: { fill: '#facc15', stroke: '#854d0e' },
  [MARKER_STATUS.UNAVAILABLE]: { fill: '#e2e8f0', stroke: '#64748b' },
};

/* ---------------------------------------------------------------- icons */

const GHOST_PATH =
  'M14 2C8 2 4 6.5 4 12.5V29l3.5-3 3.5 3 3-3 3 3 3.5-3 3.5 3V12.5C24 6.5 20 2 14 2z';

// Static strings only (no member data), so injecting them as HTML is safe.
const GHOST_SVG =
  `<svg width="28" height="32" viewBox="0 0 28 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
  `<path d="${GHOST_PATH}" fill="#c4b5fd" stroke="#5b21b6" stroke-width="1.6" stroke-dasharray="3 2"/>` +
  `<circle cx="10.5" cy="13" r="2.2" fill="#2e1065"/><circle cx="17.5" cy="13" r="2.2" fill="#2e1065"/>` +
  `<ellipse cx="14" cy="19" rx="2" ry="2.6" fill="#2e1065"/></svg>`;

function pinSvg(status, isLead) {
  const { fill, stroke } = PIN_COLORS[status] || PIN_COLORS[MARKER_STATUS.UNAVAILABLE];
  const star =
    '<polygon points="13,8 14.6,11.4 18.3,11.8 15.5,14.3 16.3,18 13,16.1 9.7,18 10.5,14.3 7.7,11.8 11.4,11.4" ' +
    `fill="${stroke}"/>`;
  return (
    `<svg width="26" height="38" viewBox="0 0 26 38" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<path d="M13 1C6.4 1 1 6.3 1 12.8c0 9.2 12 24.2 12 24.2s12-15 12-24.2C25 6.3 19.6 1 13 1z" ` +
    `fill="${fill}" stroke="${stroke}" stroke-width="2"/>` +
    `<circle cx="13" cy="13" r="${isLead ? 7 : 5}" fill="#ffffff"/>${isLead ? star : ''}</svg>`
  );
}

// Icons are cached so a marker keeps the same icon object between renders
// (react-leaflet only calls setIcon when the prop identity changes).
const iconCache = new Map();

function getMarkerIcon(status, isLead) {
  const key = `${status}:${isLead && status !== MARKER_STATUS.GHOST ? 'lead' : 'member'}`;
  if (!iconCache.has(key)) {
    const icon =
      status === MARKER_STATUS.GHOST
        ? L.divIcon({
            html: GHOST_SVG,
            className: 'convoy-pin-icon convoy-pin-icon--ghost',
            iconSize: [28, 32],
            iconAnchor: [14, 16],
            popupAnchor: [0, -16],
            tooltipAnchor: [0, -16],
          })
        : L.divIcon({
            html: pinSvg(status, isLead),
            className: `convoy-pin-icon convoy-pin-icon--${status}${isLead ? ' convoy-pin-icon--lead' : ''}`,
            iconSize: [26, 38],
            iconAnchor: [13, 38],
            popupAnchor: [0, -34],
            tooltipAnchor: [0, -34],
          });
    iconCache.set(key, icon);
  }
  return iconCache.get(key);
}

function GhostGlyph() {
  return (
    <svg width="14" height="16" viewBox="0 0 28 32" aria-hidden="true">
      <path d={GHOST_PATH} fill="#c4b5fd" stroke="#5b21b6" strokeWidth="2" />
      <circle cx="10.5" cy="13" r="2.4" fill="#2e1065" />
      <circle cx="17.5" cy="13" r="2.4" fill="#2e1065" />
    </svg>
  );
}

/* ---------------------------------------------------------------- popup */

const formatTime = (ms) => (ms == null ? '—' : new Date(ms).toLocaleTimeString());
const formatCoord = (n) => n.toFixed(5);

function VehiclePopup({ marker }) {
  const { member, status, isLead, isLastKnown, position, recordedAtMs, lastKnownAtMs, name } = marker;
  const speed = toFiniteNumber(member.speed_kmh);
  const heading = toFiniteNumber(member.heading);
  const distance = toFiniteNumber(member.distance_to_leader_km);

  return (
    <div className="cm-popup">
      <div className="cm-popup-title">
        {name}
        {isLead && <span className="cm-lead-tag">LEAD</span>}
      </div>
      <span className={`cm-badge cm-badge--${status}`}>
        {STATUS_LABEL[status]}
        {isLastKnown ? ' · last known' : ''}
      </span>

      {isLastKnown && (
        <p className="cm-popup-note">
          Ghost Mode is on. This is the last position seen before the vehicle went hidden, not its live location.
        </p>
      )}

      <dl className="cm-rows">
        <dt>Speed</dt>
        <dd>{speed !== null ? `${speed} km/h` : '—'}</dd>

        {heading !== null && (
          <>
            <dt>Heading</dt>
            <dd>{Math.round(heading)}°</dd>
          </>
        )}

        <dt>Lead vehicle</dt>
        <dd>{isLead ? 'Yes' : 'No'}</dd>

        {/* Distance is withheld for Ghost vehicles: it would leak the location they chose to hide. */}
        {!isLead && !isLastKnown && (
          <>
            <dt>From leader</dt>
            <dd>{distance !== null ? formatDistance(distance) : '—'}</dd>
          </>
        )}

        <dt>Status field</dt>
        <dd>{member.location_status || '—'}</dd>

        <dt>{isLastKnown ? 'Last seen' : 'Last ping'}</dt>
        <dd>{formatTime(isLastKnown ? lastKnownAtMs : recordedAtMs)}</dd>

        <dt>{isLastKnown ? 'Last position' : 'Position'}</dt>
        <dd>
          {formatCoord(position[0])}, {formatCoord(position[1])}
        </dd>
      </dl>
    </div>
  );
}

/* ------------------------------------------------------- view controller */

/**
 * Fits the map to the vehicles without fighting the user:
 *  - fits once when the first vehicle appears (and again when the container gets a real size);
 *  - afterwards only re-fits if a vehicle drifts out of view AND the user has not
 *    panned, zoomed or opened a popup since the last fit;
 *  - `fitRef.current()` (the "Fit convoy" button) re-fits and turns following back on.
 * Programmatic moves use animate:false so they finish synchronously and can be told
 * apart from user gestures (zoomstart / dragstart).
 */
function ViewController({ points, fitRef }) {
  const map = useMap();
  const pointsRef = useRef(points);
  const fittedRef = useRef(false);
  const followRef = useRef(true);
  const programmaticRef = useRef(false);
  pointsRef.current = points;

  const fitToPoints = useCallback(() => {
    const pts = pointsRef.current;
    if (!pts.length) return false;
    const size = map.getSize();
    const hasSize = size.x > 0 && size.y > 0;
    programmaticRef.current = true;
    try {
      if (pts.length === 1) {
        map.setView(pts[0], SINGLE_VEHICLE_ZOOM, { animate: false });
      } else {
        const bounds = L.latLngBounds(pts);
        if (hasSize) {
          map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM, animate: false });
        } else {
          // Hidden / zero-size container (e.g. inactive tab): fitBounds would compute NaN. Centre now, fit later.
          map.setView(bounds.getCenter(), 13, { animate: false });
        }
      }
    } finally {
      programmaticRef.current = false;
    }
    return hasSize;
  }, [map]);

  useEffect(() => {
    fitRef.current = () => {
      followRef.current = true;
      fittedRef.current = fitToPoints();
    };
    return () => {
      fitRef.current = null;
    };
  }, [fitRef, fitToPoints]);

  useEffect(() => {
    const onUserInteraction = () => {
      if (!programmaticRef.current) followRef.current = false;
    };
    map.on('dragstart zoomstart popupopen', onUserInteraction);
    return () => {
      map.off('dragstart zoomstart popupopen', onUserInteraction);
    };
  }, [map]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      if (!fittedRef.current) fittedRef.current = fitToPoints();
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map, fitToPoints]);

  useEffect(() => {
    if (!points.length) return;
    if (!fittedRef.current) {
      fittedRef.current = fitToPoints();
      return;
    }
    if (!followRef.current) return;
    const size = map.getSize();
    if (size.x <= 0 || size.y <= 0) return;
    const comfortZone = map.getBounds().pad(-0.1);
    if (points.some((p) => !comfortZone.contains(p))) fitToPoints();
  }, [points, map, fitToPoints]);

  return null;
}

/* ------------------------------------------------------------ component */

export default function ConvoyMap({ members, leaderId = null, staleAfterMs = DEFAULT_STALE_AFTER_MS }) {
  // Last valid position per stable vehicle id; used only to show a Ghost vehicle at a flagged "last known" spot.
  const lastKnownRef = useRef(new Map());
  const fitRef = useRef(null);
  // Bumped by a single timeout when a fresh marker is due to turn stale (see effect below).
  const [staleTick, setStaleTick] = useState(0);

  const { markers, unplotted, counts } = useMemo(
    () =>
      buildMapEntries(members, {
        leaderId,
        lastKnown: lastKnownRef.current,
        now: Date.now(),
        staleAfterMs,
      }),
    // staleTick is not read inside, it only forces a recompute so freshness is re-evaluated.
    [members, leaderId, staleAfterMs, staleTick]
  );

  const points = useMemo(() => markers.map((m) => m.position), [markers]);

  // Not a polling loop: one timeout aimed at the next moment a marker becomes stale.
  useEffect(() => {
    const nextStaleAt = getNextStaleAt(markers, staleAfterMs);
    if (nextStaleAt === null) return undefined;
    const delay = Math.min(Math.max(nextStaleAt - Date.now() + 50, 250), 2_000_000_000);
    const timer = setTimeout(() => setStaleTick((t) => t + 1), delay);
    return () => clearTimeout(timer);
  }, [markers, staleAfterMs]);

  // MapContainer only reads center/zoom on mount; ViewController handles everything after.
  const [initialView] = useState(() =>
    markers.length ? { center: markers[0].position, zoom: 13 } : EMPTY_VIEW
  );

  return (
    <div className="convoy-map-wrap" data-testid="convoy-map">
      <div className="convoy-map-frame">
        <MapContainer
          className="convoy-map"
          style={{ height: '100%', width: '100%' }}
          center={initialView.center}
          zoom={initialView.zoom}
          maxZoom={19}
          minZoom={3}
        >
          <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} maxZoom={19} />
          <ViewController points={points} fitRef={fitRef} />

          {markers.map((m) => (
            <Marker
              key={m.id}
              position={m.position}
              icon={getMarkerIcon(m.status, m.isLead)}
              zIndexOffset={m.isLead ? 1000 : m.status === MARKER_STATUS.GHOST ? -500 : 0}
              title={m.isLastKnown ? `${m.name} (ghost, last known position)` : m.name}
            >
              <Tooltip permanent direction="top" className="convoy-map-label">
                {m.isLead ? `${m.name} ★` : m.name}
                {m.isLastKnown ? ' (last known)' : ''}
              </Tooltip>
              <Popup className="convoy-map-popup" minWidth={210}>
                <VehiclePopup marker={m} />
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        <button
          type="button"
          className="convoy-map-fit"
          onClick={() => fitRef.current && fitRef.current()}
          disabled={markers.length === 0}
          title="Fit all vehicles in view"
          aria-label="Fit all vehicles in view"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
          Fit convoy
        </button>

        {markers.length === 0 && (
          <div className="convoy-map-empty" role="status">
            <strong>No vehicle locations yet</strong>
            <span>Start “Simulate Drive” or “Share GPS” to see vehicles on the map.</span>
          </div>
        )}
      </div>

      <div className="radar-legend convoy-map-legend">
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#22c55e' }} />
          <span>Fresh ({counts.fresh})</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#facc15' }} />
          <span>Stale ({counts.stale})</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#e2e8f0', border: '1px solid #64748b' }} />
          <span>Unavailable ({counts.unavailable})</span>
        </div>
        <div className="legend-item">
          <GhostGlyph />
          <span>Ghost ({counts.ghost})</span>
        </div>
      </div>

      {unplotted.length > 0 && (
        <div className="convoy-map-note">
          Not on map:{' '}
          {unplotted
            .map((u) => `${u.name} (${u.status === MARKER_STATUS.GHOST ? 'ghost, no last known position' : 'no valid location'})`)
            .join(', ')}
        </div>
      )}
    </div>
  );
}
