import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getMemberCoordinates,
  getMemberId,
  classifyMember,
  buildMapEntries,
  getNextStaleAt,
  DEFAULT_STALE_AFTER_MS,
  MARKER_STATUS,
} from './convoyMapUtils.js';
import { generateConvoySimulationStep } from './convoySimulator.js';

describe('ConvoyMap helpers', () => {
  describe('getMemberCoordinates', () => {
    it('reads latitude/longitude without swapping order', () => {
      assert.deepEqual(getMemberCoordinates({ latitude: 15.3, longitude: 74.1 }), {
        latitude: 15.3,
        longitude: 74.1,
      });
    });

    it('reads lat/lng, lat/lon, [lat, lng] arrays and nested location', () => {
      assert.deepEqual(getMemberCoordinates({ lat: 15.3, lng: 74.1 }), { latitude: 15.3, longitude: 74.1 });
      assert.deepEqual(getMemberCoordinates({ lat: 15.3, lon: 74.1 }), { latitude: 15.3, longitude: 74.1 });
      assert.deepEqual(getMemberCoordinates({ coordinates: [15.3, 74.1] }), { latitude: 15.3, longitude: 74.1 });
      assert.deepEqual(getMemberCoordinates({ location: { latitude: 15.3, longitude: 74.1 } }), {
        latitude: 15.3,
        longitude: 74.1,
      });
    });

    it('accepts numeric strings', () => {
      assert.deepEqual(getMemberCoordinates({ latitude: '15.3', longitude: '74.1' }), {
        latitude: 15.3,
        longitude: 74.1,
      });
    });

    it('never turns null / blank / undefined into 0,0', () => {
      assert.equal(getMemberCoordinates({ latitude: null, longitude: null }), null);
      assert.equal(getMemberCoordinates({ latitude: '', longitude: '' }), null);
      assert.equal(getMemberCoordinates({ latitude: null, longitude: 74.1 }), null);
      assert.equal(getMemberCoordinates({ latitude: undefined, longitude: undefined }), null);
      assert.equal(getMemberCoordinates({}), null);
      assert.equal(getMemberCoordinates(null), null);
    });

    it('rejects NaN, out-of-range values and the 0,0 placeholder', () => {
      assert.equal(getMemberCoordinates({ latitude: NaN, longitude: 74 }), null);
      assert.equal(getMemberCoordinates({ latitude: 'abc', longitude: 74 }), null);
      assert.equal(getMemberCoordinates({ latitude: 91, longitude: 74 }), null);
      assert.equal(getMemberCoordinates({ latitude: 15, longitude: 181 }), null);
      assert.equal(getMemberCoordinates({ latitude: 0, longitude: 0 }), null);
    });

    it('treats null latitude/longitude as authoritative (does not fall back to other fields)', () => {
      assert.equal(getMemberCoordinates({ latitude: null, longitude: null, lat: 15.3, lng: 74.1 }), null);
    });
  });

  describe('classifyMember', () => {
    const now = Date.parse('2026-11-21T10:00:00Z');
    const iso = (offsetMs) => new Date(now - offsetMs).toISOString();

    it('is fresh for a recent ping and stale for an old one', () => {
      assert.equal(classifyMember({ recorded_at: iso(5_000) }, { hasCoordinates: true, now }).status, 'fresh');
      assert.equal(
        classifyMember({ recorded_at: iso(DEFAULT_STALE_AFTER_MS + 1) }, { hasCoordinates: true, now }).status,
        'stale'
      );
    });

    it('honours a custom stale threshold', () => {
      const m = { recorded_at: iso(20_000) };
      assert.equal(classifyMember(m, { hasCoordinates: true, now, staleAfterMs: 10_000 }).status, 'stale');
      assert.equal(classifyMember(m, { hasCoordinates: true, now, staleAfterMs: 30_000 }).status, 'fresh');
    });

    it('is ghost for is_ghost_mode / ghost_mode / hidden status, even with coordinates', () => {
      assert.equal(classifyMember({ is_ghost_mode: true }, { hasCoordinates: true, now }).status, 'ghost');
      assert.equal(classifyMember({ ghost_mode: true }, { hasCoordinates: true, now }).status, 'ghost');
      assert.equal(classifyMember({ location_status: 'hidden' }, { hasCoordinates: false, now }).status, 'ghost');
    });

    it('is unavailable without coordinates, or when freshness cannot be established', () => {
      assert.equal(classifyMember({ recorded_at: iso(0) }, { hasCoordinates: false, now }).status, 'unavailable');
      assert.equal(classifyMember({}, { hasCoordinates: true, now }).status, 'unavailable');
      assert.equal(
        classifyMember({ location_status: 'unavailable', recorded_at: iso(0) }, { hasCoordinates: true, now }).status,
        'unavailable'
      );
    });

    it('respects server-reported stale and trusts server-reported fresh when there is no timestamp', () => {
      assert.equal(
        classifyMember({ location_status: 'stale', recorded_at: iso(0) }, { hasCoordinates: true, now }).status,
        'stale'
      );
      assert.equal(classifyMember({ location_status: 'fresh' }, { hasCoordinates: true, now }).status, 'fresh');
    });

    it('ignores unparseable timestamps', () => {
      assert.equal(classifyMember({ recorded_at: 'garbage' }, { hasCoordinates: true, now }).status, 'unavailable');
    });
  });

  describe('buildMapEntries with the simulator stream', () => {
    it('plots all four simulated cars as fresh and flags the lead', () => {
      const { vehicles } = generateConvoySimulationStep(3);
      const { markers, unplotted, counts } = buildMapEntries(vehicles, { leaderId: 'sim-car-1' });
      assert.equal(markers.length, 4);
      assert.equal(unplotted.length, 0);
      assert.deepEqual(counts, { fresh: 4, stale: 0, unavailable: 0, ghost: 0 });
      assert.deepEqual(markers.filter((m) => m.isLead).map((m) => m.id), ['sim-car-1']);
      markers.forEach((m) => {
        const v = vehicles.find((x) => x.user_id === m.id);
        assert.deepEqual(m.position, [v.latitude, v.longitude]); // [lat, lng] order
      });
    });

    it('falls back to member.is_lead when no leaderId is given', () => {
      const { vehicles } = generateConvoySimulationStep(0);
      const { markers } = buildMapEntries(vehicles);
      assert.deepEqual(markers.filter((m) => m.isLead).map((m) => m.id), ['sim-car-1']);
    });

    it('does not invent a position for a Ghost vehicle that has never been seen', () => {
      const { vehicles } = generateConvoySimulationStep(0, { ghostMode: true });
      const { markers, unplotted, counts } = buildMapEntries(vehicles, { lastKnown: new Map() });
      assert.equal(markers.length, 3);
      assert.equal(unplotted.length, 1);
      assert.equal(unplotted[0].id, 'sim-car-3');
      assert.equal(unplotted[0].status, 'ghost');
      assert.equal(counts.ghost, 1);
    });

    it('shows a Ghost vehicle at its flagged last-known position when one was seen earlier', () => {
      const cache = new Map();
      const live = generateConvoySimulationStep(4);
      buildMapEntries(live.vehicles, { lastKnown: cache });
      const car3Live = live.vehicles[2];

      const ghost = generateConvoySimulationStep(5, { ghostMode: true });
      const { markers } = buildMapEntries(ghost.vehicles, { lastKnown: cache });
      const car3 = markers.find((m) => m.id === 'sim-car-3');
      assert.ok(car3, 'ghost car should still be plotted from cache');
      assert.equal(car3.status, 'ghost');
      assert.equal(car3.isLastKnown, true);
      assert.deepEqual(car3.position, [car3Live.latitude, car3Live.longitude]);
      // live cars keep moving
      assert.ok(markers.find((m) => m.id === 'sim-car-1').position[0] > live.leadVehicle.latitude);
    });

    it('prunes cache entries for vehicles that left the convoy', () => {
      const cache = new Map();
      buildMapEntries(generateConvoySimulationStep(1).vehicles, { lastKnown: cache });
      assert.equal(cache.size, 4);
      buildMapEntries([], { lastKnown: cache });
      assert.equal(cache.size, 0);
    });

    it('marks vehicles stale as time passes without new pings', () => {
      const { vehicles } = generateConvoySimulationStep(2);
      const later = Date.now() + DEFAULT_STALE_AFTER_MS + 5_000;
      const { markers, counts } = buildMapEntries(vehicles, { now: later });
      assert.ok(markers.every((m) => m.status === MARKER_STATUS.STALE));
      assert.equal(counts.stale, 4);
    });
  });

  describe('robustness', () => {
    it('skips invalid coordinates and non-object entries without throwing', () => {
      const members = [
        null,
        'oops',
        { user_id: 'a', name: 'A', latitude: null, longitude: null, location_status: 'fresh' },
        { user_id: 'b', name: 'B', latitude: 0, longitude: 0, location_status: 'fresh' },
        { user_id: 'c', name: 'C', latitude: 200, longitude: 10, location_status: 'fresh' },
        { user_id: 'd', name: 'D', latitude: 15.3, longitude: 74.1, location_status: 'fresh' },
      ];
      const { markers, unplotted } = buildMapEntries(members);
      assert.deepEqual(markers.map((m) => m.id), ['d']);
      assert.deepEqual(unplotted.map((m) => m.id).sort(), ['a', 'b', 'c']);
    });

    it('handles a non-array members value', () => {
      assert.deepEqual(buildMapEntries(undefined).markers, []);
      assert.deepEqual(buildMapEntries(null).markers, []);
    });

    it('de-duplicates repeated ids (last one wins)', () => {
      const members = [
        { user_id: 'a', name: 'old', latitude: 15.3, longitude: 74.1, location_status: 'fresh' },
        { user_id: 'a', name: 'new', latitude: 15.4, longitude: 74.2, location_status: 'fresh' },
      ];
      const { markers } = buildMapEntries(members);
      assert.equal(markers.length, 1);
      assert.equal(markers[0].name, 'new');
    });

    it('getMemberId prefers user_id and stringifies', () => {
      assert.equal(getMemberId({ user_id: 7, id: 9 }), '7');
      assert.equal(getMemberId({ id: 9 }), '9');
      assert.equal(getMemberId({}), null);
    });
  });

  describe('getNextStaleAt', () => {
    it('returns the earliest expiry among fresh markers, or null', () => {
      assert.equal(getNextStaleAt([], 1000), null);
      const markers = [
        { status: 'fresh', recordedAtMs: 5_000 },
        { status: 'fresh', recordedAtMs: 2_000 },
        { status: 'stale', recordedAtMs: 100 },
        { status: 'fresh', recordedAtMs: null },
      ];
      assert.equal(getNextStaleAt(markers, 1000), 3_000);
    });
  });
});
