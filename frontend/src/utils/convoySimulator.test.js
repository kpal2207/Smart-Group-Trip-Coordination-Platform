import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateConvoySimulationStep,
  getCar4LagConfig,
  SIMULATED_FLEET_CONFIG,
  HIGHWAY_ORIGIN,
  SIMULATED_CAR_IDS,
  filterTeardownMembers,
  processFetchedConvoyLocations,
  broadcastConvoySimulation,
  getEffectiveGpsTelemetry,
} from './convoySimulator.js';
import { calculateHaversineDistance, DEFAULT_CONVOY_LAG_THRESHOLD_KM } from './geolocation.js';

describe('4-Car Convoy Highway Simulator (Sprint 2 Issue #3)', () => {
  describe('Fleet Composition & Synthetic IDs', () => {
    it('should generate exactly four vehicles with synthetic IDs and safe generic names', () => {
      const { vehicles } = generateConvoySimulationStep(0);
      assert.equal(vehicles.length, 4, 'Expected exactly 4 vehicles');

      const expectedIds = ['sim-car-1', 'sim-car-2', 'sim-car-3', 'sim-car-4'];
      const expectedNames = ['Lead Car', 'Car 2', 'Car 3', 'Car 4'];

      vehicles.forEach((veh, idx) => {
        assert.equal(veh.user_id, expectedIds[idx]);
        assert.equal(veh.id, expectedIds[idx]);
        assert.equal(veh.name, expectedNames[idx]);
      });
    });

    it('should designate Car 1 as the lead vehicle with highest pace', () => {
      const { vehicles, leadVehicle } = generateConvoySimulationStep(0);
      assert.equal(leadVehicle.user_id, 'sim-car-1');
      assert.equal(leadVehicle.is_lead, true);
      assert.equal(leadVehicle.distance_to_leader_km, 0);

      // Other vehicles must not be marked as leader
      assert.equal(vehicles[1].is_lead, false);
      assert.equal(vehicles[2].is_lead, false);
      assert.equal(vehicles[3].is_lead, false);
    });
  });

  describe('Vehicle Movement & Trajectory', () => {
    it('should move all vehicles forward along the highway as step increases', () => {
      const step0 = generateConvoySimulationStep(0);
      const step10 = generateConvoySimulationStep(10);

      // Lead Car moves along highway vector
      assert.ok(step10.leadVehicle.latitude > step0.leadVehicle.latitude, 'Latitude should advance');
      assert.ok(step10.leadVehicle.longitude > step0.leadVehicle.longitude, 'Longitude should advance');

      // All 4 vehicles should have advanced
      for (let i = 0; i < 4; i++) {
        assert.ok(
          step10.vehicles[i].latitude > step0.vehicles[i].latitude,
          `Car ${i + 1} should advance forward in latitude`
        );
      }
    });

    it('should keep Cars 2 and 3 close behind Car 1 (< 1.0 km separation)', () => {
      const { vehicles, leadVehicle } = generateConvoySimulationStep(5);
      const car2 = vehicles[1];
      const car3 = vehicles[2];

      const distCar2 = calculateHaversineDistance(leadVehicle, car2);
      const distCar3 = calculateHaversineDistance(leadVehicle, car3);

      assert.ok(distCar2 > 0.2 && distCar2 < 0.6, `Car 2 should be ~0.35 km behind, got ${distCar2} km`);
      assert.ok(distCar3 > 0.5 && distCar3 < 0.9, `Car 3 should be ~0.70 km behind, got ${distCar3} km`);
    });
  });

  describe('Distance Calculation & 2.0 km Lag Warning Threshold', () => {
    it('should calculate separation in kilometers using Haversine formula', () => {
      const { leadVehicle, vehicles, car4LagKm } = generateConvoySimulationStep(10);
      const car4 = vehicles[3];

      const actualDistance = calculateHaversineDistance(leadVehicle, car4);
      assert.ok(actualDistance !== null);
      assert.equal(car4LagKm, Number(actualDistance.toFixed(2)));
    });

    it('should NOT trigger warning when separation is around 1.5 km (< 2.0 km threshold)', () => {
      // Step 12 is ~1.34 km, step 13 is ~1.54 km
      const step13 = generateConvoySimulationStep(13);
      assert.ok(
        step13.car4LagKm < DEFAULT_CONVOY_LAG_THRESHOLD_KM,
        `Expected < 2.0 km, got ${step13.car4LagKm} km`
      );
      assert.equal(step13.isWarningActive, false, 'Warning must be false when lag < 2.0 km');
    });

    it('should TRIGGER warning when Car 4 separation exceeds 2.0 km', () => {
      // Step 18 is ~2.31 km (> 2.0 km threshold)
      const step18 = generateConvoySimulationStep(18);
      assert.ok(
        step18.car4LagKm > DEFAULT_CONVOY_LAG_THRESHOLD_KM,
        `Expected > 2.0 km, got ${step18.car4LagKm} km`
      );
      assert.equal(step18.isWarningActive, true, 'Warning must trigger when lag > 2.0 km');
    });

    it('should KEEP warning active while Car 4 remains separated', () => {
      for (let s = 17; s <= 21; s++) {
        const step = generateConvoySimulationStep(s);
        assert.ok(step.car4LagKm > 2.0, `Step ${s} should exceed 2.0 km, got ${step.car4LagKm}`);
        assert.equal(step.isWarningActive, true, `Step ${s} should have warning active`);
      }
    });

    it('should CLEAR warning when Car 4 regroups back under 2.0 km', () => {
      // Step 25 is ~1.65 km (regrouped)
      const step25 = generateConvoySimulationStep(25);
      assert.ok(
        step25.car4LagKm < DEFAULT_CONVOY_LAG_THRESHOLD_KM,
        `Expected < 2.0 km upon regroup, got ${step25.car4LagKm} km`
      );
      assert.equal(step25.isWarningActive, false, 'Warning must be cleared upon regrouping');
    });
  });

  describe('Deterministic Override Modes (Presentation Presets)', () => {
    it('should reliably produce safe state with forcedPhase: "safe"', () => {
      const result = generateConvoySimulationStep(0, { forcedPhase: 'safe' });
      assert.ok(result.car4LagKm < 1.0, `Expected safe distance < 1.0 km, got ${result.car4LagKm}`);
      assert.equal(result.isWarningActive, false);
      assert.equal(result.phaseName, 'SAFE_PACK');
    });

    it('should reliably produce warning state with forcedPhase: "warning"', () => {
      const result = generateConvoySimulationStep(0, { forcedPhase: 'warning' });
      assert.ok(result.car4LagKm > 2.0, `Expected warning distance > 2.0 km, got ${result.car4LagKm}`);
      assert.equal(result.isWarningActive, true);
      assert.equal(result.phaseName, 'WARNING_TRIGGERED');
    });

    it('should reliably produce regrouped state with forcedPhase: "regroup"', () => {
      const result = generateConvoySimulationStep(0, { forcedPhase: 'regroup' });
      assert.ok(result.car4LagKm < 2.0, `Expected distance < 2.0 km, got ${result.car4LagKm}`);
      assert.equal(result.isWarningActive, false);
      assert.equal(result.phaseName, 'REGROUPED');
    });
  });

  describe('Leaflet Map Compatibility & Data Formats', () => {
    it('should provide coordinates in all formats expected by Leaflet (lat, lng, latitude, longitude, array)', () => {
      const { vehicles } = generateConvoySimulationStep(3);

      vehicles.forEach((veh) => {
        // Standard keys
        assert.equal(typeof veh.latitude, 'number');
        assert.equal(typeof veh.longitude, 'number');
        // Leaflet shorthand keys
        assert.equal(veh.lat, veh.latitude);
        assert.equal(veh.lng, veh.longitude);
        // Leaflet [lat, lng] array
        assert.deepEqual(veh.coordinates, [veh.latitude, veh.longitude]);
        // Speed and heading
        assert.equal(typeof veh.speed_kmh, 'number');
        assert.equal(typeof veh.heading, 'number');
        // Freshness status
        assert.equal(veh.location_status, 'fresh');
      });
    });
  });

  describe('Ghost Mode & Privacy Safety', () => {
    it('should mask coordinates when default ghostMode toggle is ON (sim-car-3)', () => {
      const { vehicles } = generateConvoySimulationStep(0, { ghostMode: true });
      const ghostCar = vehicles[2]; // Car 3 is assigned to user/ghost mode

      assert.equal(ghostCar.is_ghost_mode, true);
      assert.equal(ghostCar.latitude, null, 'Latitude must be null in Ghost Mode');
      assert.equal(ghostCar.longitude, null, 'Longitude must be null in Ghost Mode');
      assert.equal(ghostCar.lat, null);
      assert.equal(ghostCar.lng, null);
      assert.equal(ghostCar.coordinates, null);
      assert.equal(ghostCar.location_status, 'hidden');
    });

    it('should mask coordinates for Lead Car when ghostCarId is sim-car-1', () => {
      const { vehicles, leadVehicle } = generateConvoySimulationStep(0, { ghostCarId: 'sim-car-1' });

      assert.equal(leadVehicle.is_ghost_mode, true);
      assert.equal(leadVehicle.latitude, null);
      assert.equal(leadVehicle.longitude, null);
      assert.equal(leadVehicle.lat, null);
      assert.equal(leadVehicle.lng, null);
      assert.equal(leadVehicle.coordinates, null);
      assert.equal(leadVehicle.location_status, 'hidden');

      assert.equal(vehicles[0].latitude, null);
      assert.equal(vehicles[0].location_status, 'hidden');

      // Other vehicles remain unmasked
      assert.equal(vehicles[1].is_ghost_mode, false);
      assert.ok(typeof vehicles[1].latitude === 'number');
    });

    it('should mask coordinates for Car 2 when ghostCarId is sim-car-2', () => {
      const { vehicles } = generateConvoySimulationStep(0, { ghostCarId: 'sim-car-2' });
      const car2 = vehicles[1];

      assert.equal(car2.is_ghost_mode, true);
      assert.equal(car2.latitude, null);
      assert.equal(car2.longitude, null);
      assert.equal(car2.lat, null);
      assert.equal(car2.lng, null);
      assert.equal(car2.coordinates, null);
      assert.equal(car2.location_status, 'hidden');

      // Lead car remains unmasked
      assert.equal(vehicles[0].is_ghost_mode, false);
      assert.ok(typeof vehicles[0].latitude === 'number');
    });

    it('should mask coordinates for Car 3 when ghostCarId is sim-car-3', () => {
      const { vehicles } = generateConvoySimulationStep(0, { ghostCarId: 'sim-car-3' });
      const car3 = vehicles[2];

      assert.equal(car3.is_ghost_mode, true);
      assert.equal(car3.latitude, null);
      assert.equal(car3.longitude, null);
      assert.equal(car3.lat, null);
      assert.equal(car3.lng, null);
      assert.equal(car3.coordinates, null);
      assert.equal(car3.location_status, 'hidden');
    });

    it('should mask coordinates for Car 4 when ghostCarId is sim-car-4', () => {
      const { vehicles } = generateConvoySimulationStep(0, { ghostCarId: 'sim-car-4' });
      const car4 = vehicles[3];

      assert.equal(car4.is_ghost_mode, true);
      assert.equal(car4.latitude, null);
      assert.equal(car4.longitude, null);
      assert.equal(car4.lat, null);
      assert.equal(car4.lng, null);
      assert.equal(car4.coordinates, null);
      assert.equal(car4.location_status, 'hidden');
    });

    it('should exclude hidden Car 4 from lag calculation and alert during warning phase', () => {
      // Step 18 is normally separation warning (> 2.0 km)
      const normalWarning = generateConvoySimulationStep(18);
      assert.equal(normalWarning.isWarningActive, true);
      assert.equal(normalWarning.laggingVehicles.length, 1);

      // When Car 4 activates Ghost Mode during warning phase
      const ghostWarning = generateConvoySimulationStep(18, { ghostCarId: 'sim-car-4' });
      assert.equal(ghostWarning.vehicles[3].is_ghost_mode, true);
      assert.equal(ghostWarning.vehicles[3].latitude, null);
      assert.equal(ghostWarning.car4LagKm, null, 'Lag distance must be null when coordinates are hidden');
      assert.equal(ghostWarning.isWarningActive, false, 'Warning must be suppressed when location is unknown');
      assert.deepEqual(ghostWarning.laggingVehicles, [], 'Hidden vehicle must not appear in laggingVehicles');
    });

    it('should suppress warning when forcedPhase is warning but Car 4 is in Ghost Mode', () => {
      const result = generateConvoySimulationStep(0, { forcedPhase: 'warning', ghostCarId: 'sim-car-4' });
      assert.equal(result.isWarningActive, false);
      assert.equal(result.car4LagKm, null);
      assert.deepEqual(result.laggingVehicles, []);
    });

    it('should mask coordinates for Lead Car and suppress lag calculations for followers when Lead Car is in Ghost Mode', () => {
      const { vehicles, leadVehicle, car4LagKm, isWarningActive, laggingVehicles } = generateConvoySimulationStep(18, { ghostCarId: 'sim-car-1' });

      assert.equal(leadVehicle.is_ghost_mode, true);
      assert.equal(leadVehicle.latitude, null);
      assert.equal(leadVehicle.longitude, null);
      assert.equal(leadVehicle.location_status, 'hidden');

      // Followers cannot calculate lag relative to hidden leader
      assert.equal(vehicles[1].distance_to_leader_km, null);
      assert.equal(vehicles[2].distance_to_leader_km, null);
      assert.equal(vehicles[3].distance_to_leader_km, null);
      assert.equal(car4LagKm, null);
      assert.equal(isWarningActive, false);
      assert.deepEqual(laggingVehicles, []);
    });
  });

  describe('Telemetry Event Payload & Leaflet Contract', () => {
    it('should include step and stepIndex matching the executed step number', () => {
      const step7 = generateConvoySimulationStep(7);
      assert.equal(step7.step, 7);
      assert.equal(step7.stepIndex, 7);

      const step23 = generateConvoySimulationStep(23);
      assert.equal(step23.step, 23);
      assert.equal(step23.stepIndex, 23);
    });

    it('should populate laggingVehicles identifying Car 4 in separation warning phase', () => {
      const warningResult = generateConvoySimulationStep(18);
      assert.equal(warningResult.isWarningActive, true);
      assert.equal(warningResult.laggingVehicles.length, 1);

      const laggingCar = warningResult.laggingVehicles[0];
      assert.equal(laggingCar.user_id, 'sim-car-4');
      assert.equal(laggingCar.name, 'Car 4');
      assert.ok(laggingCar.distance_to_leader_km > DEFAULT_CONVOY_LAG_THRESHOLD_KM);
    });

    it('should return empty laggingVehicles array during safe pack phase', () => {
      const safeResult = generateConvoySimulationStep(4);
      assert.equal(safeResult.isWarningActive, false);
      assert.deepEqual(safeResult.laggingVehicles, []);
    });
  });

  describe('Speed & Physics Calibration (~75 km/h over 3s ticks)', () => {
    it('should advance vehicles at highway speed matching ~75 km/h (62.5 m / 3s tick)', () => {
      const step0 = generateConvoySimulationStep(0);
      const step1 = generateConvoySimulationStep(1);

      const stepDistanceKm = calculateHaversineDistance(
        step0.leadVehicle,
        step1.leadVehicle
      );

      // Distance should be ~0.0628 km (62.8 meters per 3s = 75.4 km/h)
      assert.ok(
        stepDistanceKm >= 0.058 && stepDistanceKm <= 0.068,
        `Expected ~0.0625 km per tick, got ${stepDistanceKm} km`
      );

      const impliedSpeedKmh = (stepDistanceKm / 3) * 3600;
      assert.ok(
        impliedSpeedKmh >= 70 && impliedSpeedKmh <= 80,
        `Expected ~75 km/h, got ${impliedSpeedKmh.toFixed(1)} km/h`
      );
    });
  });

  describe('Simulation Cleanup & Teardown Architecture', () => {
    it('should remove ONLY specific simulated IDs belonging to stopped simulation and preserve real members and other sessions', () => {
      const mixedMembers = [
        { user_id: 'real-user-101', name: 'Rahul', is_simulated: false, latitude: 15.30, longitude: 74.12 },
        { user_id: 'real-user-102', name: 'Jay', is_simulated: false, latitude: 15.31, longitude: 74.13 },
        { user_id: 'sim-car-1', name: 'Lead Car', is_simulated: true, latitude: 15.29, longitude: 74.12 },
        { user_id: 'sim-car-2', name: 'Car 2', is_simulated: true, latitude: 15.28, longitude: 74.11 },
        { user_id: 'sim-car-3', name: 'Car 3', is_simulated: true, latitude: 15.27, longitude: 74.10 },
        { user_id: 'sim-car-4', name: 'Car 4', is_simulated: true, latitude: 15.25, longitude: 74.08 },
        { user_id: 'other-session-car-99', name: 'Other Demo', is_simulated: true, latitude: 15.20, longitude: 74.00 },
      ];

      // Use the actual filterTeardownMembers implementation from convoySimulator.js
      const cleaned = filterTeardownMembers(mixedMembers, SIMULATED_CAR_IDS);

      assert.equal(cleaned.length, 3, 'Must retain 2 real members AND 1 unrelated simulated session');
      assert.equal(cleaned[0].user_id, 'real-user-101');
      assert.equal(cleaned[1].user_id, 'real-user-102');
      assert.equal(cleaned[2].user_id, 'other-session-car-99', 'Must preserve unrelated simulated sessions');
      assert.ok(!cleaned.some((m) => SIMULATED_CAR_IDS.includes(m.user_id)));
    });

    it('should safely handle empty teardown lists without modifying members', () => {
      const members = [{ user_id: 'real-1' }, { user_id: 'sim-car-1' }];
      assert.equal(filterTeardownMembers(members, []).length, 2);
      assert.equal(filterTeardownMembers(null, SIMULATED_CAR_IDS).length, 0);
    });

    it('should reject stale backend fetch responses when isSimulating is active using processFetchedConvoyLocations', () => {
      const activeSimMembers = generateConvoySimulationStep(5).vehicles;
      const staleBackendResponse = [
        { user_id: 'real-101', latitude: 15.1, longitude: 74.1 },
      ];

      // While simulation is running, late network response must be ignored
      const resultWhileSimulating = processFetchedConvoyLocations(activeSimMembers, staleBackendResponse, true);
      assert.deepEqual(resultWhileSimulating, activeSimMembers, 'Active simulation must not be overwritten');

      // When simulation is stopped, network response should be accepted
      const resultWhenStopped = processFetchedConvoyLocations([], staleBackendResponse, false);
      assert.deepEqual(resultWhenStopped, staleBackendResponse, 'Real locations accepted when simulation is idle');
    });

    it('should broadcast simulation steps using distinct simulation_ping event (not telemetry_ping)', () => {
      const sentPings = [];
      const mockChannel = {
        send: (msg) => sentPings.push(msg),
      };

      const stepResult = generateConvoySimulationStep(3);
      const isConnected = true;

      const success = broadcastConvoySimulation(mockChannel, stepResult, isConnected);

      assert.equal(success, true);
      assert.equal(sentPings.length, 4, 'Must broadcast all 4 vehicles');
      sentPings.forEach((msg) => {
        assert.equal(msg.type, 'broadcast');
        assert.equal(msg.event, 'simulation_ping', 'Must use simulation_ping event to isolate from real telemetry');
        assert.notEqual(msg.event, 'telemetry_ping', 'Must NEVER use real telemetry_ping event');
        assert.equal(msg.payload.is_simulated, true);
        assert.ok(SIMULATED_CAR_IDS.includes(msg.payload.user_id));
      });
    });

    it('should defer simulation broadcast when channel is not connected (pending SUBSCRIBED)', () => {
      const sentPings = [];
      const mockChannel = {
        send: (msg) => sentPings.push(msg),
      };

      const stepResult = generateConvoySimulationStep(0);
      const isConnected = false;

      const success = broadcastConvoySimulation(mockChannel, stepResult, isConnected);

      assert.equal(success, false);
      assert.equal(sentPings.length, 0, 'Must not broadcast while connection is pending');
    });

    it('should isolate real GPS and guarantee synthetic coordinates can never be sent as real GPS telemetry', () => {
      // 1. Not broadcasting: returns null
      assert.equal(getEffectiveGpsTelemetry(false, true, { latitude: 15.3, longitude: 74.1 }, false), null);

      // 2. Broadcasting but no GPS fix: returns null
      assert.equal(getEffectiveGpsTelemetry(true, false, { latitude: 15.3, longitude: 74.1 }, false), null);

      // 3. Stopping simulation: hasRealGpsFix and realGpsLocation are null -> returns null
      assert.equal(getEffectiveGpsTelemetry(false, false, null, false), null);

      // 4. Synthetic coordinates cannot be emitted without a real GPS fix
      assert.equal(getEffectiveGpsTelemetry(true, false, null, false), null);

      // 5. Valid real device GPS fix emitting telemetry with ghost mode flag
      const realFix = { latitude: 15.2993, longitude: 74.1240, speed_kmh: 52.4, heading: 45.0 };
      const telemetry = getEffectiveGpsTelemetry(true, true, realFix, true);
      assert.ok(telemetry !== null);
      assert.equal(telemetry.latitude, 15.2993);
      assert.equal(telemetry.longitude, 74.1240);
      assert.equal(telemetry.speed_kmh, 52.4);
      assert.equal(telemetry.is_ghost_mode, true);
    });
  });

  describe('Geolocation Utilities Integration', () => {
    it('should integrate seamlessly with checkConvoyLag at safe distance (step 13, ~1.5 km)', async () => {
      const { checkConvoyLag } = await import('./geolocation.js');
      const step13 = generateConvoySimulationStep(13);
      const lagResult = checkConvoyLag(step13.vehicles[3], step13.leadVehicle);

      assert.equal(lagResult.isLagging, false);
      assert.equal(lagResult.status, 'SAFE');
      assert.ok(lagResult.distanceKm < 2.0);
    });

    it('should integrate seamlessly with checkConvoyLag above threshold (step 18, > 2.0 km)', async () => {
      const { checkConvoyLag } = await import('./geolocation.js');
      const step18 = generateConvoySimulationStep(18);
      const lagResult = checkConvoyLag(step18.vehicles[3], step18.leadVehicle);

      assert.equal(lagResult.isLagging, true);
      assert.equal(lagResult.status, 'LAGGING');
      assert.ok(lagResult.distanceKm > 2.0);
    });

    it('should integrate seamlessly with checkConvoyLag on regrouping (step 26, < 2.0 km)', async () => {
      const { checkConvoyLag } = await import('./geolocation.js');
      const step26 = generateConvoySimulationStep(26);
      const lagResult = checkConvoyLag(step26.vehicles[3], step26.leadVehicle);

      assert.equal(lagResult.isLagging, false);
      assert.equal(lagResult.status, 'SAFE');
      assert.ok(lagResult.distanceKm < 2.0);
    });

    it('should calculate valid convoy centroid across all simulated vehicles', async () => {
      const { calculateConvoyCentroid } = await import('./geolocation.js');
      const { vehicles } = generateConvoySimulationStep(5);
      const centroid = calculateConvoyCentroid(vehicles);

      assert.ok(centroid !== null);
      assert.ok(typeof centroid.latitude === 'number');
      assert.ok(typeof centroid.longitude === 'number');
      assert.ok(centroid.latitude > 15.0 && centroid.latitude < 16.0);
      assert.ok(centroid.longitude > 74.0 && centroid.longitude < 75.0);
    });

    it('should produce coordinates that normalize cleanly with normalizeCoordinates', async () => {
      const { normalizeCoordinates } = await import('./geolocation.js');
      const { vehicles } = generateConvoySimulationStep(2);

      vehicles.forEach((veh) => {
        const normalized = normalizeCoordinates(veh);
        assert.ok(normalized !== null);
        assert.equal(normalized.latitude, veh.latitude);
        assert.equal(normalized.longitude, veh.longitude);
      });
    });
  });
});

