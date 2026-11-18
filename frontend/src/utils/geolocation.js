/**
 * ConvoySync Geolocation & GIS Utilities
 * Sprint 2: Live Convoy Map, GPS Telemetry & Cloud Staging
 * 
 * Implements:
 * - Haversine great-circle distance (Earth Radius: 6,371 km)
 * - Convoy separation / lag detection (Threshold: 2.0 km)
 * - Speed-based telemetry polling intervals (>40 km/h: 5s, 10-40 km/h: 15s, <10 km/h: 30s)
 * - Convoy centroid & directional bearing calculations
 * - Multi-format coordinate normalization & Ghost Mode safety
 */

export const EARTH_RADIUS_KM = 6371;
export const DEFAULT_CONVOY_LAG_THRESHOLD_KM = 2.0;

export const POLLING_INTERVALS_MS = {
  FAST: 5000,       // > 40 km/h
  MODERATE: 15000,  // 10 - 40 km/h
  SLOW: 30000,      // < 10 km/h
  FALLBACK: 15000   // Unknown / null speed
};

export const POLLING_INTERVALS_SEC = {
  FAST: 5,
  MODERATE: 15,
  SLOW: 30,
  FALLBACK: 15
};

export const CONVOY_STATUS = {
  SAFE: 'SAFE',
  LAGGING: 'LAGGING',
  GHOST_MODE: 'GHOST_MODE',
  LOCATION_UNAVAILABLE: 'LOCATION_UNAVAILABLE',
  REFERENCE_UNAVAILABLE: 'REFERENCE_UNAVAILABLE'
};

/**
 * Normalizes coordinate input into standard { latitude, longitude } format.
 * Supports:
 * - Objects with `latitude` and `longitude`
 * - Objects with `lat` and `lng`
 * - Coordinate arrays `[latitude, longitude]`
 *
 * @param {Object|Array|null|undefined} coord
 * @returns {{ latitude: number, longitude: number } | null}
 */
export function normalizeCoordinates(coord) {
  if (!coord) return null;

  let lat = null;
  let lon = null;

  if (Array.isArray(coord) && coord.length >= 2) {
    lat = Number(coord[0]);
    lon = Number(coord[1]);
  } else if (typeof coord === 'object') {
    if ('latitude' in coord && 'longitude' in coord) {
      lat = Number(coord.latitude);
      lon = Number(coord.longitude);
    } else if ('lat' in coord && 'lng' in coord) {
      lat = Number(coord.lat);
      lon = Number(coord.lng);
    } else if ('lat' in coord && 'lon' in coord) {
      lat = Number(coord.lat);
      lon = Number(coord.lon);
    }
  }

  if (
    lat === null ||
    lon === null ||
    Number.isNaN(lat) ||
    Number.isNaN(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }

  return { latitude: lat, longitude: lon };
}

/**
 * Converts degrees to radians.
 *
 * @param {number} degrees
 * @returns {number}
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Converts radians to degrees.
 *
 * @param {number} radians
 * @returns {number}
 */
function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

/**
 * Calculates the great-circle distance between two geographic coordinates
 * using the Haversine formula and an Earth radius of 6,371 km.
 *
 * @param {Object|Array} coord1 First coordinate ({ latitude, longitude } or [lat, lng])
 * @param {Object|Array} coord2 Second coordinate ({ latitude, longitude } or [lat, lng])
 * @returns {number|null} Distance in kilometers, or null if coordinates are invalid
 */
export function calculateHaversineDistance(coord1, coord2) {
  const p1 = normalizeCoordinates(coord1);
  const p2 = normalizeCoordinates(coord2);

  if (!p1 || !p2) {
    return null;
  }

  // Exact coordinates identity check
  if (p1.latitude === p2.latitude && p1.longitude === p2.longitude) {
    return 0;
  }

  const dLat = toRadians(p2.latitude - p1.latitude);
  const dLon = toRadians(p2.longitude - p1.longitude);
  const lat1 = toRadians(p1.latitude);
  const lat2 = toRadians(p2.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  // Guard against slight floating point inaccuracies exceeding 1
  const clampedA = Math.min(Math.max(a, 0), 1);
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return EARTH_RADIUS_KM * c;
}

/**
 * Calculates the geographic centroid (mean coordinates) of active convoy members.
 * Filters out members in Ghost Mode or with unavailable/invalid locations.
 *
 * @param {Array<Object>} members List of member objects
 * @returns {{ latitude: number, longitude: number } | null} Centroid coordinate or null
 */
export function calculateConvoyCentroid(members) {
  if (!Array.isArray(members) || members.length === 0) {
    return null;
  }

  let totalLat = 0;
  let totalLon = 0;
  let validCount = 0;

  for (const member of members) {
    if (!member) continue;
    // Check Ghost Mode
    if (member.is_ghost_mode === true || member.ghost_mode === true) {
      continue;
    }

    const coords = normalizeCoordinates(
      member.location || member.coordinates || member
    );

    if (coords) {
      totalLat += coords.latitude;
      totalLon += coords.longitude;
      validCount += 1;
    }
  }

  if (validCount === 0) {
    return null;
  }

  return {
    latitude: totalLat / validCount,
    longitude: totalLon / validCount
  };
}

/**
 * Checks whether a convoy member is lagging behind the group reference.
 * 
 * Reference can be:
 * - A single coordinate object or array (e.g., trip leader position)
 * - An array of all convoy members (in which case the centroid of active members is computed)
 *
 * Handles Ghost Mode and missing coordinates safely without throwing errors.
 *
 * @param {Object} member The member object or coordinate to evaluate
 * @param {Object|Array} reference Reference coordinate, leader object, or members array
 * @param {Object} [options]
 * @param {number} [options.thresholdKm=2.0] Lag threshold in kilometers (default: 2.0 km)
 * @param {boolean} [options.excludeSelfFromCentroid=true] Whether to exclude member when calculating centroid
 * @returns {{
 *   isLagging: boolean,
 *   distanceKm: number | null,
 *   thresholdKm: number,
 *   status: string,
 *   referenceCoord: { latitude: number, longitude: number } | null
 * }}
 */
export function checkConvoyLag(member, reference, options = {}) {
  const thresholdKm =
    typeof options.thresholdKm === 'number' && options.thresholdKm >= 0
      ? options.thresholdKm
      : DEFAULT_CONVOY_LAG_THRESHOLD_KM;

  const excludeSelf = options.excludeSelfFromCentroid !== false;

  // 1. Check if member is valid and not in Ghost Mode
  if (!member) {
    return {
      isLagging: false,
      distanceKm: null,
      thresholdKm,
      status: CONVOY_STATUS.LOCATION_UNAVAILABLE,
      referenceCoord: null
    };
  }

  if (member.is_ghost_mode === true || member.ghost_mode === true) {
    return {
      isLagging: false,
      distanceKm: null,
      thresholdKm,
      status: CONVOY_STATUS.GHOST_MODE,
      referenceCoord: null
    };
  }

  const memberCoords = normalizeCoordinates(
    member.location || member.coordinates || member
  );

  if (!memberCoords) {
    return {
      isLagging: false,
      distanceKm: null,
      thresholdKm,
      status: CONVOY_STATUS.LOCATION_UNAVAILABLE,
      referenceCoord: null
    };
  }

  // 2. Resolve reference position
  let referenceCoord = null;

  if (Array.isArray(reference)) {
    // Reference is a list of members
    let candidateMembers = reference;
    if (excludeSelf && member.id != null) {
      candidateMembers = reference.filter(m => m && m.id !== member.id);
    }
    referenceCoord = calculateConvoyCentroid(candidateMembers);
  } else if (reference && typeof reference === 'object') {
    referenceCoord = normalizeCoordinates(
      reference.location || reference.coordinates || reference
    );
  }

  if (!referenceCoord) {
    return {
      isLagging: false,
      distanceKm: null,
      thresholdKm,
      status: CONVOY_STATUS.REFERENCE_UNAVAILABLE,
      referenceCoord: null
    };
  }

  // 3. Compute distance and lag flag
  const distanceKm = calculateHaversineDistance(memberCoords, referenceCoord);

  if (distanceKm === null) {
    return {
      isLagging: false,
      distanceKm: null,
      thresholdKm,
      status: CONVOY_STATUS.LOCATION_UNAVAILABLE,
      referenceCoord
    };
  }

  const isLagging = distanceKm > thresholdKm;

  return {
    isLagging,
    distanceKm: Number(distanceKm.toFixed(3)),
    thresholdKm,
    status: isLagging ? CONVOY_STATUS.LAGGING : CONVOY_STATUS.SAFE,
    referenceCoord
  };
}

/**
 * Calculates the recommended polling interval based on current vehicle speed:
 * - > 40 km/h: 5s (5000 ms)
 * - 10 - 40 km/h: 15s (15000 ms)
 * - < 10 km/h: 30s (30000 ms)
 *
 * @param {number|null|undefined} speedKmh Vehicle speed in km/h
 * @param {Object} [options]
 * @param {boolean} [options.inSeconds=false] Return interval in seconds instead of milliseconds
 * @returns {number} Polling interval (in milliseconds by default, or seconds if inSeconds=true)
 */
export function getSpeedBasedPollingInterval(speedKmh, options = {}) {
  const inSeconds = options.inSeconds === true;
  const intervals = inSeconds ? POLLING_INTERVALS_SEC : POLLING_INTERVALS_MS;

  // Handle missing or invalid speed
  if (speedKmh === null || speedKmh === undefined || Number.isNaN(Number(speedKmh))) {
    return intervals.FALLBACK;
  }

  const speed = Number(speedKmh);

  if (speed < 0) {
    return intervals.SLOW;
  }

  if (speed > 40) {
    return intervals.FAST;
  }

  if (speed >= 10 && speed <= 40) {
    return intervals.MODERATE;
  }

  // speed < 10
  return intervals.SLOW;
}

/**
 * Calculates initial compass bearing (forward azimuth) from startCoord to endCoord in degrees (0 - 360°).
 * Useful for pointing convoy member navigation toward leader or centroid.
 *
 * @param {Object|Array} startCoord Start coordinate
 * @param {Object|Array} endCoord Destination coordinate
 * @returns {number|null} Bearing in degrees from true north (0-360°), or null if coordinates invalid
 */
export function calculateBearing(startCoord, endCoord) {
  const p1 = normalizeCoordinates(startCoord);
  const p2 = normalizeCoordinates(endCoord);

  if (!p1 || !p2) {
    return null;
  }

  const lat1 = toRadians(p1.latitude);
  const lat2 = toRadians(p2.latitude);
  const dLon = toRadians(p2.longitude - p1.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const initialBearingRadians = Math.atan2(y, x);
  const initialBearingDegrees = toDegrees(initialBearingRadians);

  // Normalize to 0 - 360
  return (initialBearingDegrees + 360) % 360;
}

/**
 * Human-readable distance formatter for Map & HUD tooltips.
 * e.g., 0.45 km -> "450 m", 2.345 km -> "2.3 km"
 *
 * @param {number|null|undefined} distanceKm
 * @returns {string} Formatted distance string
 */
export function formatDistance(distanceKm) {
  if (distanceKm === null || distanceKm === undefined || Number.isNaN(Number(distanceKm))) {
    return '--';
  }

  const d = Number(distanceKm);
  if (d < 1.0) {
    return `${Math.round(d * 1000)} m`;
  }
  return `${d.toFixed(1)} km`;
}

