import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EARTH_RADIUS_KM,
  DEFAULT_CONVOY_LAG_THRESHOLD_KM,
  POLLING_INTERVALS_MS,
  POLLING_INTERVALS_SEC,
  CONVOY_STATUS,
  normalizeCoordinates,
  calculateHaversineDistance,
  calculateConvoyCentroid,
  checkConvoyLag,
  getSpeedBasedPollingInterval,
  calculateBearing,
  formatDistance,
  getMemberLocationStatus,
  buildBroadcastTelemetryPayload,
  getValidConvoyVehicles,
} from './geolocation.js';

describe('Geolocation & GIS Utilities (Sprint 2)', () => {
  describe('Constants', () => {
    it('should use standard Earth radius of 6371 km', () => {
      assert.equal(EARTH_RADIUS_KM, 6371);
    });

    it('should have a default convoy lag threshold of 2.0 km', () => {
      assert.equal(DEFAULT_CONVOY_LAG_THRESHOLD_KM, 2.0);
    });
  });

  describe('normalizeCoordinates', () => {
    it('should normalize { latitude, longitude } object', () => {
      const result = normalizeCoordinates({ latitude: 12.9716, longitude: 77.5946 });
      assert.deepEqual(result, { latitude: 12.9716, longitude: 77.5946 });
    });

    it('should normalize { lat, lng } object (Leaflet format)', () => {
      const result = normalizeCoordinates({ lat: 23.0225, lng: 72.5714 });
      assert.deepEqual(result, { latitude: 23.0225, longitude: 72.5714 });
    });

    it('should normalize [lat, lng] array format', () => {
      const result = normalizeCoordinates([28.6139, 77.209]);
      assert.deepEqual(result, { latitude: 28.6139, longitude: 77.209 });
    });

    it('should return null for null, undefined, or empty values', () => {
      assert.equal(normalizeCoordinates(null), null);
      assert.equal(normalizeCoordinates(undefined), null);
      assert.equal(normalizeCoordinates({}), null);
      assert.equal(normalizeCoordinates([]), null);
    });

    it('should return null for out-of-range coordinates', () => {
      assert.equal(normalizeCoordinates({ latitude: 91, longitude: 0 }), null);
      assert.equal(normalizeCoordinates({ latitude: -91, longitude: 0 }), null);
      assert.equal(normalizeCoordinates({ latitude: 0, longitude: 181 }), null);
      assert.equal(normalizeCoordinates({ latitude: 0, longitude: -181 }), null);
      assert.equal(normalizeCoordinates({ latitude: 'invalid', longitude: 50 }), null);
    });
  });

  describe('calculateHaversineDistance', () => {
    it('should return 0 when both coordinates are identical', () => {
      const p1 = { latitude: 23.0225, longitude: 72.5714 };
      const distance = calculateHaversineDistance(p1, p1);
      assert.equal(distance, 0);
    });

    it('should calculate accurate distance for known real-world benchmark (London to Paris)', () => {
      const london = { latitude: 51.5074, longitude: -0.1278 };
      const paris = { latitude: 48.8566, longitude: 2.3522 };

      const distance = calculateHaversineDistance(london, paris);
      // Theoretical benchmark with R=6371 km is ~343.55 km
      assert.ok(distance !== null);
      assert.ok(Math.abs(distance - 343.55) < 0.5, `Expected ~343.55 km, got ${distance}`);
    });

    it('should calculate accurate 1-degree distance along the Equator', () => {
      const p1 = { latitude: 0, longitude: 0 };
      const p2 = { latitude: 0, longitude: 1 };

      const distance = calculateHaversineDistance(p1, p2);
      // (2 * pi * 6371) / 360 = ~111.195 km
      const expected = (2 * Math.PI * 6371) / 360;
      assert.ok(distance !== null);
      assert.ok(Math.abs(distance - expected) < 0.01, `Expected ~${expected}, got ${distance}`);
    });

    it('should handle interchangeable coordinate formats', () => {
      const dist1 = calculateHaversineDistance(
        { latitude: 23.0225, longitude: 72.5714 },
        { lat: 23.0325, lng: 72.5814 }
      );
      const dist2 = calculateHaversineDistance(
        [23.0225, 72.5714],
        [23.0325, 72.5814]
      );

      assert.ok(dist1 !== null && dist2 !== null);
      assert.equal(dist1.toFixed(4), dist2.toFixed(4));
    });

    it('should return null when any coordinate is invalid or missing', () => {
      assert.equal(calculateHaversineDistance(null, { latitude: 10, longitude: 10 }), null);
      assert.equal(calculateHaversineDistance({ latitude: 10, longitude: 10 }, null), null);
      assert.equal(calculateHaversineDistance({ latitude: 100, longitude: 10 }, { latitude: 10, longitude: 10 }), null);
    });
  });

  describe('calculateConvoyCentroid', () => {
    it('should calculate the centroid of active convoy members', () => {
      const members = [
        { id: 1, name: 'Alice', location: { latitude: 20.0, longitude: 70.0 } },
        { id: 2, name: 'Bob', location: { latitude: 22.0, longitude: 72.0 } },
        { id: 3, name: 'Charlie', location: { latitude: 24.0, longitude: 74.0 } }
      ];

      const centroid = calculateConvoyCentroid(members);
      assert.deepEqual(centroid, { latitude: 22.0, longitude: 72.0 });
    });

    it('should exclude members in Ghost Mode or with null locations', () => {
      const members = [
        { id: 1, name: 'Alice', location: { latitude: 20.0, longitude: 70.0 } },
        { id: 2, name: 'Bob', is_ghost_mode: true, location: null }, // Ghost mode
        { id: 3, name: 'Charlie', location: { latitude: 22.0, longitude: 72.0 } },
        { id: 4, name: 'Dave', location: null } // No location
      ];

      const centroid = calculateConvoyCentroid(members);
      assert.deepEqual(centroid, { latitude: 21.0, longitude: 71.0 });
    });

    it('should return null if no valid locations exist', () => {
      assert.equal(calculateConvoyCentroid([]), null);
      assert.equal(calculateConvoyCentroid(null), null);
      assert.equal(
        calculateConvoyCentroid([
          { id: 1, is_ghost_mode: true },
          { id: 2, location: null }
        ]),
        null
      );
    });
  });

  describe('checkConvoyLag', () => {
    const leaderPos = { latitude: 23.0225, longitude: 72.5714 };

    it('should flag SAFE when separation is well within 2.0 km', () => {
      // Small offset (~0.5 km)
      const member = {
        id: 2,
        name: 'Member 2',
        location: { latitude: 23.0245, longitude: 72.5734 }
      };

      const result = checkConvoyLag(member, leaderPos);
      assert.equal(result.isLagging, false);
      assert.equal(result.status, CONVOY_STATUS.SAFE);
      assert.ok(result.distanceKm < 2.0);
      assert.equal(result.thresholdKm, 2.0);
    });

    it('should flag LAGGING when separation is greater than 2.0 km', () => {
      // Larger offset (~5 km)
      const laggingMember = {
        id: 3,
        name: 'Member 3',
        location: { latitude: 23.0625, longitude: 72.5714 }
      };

      const result = checkConvoyLag(laggingMember, leaderPos);
      assert.equal(result.isLagging, true);
      assert.equal(result.status, CONVOY_STATUS.LAGGING);
      assert.ok(result.distanceKm > 2.0);
    });

    it('should support custom threshold', () => {
      const member = {
        id: 2,
        location: { latitude: 23.0325, longitude: 72.5714 }
      };
      // Distance is ~1.11 km
      const resultSafe = checkConvoyLag(member, leaderPos, { thresholdKm: 1.5 });
      assert.equal(resultSafe.isLagging, false);

      const resultLagging = checkConvoyLag(member, leaderPos, { thresholdKm: 1.0 });
      assert.equal(resultLagging.isLagging, true);
      assert.equal(resultLagging.thresholdKm, 1.0);
    });

    it('should calculate lag against a member list using convoy centroid', () => {
      const members = [
        { id: 1, location: { latitude: 23.02, longitude: 72.57 } },
        { id: 2, location: { latitude: 23.03, longitude: 72.57 } },
        { id: 3, location: { latitude: 23.10, longitude: 72.57 } } // Separated member
      ];

      const checkSeparated = checkConvoyLag(members[2], members);
      assert.equal(checkSeparated.isLagging, true);
      assert.equal(checkSeparated.status, CONVOY_STATUS.LAGGING);
      assert.ok(checkSeparated.referenceCoord !== null);
    });

    it('should safely handle Ghost Mode without throwing', () => {
      const ghostMember = {
        id: 4,
        is_ghost_mode: true,
        location: null
      };

      const result = checkConvoyLag(ghostMember, leaderPos);
      assert.equal(result.isLagging, false);
      assert.equal(result.distanceKm, null);
      assert.equal(result.status, CONVOY_STATUS.GHOST_MODE);
    });

    it('should safely handle missing member location or missing reference', () => {
      const unavailableMember = { id: 5, location: null };
      const res1 = checkConvoyLag(unavailableMember, leaderPos);
      assert.equal(res1.status, CONVOY_STATUS.LOCATION_UNAVAILABLE);

      const validMember = { id: 1, location: leaderPos };
      const res2 = checkConvoyLag(validMember, null);
      assert.equal(res2.status, CONVOY_STATUS.REFERENCE_UNAVAILABLE);
    });
  });

  describe('getSpeedBasedPollingInterval', () => {
    it('should return FAST interval (5s / 5000ms) for speed > 40 km/h', () => {
      assert.equal(getSpeedBasedPollingInterval(40.1), POLLING_INTERVALS_MS.FAST);
      assert.equal(getSpeedBasedPollingInterval(65), POLLING_INTERVALS_MS.FAST);
      assert.equal(getSpeedBasedPollingInterval(120), POLLING_INTERVALS_MS.FAST);

      // In seconds mode
      assert.equal(getSpeedBasedPollingInterval(45, { inSeconds: true }), POLLING_INTERVALS_SEC.FAST);
    });

    it('should return MODERATE interval (15s / 15000ms) for speed 10–40 km/h', () => {
      assert.equal(getSpeedBasedPollingInterval(40.0), POLLING_INTERVALS_MS.MODERATE);
      assert.equal(getSpeedBasedPollingInterval(39.9), POLLING_INTERVALS_MS.MODERATE);
      assert.equal(getSpeedBasedPollingInterval(25), POLLING_INTERVALS_MS.MODERATE);
      assert.equal(getSpeedBasedPollingInterval(10.0), POLLING_INTERVALS_MS.MODERATE);

      // In seconds mode
      assert.equal(getSpeedBasedPollingInterval(25, { inSeconds: true }), POLLING_INTERVALS_SEC.MODERATE);
    });

    it('should return SLOW interval (30s / 30000ms) for speed < 10 km/h', () => {
      assert.equal(getSpeedBasedPollingInterval(9.9), POLLING_INTERVALS_MS.SLOW);
      assert.equal(getSpeedBasedPollingInterval(5), POLLING_INTERVALS_MS.SLOW);
      assert.equal(getSpeedBasedPollingInterval(0), POLLING_INTERVALS_MS.SLOW);

      // In seconds mode
      assert.equal(getSpeedBasedPollingInterval(0, { inSeconds: true }), POLLING_INTERVALS_SEC.SLOW);
    });

    it('should return FALLBACK interval for missing or invalid speed', () => {
      assert.equal(getSpeedBasedPollingInterval(null), POLLING_INTERVALS_MS.FALLBACK);
      assert.equal(getSpeedBasedPollingInterval(undefined), POLLING_INTERVALS_MS.FALLBACK);
      assert.equal(getSpeedBasedPollingInterval(NaN), POLLING_INTERVALS_MS.FALLBACK);
      assert.equal(getSpeedBasedPollingInterval('abc'), POLLING_INTERVALS_MS.FALLBACK);
    });

    it('should return SLOW interval for negative speeds (stationary/sensor noise)', () => {
      assert.equal(getSpeedBasedPollingInterval(-1), POLLING_INTERVALS_MS.SLOW);
    });
  });

  describe('calculateBearing', () => {
    it('should calculate 0° for due North', () => {
      const bearing = calculateBearing([0, 0], [1, 0]);
      assert.equal(Math.round(bearing), 0);
    });

    it('should calculate 90° for due East', () => {
      const bearing = calculateBearing([0, 0], [0, 1]);
      assert.equal(Math.round(bearing), 90);
    });

    it('should calculate 180° for due South', () => {
      const bearing = calculateBearing([1, 0], [0, 0]);
      assert.equal(Math.round(bearing), 180);
    });

    it('should calculate 270° for due West', () => {
      const bearing = calculateBearing([0, 1], [0, 0]);
      assert.equal(Math.round(bearing), 270);
    });

    it('should return null for invalid coordinates', () => {
      assert.equal(calculateBearing(null, [0, 0]), null);
      assert.equal(calculateBearing([0, 0], null), null);
    });
  });

  describe('formatDistance', () => {
    it('should format distances < 1.0 km in meters', () => {
      assert.equal(formatDistance(0.45), '450 m');
      assert.equal(formatDistance(0.05), '50 m');
      assert.equal(formatDistance(0.999), '999 m');
    });

    it('should format distances >= 1.0 km in kilometers', () => {
      assert.equal(formatDistance(1.0), '1.0 km');
      assert.equal(formatDistance(2.345), '2.3 km');
      assert.equal(formatDistance(15.78), '15.8 km');
    });

    it('should return "--" for null or undefined', () => {
      assert.equal(formatDistance(null), '--');
      assert.equal(formatDistance(undefined), '--');
    });
  });

  describe('buildBroadcastTelemetryPayload & Ghost Mode Masking', () => {
    const mockUser = { id: 42, name: 'Ruhan Driver' };

    it('should retain coordinates when Ghost Mode is OFF', () => {
      const ping = {
        latitude: 15.2993,
        longitude: 74.1240,
        speed_kmh: 75.0,
        heading: 180,
        is_ghost_mode: false,
      };
      const broadcast = buildBroadcastTelemetryPayload(mockUser, ping);
      assert.equal(broadcast.user_id, 42);
      assert.equal(broadcast.latitude, 15.2993);
      assert.equal(broadcast.longitude, 74.1240);
      assert.equal(broadcast.is_ghost_mode, false);
      assert.equal(broadcast.location_status, 'fresh');
    });

    it('should mask coordinates to null before WebSocket broadcast when Ghost Mode is ON', () => {
      const ping = {
        latitude: 15.2993,
        longitude: 74.1240,
        speed_kmh: 80.0,
        heading: 185,
        is_ghost_mode: true,
      };
      const broadcast = buildBroadcastTelemetryPayload(mockUser, ping);
      assert.equal(broadcast.user_id, 42);
      assert.equal(broadcast.latitude, null);
      assert.equal(broadcast.longitude, null);
      assert.equal(broadcast.is_ghost_mode, true);
      assert.equal(broadcast.location_status, 'hidden');
      // Speed and heading remain for convoy spacing safety
      assert.equal(broadcast.speed_kmh, 80.0);
      assert.equal(broadcast.heading, 185);
    });

    it('should ensure the next scheduled ping reflects dynamically toggled Ghost Mode setting', () => {
      let currentGhostModeSetting = false;

      // Simulated scheduler callback that reads dynamic setting
      const generateNextScheduledPing = (step) => {
        const pingData = {
          latitude: 15.2993 + (step * 0.001),
          longitude: 74.1240 + (step * 0.001),
          speed_kmh: 60,
          heading: 90,
          is_ghost_mode: currentGhostModeSetting,
        };
        return buildBroadcastTelemetryPayload(mockUser, pingData);
      };

      // Step 1: Simulator starts with Ghost Mode OFF
      const tick1 = generateNextScheduledPing(1);
      assert.ok(tick1.latitude !== null && tick1.longitude !== null);
      assert.equal(tick1.is_ghost_mode, false);

      // User toggles Ghost Mode ON
      currentGhostModeSetting = true;

      // Step 2: Next scheduled ping MUST use current setting and mask coordinates
      const tick2 = generateNextScheduledPing(2);
      assert.equal(tick2.latitude, null);
      assert.equal(tick2.longitude, null);
      assert.equal(tick2.is_ghost_mode, true);
      assert.equal(tick2.location_status, 'hidden');

      // Step 3: Subsequent scheduled ping continues to stay masked
      const tick3 = generateNextScheduledPing(3);
      assert.equal(tick3.latitude, null);
      assert.equal(tick3.longitude, null);
      assert.equal(tick3.is_ghost_mode, true);

      // User toggles Ghost Mode back OFF
      currentGhostModeSetting = false;

      // Step 4: Next scheduled ping restores coordinates
      const tick4 = generateNextScheduledPing(4);
      assert.ok(tick4.latitude !== null && tick4.longitude !== null);
      assert.equal(tick4.is_ghost_mode, false);
      assert.equal(tick4.location_status, 'fresh');
    });
  });

  describe('getMemberLocationStatus & Realtime Telemetry Aging', () => {
    const baseTime = new Date('2026-11-20T12:00:00Z');

    it('should return fresh when ping is within 60 seconds', () => {
      const member = {
        user_id: 1,
        name: 'Lead Driver',
        latitude: 15.2993,
        longitude: 74.1240,
        is_ghost_mode: false,
        recorded_at: baseTime.toISOString(),
      };

      // Evaluated at 0s, 30s, and exactly 60s
      assert.equal(getMemberLocationStatus(member, new Date('2026-11-20T12:00:00Z')), 'fresh');
      assert.equal(getMemberLocationStatus(member, new Date('2026-11-20T12:00:30Z')), 'fresh');
      assert.equal(getMemberLocationStatus(member, new Date('2026-11-20T12:01:00Z')), 'fresh');
    });

    it('should transition to stale when ping is between 61s and 300s old', () => {
      const member = {
        user_id: 2,
        name: 'Lagging Car',
        latitude: 15.2993,
        longitude: 74.1240,
        is_ghost_mode: false,
        recorded_at: baseTime.toISOString(),
      };

      // 61 seconds (1m 1s)
      assert.equal(getMemberLocationStatus(member, new Date('2026-11-20T12:01:01Z')), 'stale');
      // 180 seconds (3 minutes)
      assert.equal(getMemberLocationStatus(member, new Date('2026-11-20T12:03:00Z')), 'stale');
      // 300 seconds (exactly 5 minutes)
      assert.equal(getMemberLocationStatus(member, new Date('2026-11-20T12:05:00Z')), 'stale');
    });

    it('should transition to unavailable when ping is older than 5 minutes (300s)', () => {
      const member = {
        user_id: 3,
        name: 'Offline Vehicle',
        latitude: 15.2993,
        longitude: 74.1240,
        is_ghost_mode: false,
        recorded_at: baseTime.toISOString(),
      };

      // 301 seconds (5m 1s)
      assert.equal(getMemberLocationStatus(member, new Date('2026-11-20T12:05:01Z')), 'unavailable');
      // 360 seconds (6 minutes)
      assert.equal(getMemberLocationStatus(member, new Date('2026-11-20T12:06:00Z')), 'unavailable');
      // 1 hour later
      assert.equal(getMemberLocationStatus(member, new Date('2026-11-20T13:00:00Z')), 'unavailable');
    });

    it('should always return hidden when member is in Ghost Mode regardless of age', () => {
      const ghostMember = {
        user_id: 4,
        name: 'Ghost Vehicle',
        latitude: null,
        longitude: null,
        is_ghost_mode: true,
        recorded_at: baseTime.toISOString(),
      };

      assert.equal(getMemberLocationStatus(ghostMember, new Date('2026-11-20T12:00:10Z')), 'hidden');
      assert.equal(getMemberLocationStatus(ghostMember, new Date('2026-11-20T12:02:00Z')), 'hidden');
      assert.equal(getMemberLocationStatus(ghostMember, new Date('2026-11-20T12:10:00Z')), 'hidden');
    });
  });

  describe('getValidConvoyVehicles & Expired Ping Drop-Out (Regression Test)', () => {
    const baseTime = new Date('2026-11-21T10:00:00Z');

    it('should drop an expired vehicle from validVehicles, centroid, and leader when clock advances past 300 seconds', () => {
      const car1Lead = {
        user_id: 1,
        name: 'Lead Vehicle',
        latitude: 15.3000,
        longitude: 74.1200,
        speed_kmh: 90.0,
        is_ghost_mode: false,
        recorded_at: baseTime.toISOString(),
      };

      const car2Follower = {
        user_id: 2,
        name: 'Trailing Vehicle',
        latitude: 15.2700,
        longitude: 74.1000,
        speed_kmh: 80.0,
        is_ghost_mode: false,
        recorded_at: baseTime.toISOString(),
      };

      const members = [car1Lead, car2Follower];

      // Phase 1: At T0 (0s elapsed), both vehicles are fresh
      const validAtT0 = getValidConvoyVehicles(members, baseTime);
      assert.equal(validAtT0.length, 2);
      assert.deepEqual(validAtT0.map((v) => v.user_id), [1, 2]);

      const centroidAtT0 = calculateConvoyCentroid(validAtT0);
      assert.ok(centroidAtT0 !== null);
      assert.equal(centroidAtT0.latitude, (15.3000 + 15.2700) / 2);
      assert.equal(centroidAtT0.longitude, (74.1200 + 74.1000) / 2);

      // Phase 2: Advance clock by 120s (2 minutes). Both are stale, but still fresh/stale
      const timeAt120s = new Date(baseTime.getTime() + 120 * 1000);
      const validAt120s = getValidConvoyVehicles(members, timeAt120s);
      assert.equal(validAt120s.length, 2);

      // Phase 3: Car 1 broadcasts a new ping at 300s, but Car 2 stops transmitting
      const car1Updated = {
        ...car1Lead,
        latitude: 15.3200,
        longitude: 74.1300,
        speed_kmh: 92.0,
        recorded_at: new Date(baseTime.getTime() + 300 * 1000).toISOString(),
      };
      const membersWithAgingCar2 = [car1Updated, car2Follower];

      // Advance clock past 300s from Car 2's last ping (e.g., 305 seconds / 5m 5s)
      const timeAt305s = new Date(baseTime.getTime() + 305 * 1000);

      // Roster statuses: Car 1 is fresh, Car 2 is unavailable
      assert.equal(getMemberLocationStatus(car1Updated, timeAt305s), 'fresh');
      assert.equal(getMemberLocationStatus(car2Follower, timeAt305s), 'unavailable');

      // REGRESSION VERIFICATION 1: Car 2 must DROP OUT of validVehicles
      const validAt305s = getValidConvoyVehicles(membersWithAgingCar2, timeAt305s);
      assert.equal(validAt305s.length, 1);
      assert.equal(validAt305s[0].user_id, 1);

      // REGRESSION VERIFICATION 2: Centroid strictly recalculates without the expired car
      const centroidAt305s = calculateConvoyCentroid(validAt305s);
      assert.ok(centroidAt305s !== null);
      assert.equal(centroidAt305s.latitude, 15.3200);
      assert.equal(centroidAt305s.longitude, 74.1300);

      // REGRESSION VERIFICATION 3: Leader selection ignores the expired car
      const sortedLeader = [...validAt305s].sort((a, b) => (b.speed_kmh || 0) - (a.speed_kmh || 0));
      assert.equal(sortedLeader[0].user_id, 1);
    });

    it('should drop a vehicle immediately if it toggles Ghost Mode or has null coordinates', () => {
      const activeCar = {
        user_id: 1,
        name: 'Active Car',
        latitude: 15.3000,
        longitude: 74.1200,
        is_ghost_mode: false,
        recorded_at: baseTime.toISOString(),
      };

      const ghostCar = {
        user_id: 2,
        name: 'Private Car',
        latitude: 15.2800,
        longitude: 74.1100,
        is_ghost_mode: true,
        recorded_at: baseTime.toISOString(),
      };

      const nullCoordCar = {
        user_id: 3,
        name: 'No GPS Car',
        latitude: null,
        longitude: null,
        is_ghost_mode: false,
        recorded_at: baseTime.toISOString(),
      };

      const valid = getValidConvoyVehicles([activeCar, ghostCar, nullCoordCar], baseTime);
      assert.equal(valid.length, 1);
      assert.equal(valid[0].user_id, 1);
    });
  });
});

