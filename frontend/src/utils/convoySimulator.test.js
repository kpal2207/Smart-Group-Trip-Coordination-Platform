import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateConvoySimulationStep,
  getCar4LagConfig,
  SIMULATED_FLEET_CONFIG,
  HIGHWAY_ORIGIN,
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
    it('should mask coordinates when vehicle is in Ghost Mode', () => {
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

