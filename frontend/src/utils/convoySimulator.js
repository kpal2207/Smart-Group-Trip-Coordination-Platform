/**
 * ConvoySync 4-Car Highway Simulator Module
 * Sprint 2, Issue #3
 * 
 * Simulates a 4-vehicle convoy travelling together along a highway route:
 * - Car 1: Lead Car (sets pace, heading ~32° NE along NH66 highway)
 * - Car 2: Follower 1 (stays close behind, ~0.35 km lag)
 * - Car 3: Follower 2 (stays close behind, ~0.70 km lag)
 * - Car 4: Follower 3 (gradually lags behind, crosses 2.0 km threshold, then regroups)
 * 
 * Designed to test the Convoy Separation Warning Banner (2.0 km threshold)
 * using real geographical coordinates and the Haversine distance formula.
 */

import {
  calculateHaversineDistance,
  DEFAULT_CONVOY_LAG_THRESHOLD_KM,
} from './geolocation.js';

// Base coordinates near Goa highway (NH66)
export const HIGHWAY_ORIGIN = {
  latitude: 15.2993,
  longitude: 74.1240,
  heading: 32, // Compass heading in degrees
};

// Synthetic vehicle metadata (no real personal names, clear synthetic IDs)
export const SIMULATED_FLEET_CONFIG = [
  { id: 'sim-car-1', name: 'Lead Car', is_lead: true, baseSpeed: 75.0, distanceOffsetKm: 0.0 },
  { id: 'sim-car-2', name: 'Car 2', is_lead: false, baseSpeed: 74.0, distanceOffsetKm: 0.35 },
  { id: 'sim-car-3', name: 'Car 3', is_lead: false, baseSpeed: 72.0, distanceOffsetKm: 0.70 },
  { id: 'sim-car-4', name: 'Car 4', is_lead: false, baseSpeed: 65.0, distanceOffsetKm: 0.55 },
];

// Vector components for 32° heading: cos(32°) ≈ 0.8480, sin(32°) ≈ 0.5299
const HEADING_COS = 0.8480;
const HEADING_SIN = 0.5299;

// Degrees latitude/longitude per step at ~75 km/h with 3-second ticks
const STEP_LAT_DELTA = 0.0008;
const STEP_LNG_DELTA = 0.0005;

/**
 * Calculates deterministic trailing lag factor for Car 4 based on step or forced phase.
 * 
 * Progression across a 30-step loop:
 * - Steps 0–8: Safe phase (~0.55 km lag, warning OFF)
 * - Steps 9–13: Car 4 slows down, lag grows from ~0.75 km to ~1.54 km (warning OFF)
 * - Steps 14–15: Lag grows to ~1.78 - 1.92 km, approaching threshold (warning OFF)
 * - Steps 16–21: Lag exceeds 2.0 km (peaks at ~2.71 km) (warning ON)
 * - Steps 22–23: Car 4 accelerates, lag drops from ~2.44 km to ~2.18 km (warning ON)
 * - Steps 24–29: Lag drops below 2.0 km (from ~1.92 km to ~0.59 km) (warning OFF, regrouped)
 *
 * @param {number} step - Current tick index (0-based)
 * @param {string|null} forcedPhase - Optional manual phase override ('safe' | 'warning' | 'regroup')
 * @returns {{ lagFactor: number, phaseName: string, car4Speed: number }}
 */
export function getCar4LagConfig(step = 0, forcedPhase = null) {
  if (forcedPhase === 'warning') {
    // Distance ~2.35 km (> 2.0 km threshold)
    return { lagFactor: 0.0215, phaseName: 'WARNING_TRIGGERED', car4Speed: 38.0 };
  }
  if (forcedPhase === 'safe') {
    // Distance ~0.55 km (< 2.0 km threshold)
    return { lagFactor: 0.0050, phaseName: 'SAFE_PACK', car4Speed: 72.0 };
  }
  if (forcedPhase === 'regroup') {
    // Distance ~0.85 km (< 2.0 km threshold)
    return { lagFactor: 0.0076, phaseName: 'REGROUPED', car4Speed: 88.0 };
  }

  // Automatic cyclical progression (30-step cycle)
  const cycleIndex = step % 30;

  if (cycleIndex <= 8) {
    // Safe pack
    return { lagFactor: 0.0050, phaseName: 'SAFE_PACK', car4Speed: 70.0 };
  }
  if (cycleIndex <= 13) {
    // Gradually trailing behind (up to ~1.54 km)
    const factor = 0.0050 + (cycleIndex - 8) * 0.0018;
    return { lagFactor: factor, phaseName: 'FALLING_BEHIND', car4Speed: 48.0 };
  }
  if (cycleIndex <= 15) {
    // Approaching 2 km threshold (~1.78 km to 1.92 km, still safe)
    const factor = 0.0140 + (cycleIndex - 13) * 0.0011;
    return { lagFactor: factor, phaseName: 'APPROACHING_THRESHOLD', car4Speed: 40.0 };
  }
  if (cycleIndex <= 21) {
    // Exceeded 2.0 km threshold (~2.05 km to ~2.71 km)
    const factor = 0.0185 + (cycleIndex - 15) * 0.0011;
    return { lagFactor: factor, phaseName: 'SEPARATION_WARNING', car4Speed: 32.0 };
  }
  // Steps 22 to 29: Regrouping back to pack
  const factor = 0.0246 - (cycleIndex - 21) * 0.0024;
  const isStillLagging = factor > 0.0180;
  return {
    lagFactor: Math.max(factor, 0.0050),
    phaseName: isStillLagging ? 'SEPARATION_WARNING' : 'REGROUPING',
    car4Speed: 92.0,
  };
}

/**
 * Generates the full 4-car convoy state for a given simulation step.
 * 
 * Coordinates are formatted for full compatibility with:
 * - Internal ConvoyTracker Radar HUD
 * - Jay's Leaflet Map (provides latitude, longitude, lat, lng, and coordinates array)
 * - Supabase Realtime telemetry_ping contract
 * 
 * @param {number} step - Current simulation tick (e.g. 0, 1, 2...)
 * @param {Object} [options]
 * @param {string|null} [options.forcedPhase=null] - Optional phase override
 * @param {boolean} [options.ghostMode=false] - If true, masks coordinates for user/car
 * @param {string|null} [options.ghostCarId=null] - Optional specific car to put in Ghost Mode
 * @returns {{
 *   vehicles: Array<Object>,
 *   leadVehicle: Object,
 *   car4LagKm: number,
 *   isWarningActive: boolean,
 *   phaseName: string,
 *   step: number
 * }}
 */
export function generateConvoySimulationStep(step = 0, options = {}) {
  const { forcedPhase = null, ghostMode = false, ghostCarId = null } = options;

  // 1. Compute Lead Car position along the highway
  const leadLat = HIGHWAY_ORIGIN.latitude + step * STEP_LAT_DELTA;
  const leadLng = HIGHWAY_ORIGIN.longitude + step * STEP_LNG_DELTA;
  const nowIso = new Date().toISOString();

  const leadVehicle = {
    user_id: SIMULATED_FLEET_CONFIG[0].id,
    id: SIMULATED_FLEET_CONFIG[0].id,
    name: SIMULATED_FLEET_CONFIG[0].name,
    is_lead: true,
    latitude: Number(leadLat.toFixed(6)),
    longitude: Number(leadLng.toFixed(6)),
    lat: Number(leadLat.toFixed(6)),
    lng: Number(leadLng.toFixed(6)),
    coordinates: [Number(leadLat.toFixed(6)), Number(leadLng.toFixed(6))],
    speed_kmh: SIMULATED_FLEET_CONFIG[0].baseSpeed,
    heading: HIGHWAY_ORIGIN.heading,
    is_ghost_mode: ghostCarId === SIMULATED_FLEET_CONFIG[0].id,
    location_status: ghostCarId === SIMULATED_FLEET_CONFIG[0].id ? 'hidden' : 'fresh',
    distance_to_leader_km: 0.0,
    recorded_at: nowIso,
  };

  // 2. Compute Car 2 position (~0.35 km behind leader along heading vector)
  const car2Lat = leadLat - 0.0031 * HEADING_COS;
  const car2Lng = leadLng - 0.0031 * HEADING_SIN;
  const car2Dist = calculateHaversineDistance(
    { latitude: leadLat, longitude: leadLng },
    { latitude: car2Lat, longitude: car2Lng }
  );

  const car2Vehicle = {
    user_id: SIMULATED_FLEET_CONFIG[1].id,
    id: SIMULATED_FLEET_CONFIG[1].id,
    name: SIMULATED_FLEET_CONFIG[1].name,
    is_lead: false,
    latitude: Number(car2Lat.toFixed(6)),
    longitude: Number(car2Lng.toFixed(6)),
    lat: Number(car2Lat.toFixed(6)),
    lng: Number(car2Lng.toFixed(6)),
    coordinates: [Number(car2Lat.toFixed(6)), Number(car2Lng.toFixed(6))],
    speed_kmh: SIMULATED_FLEET_CONFIG[1].baseSpeed,
    heading: HIGHWAY_ORIGIN.heading,
    is_ghost_mode: ghostCarId === SIMULATED_FLEET_CONFIG[1].id,
    location_status: ghostCarId === SIMULATED_FLEET_CONFIG[1].id ? 'hidden' : 'fresh',
    distance_to_leader_km: Number((car2Dist || 0.35).toFixed(2)),
    recorded_at: nowIso,
  };

  // 3. Compute Car 3 position (~0.70 km behind leader)
  const car3Lat = leadLat - 0.0063 * HEADING_COS;
  const car3Lng = leadLng - 0.0063 * HEADING_SIN;
  const car3Dist = calculateHaversineDistance(
    { latitude: leadLat, longitude: leadLng },
    { latitude: car3Lat, longitude: car3Lng }
  );

  const car3Vehicle = {
    user_id: SIMULATED_FLEET_CONFIG[2].id,
    id: SIMULATED_FLEET_CONFIG[2].id,
    name: SIMULATED_FLEET_CONFIG[2].name,
    is_lead: false,
    latitude: Number(car3Lat.toFixed(6)),
    longitude: Number(car3Lng.toFixed(6)),
    lat: Number(car3Lat.toFixed(6)),
    lng: Number(car3Lng.toFixed(6)),
    coordinates: [Number(car3Lat.toFixed(6)), Number(car3Lng.toFixed(6))],
    speed_kmh: SIMULATED_FLEET_CONFIG[2].baseSpeed,
    heading: HIGHWAY_ORIGIN.heading,
    is_ghost_mode: ghostMode || ghostCarId === SIMULATED_FLEET_CONFIG[2].id,
    location_status: (ghostMode || ghostCarId === SIMULATED_FLEET_CONFIG[2].id) ? 'hidden' : 'fresh',
    distance_to_leader_km: Number((car3Dist || 0.70).toFixed(2)),
    recorded_at: nowIso,
  };

  // If Ghost Mode is active on Car 3, mask coordinates
  if (car3Vehicle.is_ghost_mode) {
    car3Vehicle.latitude = null;
    car3Vehicle.longitude = null;
    car3Vehicle.lat = null;
    car3Vehicle.lng = null;
    car3Vehicle.coordinates = null;
  }

  // 4. Compute Car 4 position (lagging vehicle)
  const { lagFactor, phaseName, car4Speed } = getCar4LagConfig(step, forcedPhase);
  const car4Lat = leadLat - lagFactor * HEADING_COS;
  const car4Lng = leadLng - lagFactor * HEADING_SIN;
  const car4Dist = calculateHaversineDistance(
    { latitude: leadLat, longitude: leadLng },
    { latitude: car4Lat, longitude: car4Lng }
  );
  const car4LagKm = Number((car4Dist || 0).toFixed(2));
  const isWarningActive = car4LagKm > DEFAULT_CONVOY_LAG_THRESHOLD_KM;

  const car4Vehicle = {
    user_id: SIMULATED_FLEET_CONFIG[3].id,
    id: SIMULATED_FLEET_CONFIG[3].id,
    name: SIMULATED_FLEET_CONFIG[3].name,
    is_lead: false,
    latitude: Number(car4Lat.toFixed(6)),
    longitude: Number(car4Lng.toFixed(6)),
    lat: Number(car4Lat.toFixed(6)),
    lng: Number(car4Lng.toFixed(6)),
    coordinates: [Number(car4Lat.toFixed(6)), Number(car4Lng.toFixed(6))],
    speed_kmh: car4Speed,
    heading: HIGHWAY_ORIGIN.heading,
    is_ghost_mode: ghostCarId === SIMULATED_FLEET_CONFIG[3].id,
    location_status: ghostCarId === SIMULATED_FLEET_CONFIG[3].id ? 'hidden' : 'fresh',
    distance_to_leader_km: car4LagKm,
    recorded_at: nowIso,
  };

  const vehicles = [leadVehicle, car2Vehicle, car3Vehicle, car4Vehicle];

  return {
    vehicles,
    leadVehicle,
    car4LagKm,
    isWarningActive,
    phaseName,
    step,
  };
}
