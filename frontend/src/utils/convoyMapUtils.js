/**
 * ConvoySync Map Helpers (pure functions, no React / Leaflet imports)
 *
 * Turns the `members` array owned by ConvoyTracker into marker descriptors for
 * ConvoyMap. Kept separate so the tricky parts (coordinate validation, Ghost
 * Mode, freshness) can be unit-tested with `node --test`.
 *
 * Member fields actually used by the project (see ConvoyTracker.jsx,
 * convoySimulator.js, geolocation.js):
 *   user_id | id          stable vehicle id
 *   name                  display name
 *   latitude, longitude   primary coordinate fields (null when masked)
 *   lat, lng, coordinates simulator extras (Leaflet-style), also null when masked
 *   speed_kmh, heading, is_lead, distance_to_leader_km
 *   is_ghost_mode         true when the member hides their location
 *   location_status       'fresh' | 'hidden' are produced by the app; the
 *                         backend may also send 'stale' / 'unavailable'
 *   recorded_at           ISO timestamp of the last ping
 */

import { normalizeCoordinates } from './geolocation.js';

/**
 * A ping older than this is drawn as Stale. geolocation.js documents polling
 * intervals of up to 30 s for slow vehicles, so 60 s means "missed ~2 pings".
 * ConvoyMap accepts a `staleAfterMs` prop to override it.
 */
export const DEFAULT_STALE_AFTER_MS = 60_000;

export const MARKER_STATUS = Object.freeze({
  FRESH: 'fresh',
  STALE: 'stale',
  UNAVAILABLE: 'unavailable',
  GHOST: 'ghost',
});

/** Fields checked (in order) for the time of the last ping. Extend here if the backend uses another name. */
export const TIMESTAMP_FIELDS = ['recorded_at'];

const GHOST_STATUSES = new Set(['hidden', 'ghost']);

const isNil = (v) => v === null || v === undefined;

/** True for finite numbers and non-blank numeric strings. Rejects null, '', NaN, objects. */
const isUsableNumber = (v) =>
  (typeof v === 'number' && Number.isFinite(v)) ||
  (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));

/** Number(v) if usable, otherwise null. Never turns null/'' into 0. */
export function toFiniteNumber(v) {
  return isUsableNumber(v) ? Number(v) : null;
}

function pairToCoords(lat, lng) {
  // geolocation.normalizeCoordinates() would turn null into 0 (Number(null) === 0),
  // so usability is checked first.
  if (!isUsableNumber(lat) || !isUsableNumber(lng)) return null;
  const coords = normalizeCoordinates({ latitude: Number(lat), longitude: Number(lng) });
  if (!coords) return null; // NaN / out of range
  // (0, 0) is "Null Island": in practice a missing-fix default, never a real convoy position.
  if (coords.latitude === 0 && coords.longitude === 0) return null;
  return coords;
}

function arrayToCoords(arr) {
  return Array.isArray(arr) && arr.length >= 2 ? pairToCoords(arr[0], arr[1]) : null;
}

/**
 * Extracts a validated { latitude, longitude } from a member, or null.
 *
 * `latitude`/`longitude` are authoritative when present, even if null: that is
 * what the roster and lag calculation in ConvoyTracker use, and it is how the
 * simulator and the realtime handler mask Ghost Mode. Other formats are only
 * consulted when those keys are absent.
 */
export function getMemberCoordinates(member) {
  if (!member || typeof member !== 'object') return null;

  if ('latitude' in member || 'longitude' in member) {
    return pairToCoords(member.latitude, member.longitude);
  }
  if ('lat' in member) {
    return pairToCoords(member.lat, 'lng' in member ? member.lng : member.lon);
  }
  if (Array.isArray(member.coordinates)) {
    return arrayToCoords(member.coordinates);
  }
  if (member.location && typeof member.location === 'object') {
    const loc = member.location;
    if (Array.isArray(loc)) return arrayToCoords(loc);
    if ('latitude' in loc || 'longitude' in loc) return pairToCoords(loc.latitude, loc.longitude);
    if ('lat' in loc) return pairToCoords(loc.lat, 'lng' in loc ? loc.lng : loc.lon);
  }
  return null;
}

/** Stable id used for React keys and the last-known-position cache. */
export function getMemberId(member) {
  if (!member || typeof member !== 'object') return null;
  const raw = member.user_id ?? member.id;
  return isNil(raw) || raw === '' ? null : String(raw);
}

function normalizeStatus(raw) {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export function isGhostMember(member) {
  if (!member) return false;
  return (
    member.is_ghost_mode === true ||
    member.ghost_mode === true ||
    GHOST_STATUSES.has(normalizeStatus(member.location_status))
  );
}

/** Epoch ms of the member's last ping, or null if no usable timestamp exists. */
export function getRecordedAtMs(member) {
  if (!member) return null;
  for (const field of TIMESTAMP_FIELDS) {
    const raw = member[field];
    if (isNil(raw) || raw === '') continue;
    const ms = raw instanceof Date ? raw.getTime() : typeof raw === 'number' ? raw : Date.parse(raw);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/**
 * Decides the marker status for a member.
 *
 * Order: ghost -> no coordinates -> server-reported 'unavailable' / 'stale'
 * -> age of the timestamp -> server-reported 'fresh' (no timestamp) -> unavailable.
 * A member with coordinates but neither a timestamp nor a status is
 * "unavailable" because freshness cannot be established.
 */
export function classifyMember(
  member,
  { hasCoordinates, now = Date.now(), staleAfterMs = DEFAULT_STALE_AFTER_MS } = {}
) {
  const recordedAtMs = getRecordedAtMs(member);
  const reported = normalizeStatus(member?.location_status);

  if (isGhostMember(member)) return { status: MARKER_STATUS.GHOST, reason: 'ghost mode', recordedAtMs };
  if (!hasCoordinates) return { status: MARKER_STATUS.UNAVAILABLE, reason: 'no valid coordinates', recordedAtMs };
  if (reported === 'unavailable') return { status: MARKER_STATUS.UNAVAILABLE, reason: 'reported unavailable', recordedAtMs };
  if (reported === 'stale') return { status: MARKER_STATUS.STALE, reason: 'reported stale', recordedAtMs };

  if (recordedAtMs !== null) {
    const age = now - recordedAtMs; // negative (clock skew) counts as fresh
    return age > staleAfterMs
      ? { status: MARKER_STATUS.STALE, reason: 'last ping too old', recordedAtMs }
      : { status: MARKER_STATUS.FRESH, reason: 'recent ping', recordedAtMs };
  }
  if (reported === 'fresh') return { status: MARKER_STATUS.FRESH, reason: 'reported fresh', recordedAtMs };
  return { status: MARKER_STATUS.UNAVAILABLE, reason: 'no timestamp or status', recordedAtMs };
}

/**
 * Builds everything ConvoyMap needs from `members`.
 *
 * @param {Array<Object>} members            ConvoyTracker's members state
 * @param {Object} [opts]
 * @param {string|number|null} [opts.leaderId] id of the lead vehicle (falls back to member.is_lead)
 * @param {Map} [opts.lastKnown]             component-local cache id -> { latitude, longitude, at }.
 *                                           Mutated: refreshed from live fixes, pruned of departed ids.
 * @param {number} [opts.now]
 * @param {number} [opts.staleAfterMs]
 * @returns {{ markers: Array, unplotted: Array, counts: Object }}
 */
export function buildMapEntries(
  members,
  { leaderId = null, lastKnown, now = Date.now(), staleAfterMs = DEFAULT_STALE_AFTER_MS } = {}
) {
  const cache = lastKnown instanceof Map ? lastKnown : new Map();
  const list = Array.isArray(members) ? members : [];

  const markersById = new Map();
  const unplottedById = new Map();
  const statusById = new Map();
  const presentIds = new Set();

  list.forEach((member, index) => {
    if (!member || typeof member !== 'object') return;

    const stableId = getMemberId(member);
    const id = stableId ?? `index-${index}`;
    if (stableId) presentIds.add(stableId);

    // Duplicate ids: the later entry wins.
    markersById.delete(id);
    unplottedById.delete(id);

    const coords = getMemberCoordinates(member);
    const { status, reason, recordedAtMs } = classifyMember(member, {
      hasCoordinates: coords !== null,
      now,
      staleAfterMs,
    });
    statusById.set(id, status);

    const name = (typeof member.name === 'string' && member.name.trim()) || `Vehicle ${index + 1}`;

    let position = null;
    let isLastKnown = false;
    let lastKnownAtMs = null;

    if (status === MARKER_STATUS.GHOST) {
      // Never use the member's own coordinates while hidden; only a position
      // seen earlier (before Ghost Mode) may be shown, and it is flagged as such.
      const cached = stableId ? cache.get(stableId) : undefined;
      if (cached) {
        position = [cached.latitude, cached.longitude];
        isLastKnown = true;
        lastKnownAtMs = cached.at;
      }
    } else if (coords) {
      position = [coords.latitude, coords.longitude];
      if (stableId && status !== MARKER_STATUS.UNAVAILABLE) {
        cache.set(stableId, { latitude: coords.latitude, longitude: coords.longitude, at: recordedAtMs ?? now });
      }
    }

    if (position) {
      const isLead = !isNil(leaderId) ? String(leaderId) === stableId : member.is_lead === true;
      markersById.set(id, {
        id,
        name,
        position,
        status,
        reason,
        isLead,
        isLastKnown,
        lastKnownAtMs,
        recordedAtMs,
        member,
      });
    } else {
      unplottedById.set(id, { id, name, status, reason });
    }
  });

  for (const key of Array.from(cache.keys())) {
    if (!presentIds.has(key)) cache.delete(key);
  }

  const counts = { fresh: 0, stale: 0, unavailable: 0, ghost: 0 };
  statusById.forEach((status) => {
    counts[status] += 1;
  });

  return { markers: Array.from(markersById.values()), unplotted: Array.from(unplottedById.values()), counts };
}

/**
 * Earliest moment (epoch ms) at which a currently-fresh marker will turn stale,
 * or null. ConvoyMap schedules one timeout for it so a marker whose pings stop
 * still changes colour without any polling.
 */
export function getNextStaleAt(markers, staleAfterMs = DEFAULT_STALE_AFTER_MS) {
  let next = null;
  for (const m of markers) {
    if (m.status === MARKER_STATUS.FRESH && m.recordedAtMs !== null && m.recordedAtMs !== undefined) {
      const at = m.recordedAtMs + staleAfterMs;
      if (next === null || at < next) next = at;
    }
  }
  return next;
}
