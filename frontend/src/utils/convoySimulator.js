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

/// Degrees latitude/longitude per step at ~75 km/h with 3-second ticks (62.5 m / tick)
const STEP_LAT_DELTA = 0.00048;
const STEP_LNG_DELTA = 0.00031;

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
 *   laggingVehicles: Array<Object>,
 *   car4LagKm: number|null,
 *   isWarningActive: boolean,
 *   phaseName: string,
 *   step: number,
 *   stepIndex: number
 * }}
 */
export function generateConvoySimulationStep(step = 0, options = {}) {
  const { forcedPhase = null, ghostMode = false, ghostCarId = null } = options;

  const isCarGhost = (id) => {
    if (ghostCarId) {
      return id === ghostCarId;
    }
    return Boolean(ghostMode && id === 'sim-car-3');
  };

  const applyGhostMasking = (vehicle) => {
    if (vehicle.is_ghost_mode) {
      vehicle.latitude = null;
      vehicle.longitude = null;
      vehicle.lat = null;
      vehicle.lng = null;
      vehicle.coordinates = null;
      vehicle.location_status = 'hidden';
    }
  };

  // 1. Compute Lead Car position along the highway
  const leadLat = HIGHWAY_ORIGIN.latitude + step * STEP_LAT_DELTA;
  const leadLng = HIGHWAY_ORIGIN.longitude + step * STEP_LNG_DELTA;
  const nowIso = new Date().toISOString();

  const leadGhost = isCarGhost(SIMULATED_FLEET_CONFIG[0].id);
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
    is_ghost_mode: leadGhost,
    location_status: leadGhost ? 'hidden' : 'fresh',
    distance_to_leader_km: 0.0,
    recorded_at: nowIso,
  };
  applyGhostMasking(leadVehicle);

  // 2. Compute Car 2 position (~0.35 km behind leader along heading vector)
  const car2Lat = leadLat - 0.0031 * HEADING_COS;
  const car2Lng = leadLng - 0.0031 * HEADING_SIN;
  const car2Dist = calculateHaversineDistance(
    { latitude: leadLat, longitude: leadLng },
    { latitude: car2Lat, longitude: car2Lng }
  );
  const car2Ghost = isCarGhost(SIMULATED_FLEET_CONFIG[1].id);

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
    is_ghost_mode: car2Ghost,
    location_status: car2Ghost ? 'hidden' : 'fresh',
    distance_to_leader_km: leadGhost || car2Ghost ? null : Number((car2Dist || 0.35).toFixed(2)),
    recorded_at: nowIso,
  };
  applyGhostMasking(car2Vehicle);

  // 3. Compute Car 3 position (~0.70 km behind leader)
  const car3Lat = leadLat - 0.0063 * HEADING_COS;
  const car3Lng = leadLng - 0.0063 * HEADING_SIN;
  const car3Dist = calculateHaversineDistance(
    { latitude: leadLat, longitude: leadLng },
    { latitude: car3Lat, longitude: car3Lng }
  );
  const car3Ghost = isCarGhost(SIMULATED_FLEET_CONFIG[2].id);

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
    is_ghost_mode: car3Ghost,
    location_status: car3Ghost ? 'hidden' : 'fresh',
    distance_to_leader_km: leadGhost || car3Ghost ? null : Number((car3Dist || 0.70).toFixed(2)),
    recorded_at: nowIso,
  };
  applyGhostMasking(car3Vehicle);

  // 4. Compute Car 4 position (lagging vehicle)
  const { lagFactor, phaseName, car4Speed } = getCar4LagConfig(step, forcedPhase);
  const car4Lat = leadLat - lagFactor * HEADING_COS;
  const car4Lng = leadLng - lagFactor * HEADING_SIN;
  const car4Dist = calculateHaversineDistance(
    { latitude: leadLat, longitude: leadLng },
    { latitude: car4Lat, longitude: car4Lng }
  );
  const rawLagKm = Number((car4Dist || 0).toFixed(2));
  const car4Ghost = isCarGhost(SIMULATED_FLEET_CONFIG[3].id);
  const car4LagKm = leadGhost || car4Ghost ? null : rawLagKm;
  const isWarningActive = !leadGhost && !car4Ghost && rawLagKm > DEFAULT_CONVOY_LAG_THRESHOLD_KM;

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
    is_ghost_mode: car4Ghost,
    location_status: car4Ghost ? 'hidden' : 'fresh',
    distance_to_leader_km: car4LagKm,
    recorded_at: nowIso,
  };
  applyGhostMasking(car4Vehicle);

  const vehicles = [leadVehicle, car2Vehicle, car3Vehicle, car4Vehicle];
  const laggingVehicles = isWarningActive && !car4Vehicle.is_ghost_mode ? [car4Vehicle] : [];

  return {
    vehicles,
    leadVehicle,
    laggingVehicles,
    car4LagKm,
    isWarningActive,
    phaseName,
    step,
    stepIndex: step,
  };
}

export const SIMULATED_CAR_IDS = ['sim-car-1', 'sim-car-2', 'sim-car-3', 'sim-car-4'];

/**
 * Filters out only the specific simulated vehicle IDs from a members list upon simulation teardown.
 * Preserves real members and any unrelated simulated sessions.
 *
 * @param {Array<Object>} members
 * @param {Array<string>} teardownIds
 * @returns {Array<Object>}
 */
export function filterTeardownMembers(members, teardownIds = SIMULATED_CAR_IDS) {
  if (!Array.isArray(members)) return [];
  if (!Array.isArray(teardownIds) || teardownIds.length === 0) {
    return [...members];
  }
  const idSet = new Set(teardownIds);
  return members.filter((member) => !idSet.has(member?.user_id));
}

/**
 * Handles incoming fetched convoy locations from the backend.
 * Ensures that late or stale backend responses do not overwrite an active simulation.
 *
 * @param {Array<Object>} currentMembers
 * @param {Array<Object>} fetchedLocations
 * @param {boolean} isSimulating
 * @returns {Array<Object>}
 */
export function processFetchedConvoyLocations(currentMembers, fetchedLocations, isSimulating) {
  if (isSimulating) {
    return currentMembers;
  }
  return Array.isArray(fetchedLocations) ? fetchedLocations : [];
}

/**
 * Broadcasts simulation state to connected peers using a distinct Realtime event.
 * Uses 'simulation_ping' to keep fake vehicle coordinates completely separate from real live GPS telemetry.
 *
 * @param {Object} channel - Supabase Realtime channel
 * @param {Object} stepResult - Result from generateConvoySimulationStep
 * @param {boolean} isConnected - Current connection status ref
 * @returns {boolean} True if broadcast was sent, false otherwise
 */
export function broadcastConvoySimulation(channel, stepResult, isConnected) {
  if (!channel || !isConnected || !stepResult || !Array.isArray(stepResult.vehicles)) {
    return false;
  }
  stepResult.vehicles.forEach((veh) => {
    channel.send({
      type: 'broadcast',
      event: 'simulation_ping',
      payload: {
        user_id: veh.user_id,
        name: veh.name,
        latitude: veh.latitude,
        longitude: veh.longitude,
        speed_kmh: veh.speed_kmh,
        heading: veh.heading,
        is_ghost_mode: Boolean(veh.is_ghost_mode),
        is_simulated: true,
        step: stepResult.step,
        recorded_at: veh.recorded_at || new Date().toISOString(),
      },
    });
  });
  return true;
}

/**
 * Pure helper to validate and format real device GPS telemetry before emitting.
 * Guarantees that synthetic coordinates can NEVER be sent as real GPS telemetry.
 *
 * @param {boolean} isBroadcasting
 * @param {boolean} hasRealGpsFix
 * @param {Object|null} realGpsLocation
 * @param {boolean} ghostMode
 * @returns {Object|null}
 */
export function getEffectiveGpsTelemetry(isBroadcasting, hasRealGpsFix, realGpsLocation, ghostMode) {
  if (!isBroadcasting || !hasRealGpsFix || !realGpsLocation) {
    return null;
  }
  if (realGpsLocation.latitude == null || realGpsLocation.longitude == null) {
    return null;
  }
  return {
    latitude: Number(realGpsLocation.latitude),
    longitude: Number(realGpsLocation.longitude),
    speed_kmh: Number(realGpsLocation.speed_kmh || 0),
    heading: Number(realGpsLocation.heading || 0),
    is_ghost_mode: Boolean(ghostMode),
  };
}
