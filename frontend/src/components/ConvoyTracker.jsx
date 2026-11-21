import React, { useState, useEffect, useRef, useContext, useMemo } from 'react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { submitTelemetry, getConvoyLocations } from '../api/telemetry';
import {
  calculateHaversineDistance,
  DEFAULT_CONVOY_LAG_THRESHOLD_KM,
  calculateConvoyCentroid,
} from '../utils/geolocation';
import { generateConvoySimulationStep } from '../utils/convoySimulator';
import ConvoyMap from './ConvoyMap';
import '../styles/convoy.css';

const ConvoyTracker = ({ tripId, tripTitle, onTelemetryUpdate }) => {
  const { user } = useContext(AuthContext);

  // Convoy Members state: Map of user_id -> member location object
  const [members, setMembers] = useState([]);
  const [onlinePresences, setOnlinePresences] = useState(new Set());
  const [isConnected, setIsConnected] = useState(false);

  // Active broadcasting state
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [ghostMode, setGhostMode] = useState(false);
  const [simPhase, setSimPhase] = useState('auto'); // 'auto' | 'safe' | 'warning' | 'regroup'
  const [simStep, setSimStep] = useState(0);

  // Local current location state
  const [myLocation, setMyLocation] = useState({
    latitude: 15.2993,
    longitude: 74.1240,
    speed_kmh: 0,
    heading: 0,
  });

  const channelRef = useRef(null);
  const simTimerRef = useRef(null);
  const geoWatchRef = useRef(null);
  const simStepRef = useRef(0);
  const simPhaseRef = useRef('auto');
  const ghostModeRef = useRef(false);

  // Synchronize refs with state for timer interval closures
  useEffect(() => {
    ghostModeRef.current = ghostMode;
  }, [ghostMode]);

  useEffect(() => {
    simPhaseRef.current = simPhase;
  }, [simPhase]);

  // 1. Initial Load: Fetch latest convoy locations from backend
  const fetchLocations = async () => {
    try {
      const res = await getConvoyLocations(tripId);
      setMembers(res.data || []);
    } catch (err) {
      console.warn('Failed to fetch initial convoy locations:', err);
    }
  };

  // 2. Supabase Realtime Setup
  useEffect(() => {
    if (!tripId || !supabase) return;

    fetchLocations();

    // Create a dedicated Supabase Realtime Channel for this trip
    const channel = supabase.channel(`convoy:${tripId}`, {
      config: {
        presence: { key: user?.id ? String(user.id) : `anon-${Math.random()}` },
        broadcast: { self: true },
      },
    });

    channelRef.current = channel;

    // A. Listen for sub-second broadcast location pings from other vehicles
    channel.on('broadcast', { event: 'telemetry_ping' }, ({ payload }) => {
      if (!payload || !payload.user_id) return;

      setMembers((prev) => {
        const existingIdx = prev.findIndex((m) => m.user_id === payload.user_id);
        const updatedItem = {
          user_id: payload.user_id,
          name: payload.name || 'Convoy Member',
          latitude: payload.is_ghost_mode ? null : payload.latitude,
          longitude: payload.is_ghost_mode ? null : payload.longitude,
          speed_kmh: payload.speed_kmh || 0,
          heading: payload.heading || null,
          is_ghost_mode: Boolean(payload.is_ghost_mode),
          location_status: payload.is_ghost_mode ? 'hidden' : 'fresh',
          recorded_at: new Date().toISOString(),
        };

        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = { ...next[existingIdx], ...updatedItem };
          return next;
        } else {
          return [...prev, updatedItem];
        }
      });
    });

    // B. Listen for presence sync (who is currently connected to this convoy)
    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState();
      const onlineIds = new Set(Object.keys(presenceState).map(Number));
      setOnlinePresences(onlineIds);
    });

    // C. Subscribe to the channel and track presence
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setIsConnected(true);
        if (user?.id) {
          channel.track({
            user_id: user.id,
            name: user.name || 'Member',
            online_at: new Date().toISOString(),
          });
        }
      } else {
        setIsConnected(false);
      }
    });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (simTimerRef.current) clearInterval(simTimerRef.current);
      if (geoWatchRef.current && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchRef.current);
      }
    };
  }, [tripId, user]);

  // 3. Helper to broadcast a telemetry ping (to FastAPI + Supabase Realtime)
  const emitTelemetryPing = async (pingData) => {
    // A. Send sub-second Realtime broadcast to all convoy members
    if (channelRef.current && isConnected) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'telemetry_ping',
        payload: {
          user_id: user?.id,
          name: user?.name,
          ...pingData,
        },
      });
    }

    // B. Persist into backend database
    try {
      await submitTelemetry(tripId, pingData);
    } catch (err) {
      console.warn('Backend telemetry persistence failed (offline/mock):', err);
    }
  };

  // 4. Start / Stop Real Device GPS Broadcasting
  const toggleDeviceGPS = () => {
    if (isBroadcasting) {
      if (geoWatchRef.current && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchRef.current);
      }
      setIsBroadcasting(false);
    } else {
      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
      }
      if (isSimulating) stopSimulation();

      setIsBroadcasting(true);
      geoWatchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const pingData = {
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
            speed_kmh: pos.coords.speed ? Number((pos.coords.speed * 3.6).toFixed(1)) : 45.0,
            heading: pos.coords.heading ? Number(pos.coords.heading.toFixed(1)) : 90.0,
            is_ghost_mode: ghostMode,
          };
          setMyLocation(pingData);
          emitTelemetryPing(pingData);
        },
        (err) => {
          console.error('GPS Watch error:', err);
          setIsBroadcasting(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  };

  // 5. 4-Car Convoy Highway Simulation (Sprint 2 Issue #3)
  const executeSimulationStep = (stepNumber, forcedPhaseVal) => {
    const activePhase = forcedPhaseVal !== undefined
      ? forcedPhaseVal
      : (simPhaseRef.current === 'auto' ? null : simPhaseRef.current);

    const stepResult = generateConvoySimulationStep(stepNumber, {
      forcedPhase: activePhase,
      ghostMode: ghostModeRef.current,
    });

    setMembers(stepResult.vehicles);
    if (stepResult.leadVehicle && stepResult.leadVehicle.latitude != null) {
      setMyLocation({
        latitude: stepResult.leadVehicle.latitude,
        longitude: stepResult.leadVehicle.longitude,
        speed_kmh: stepResult.leadVehicle.speed_kmh,
        heading: stepResult.leadVehicle.heading,
      });
    }

    // Broadcast over Supabase Realtime if connected
    if (channelRef.current && isConnected) {
      stepResult.vehicles.forEach((veh) => {
        channelRef.current.send({
          type: 'broadcast',
          event: 'telemetry_ping',
          payload: {
            user_id: veh.user_id,
            name: veh.name,
            latitude: veh.latitude,
            longitude: veh.longitude,
            speed_kmh: veh.speed_kmh,
            heading: veh.heading,
            is_ghost_mode: veh.is_ghost_mode,
            is_simulated: true,
          },
        });
      });
    }

    // Dispatch custom DOM event for Jay's Leaflet map integration
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('convoy:telemetry_update', {
          detail: {
            tripId,
            vehicles: stepResult.vehicles,
            leadVehicle: stepResult.leadVehicle,
            laggingVehicles: stepResult.laggingVehicles,
            stepIndex: stepResult.stepIndex,
          },
        })
      );
    }

    // Direct callback prop support for Jay's Leaflet map component
    if (typeof onTelemetryUpdate === 'function') {
      onTelemetryUpdate(stepResult.vehicles);
    }

    return stepResult;
  };

  const toggleSimulation = () => {
    if (isSimulating) {
      stopSimulation();
    } else {
      if (isBroadcasting) toggleDeviceGPS();

      setIsSimulating(true);
      simStepRef.current = 0;
      setSimStep(0);

      // Execute step 0 immediately
      executeSimulationStep(0);

      simTimerRef.current = setInterval(() => {
        simStepRef.current += 1;
        setSimStep(simStepRef.current);
        executeSimulationStep(simStepRef.current);
      }, 3000);
    }
  };

  const stopSimulation = () => {
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    setIsSimulating(false);
    setSimPhase('auto');
    simPhaseRef.current = 'auto';
    // Restore real trip convoy locations
    fetchLocations();
  };

  const handlePhaseChange = (phase) => {
    setSimPhase(phase);
    simPhaseRef.current = phase;
    if (isSimulating) {
      executeSimulationStep(simStepRef.current, phase === 'auto' ? null : phase);
    }
  };

  // 6. Centroid & Lag Calculations across visible vehicles
  const { leader, validVehicles, laggingMembers, centroid } = useMemo(() => {
    const valid = members.filter((m) => m.latitude != null && m.longitude != null && !m.is_ghost_mode);

    if (valid.length === 0) {
      return { leader: null, validVehicles: [], laggingMembers: [], centroid: null };
    }

    // Lead vehicle is designated (sim-car-1 / is_lead) or the one with highest speed
    const designatedLead = valid.find(
      (m) => m.is_lead || m.user_id === 'sim-car-1' || m.name?.includes('Lead')
    );
    const sorted = [...valid].sort((a, b) => (b.speed_kmh || 0) - (a.speed_kmh || 0));
    const lead = designatedLead || sorted[0];

    // Compute lag for each vehicle relative to the leader
    const lagging = [];
    valid.forEach((veh) => {
      if (veh.user_id !== lead.user_id) {
        const distKm = calculateHaversineDistance(
          { latitude: lead.latitude, longitude: lead.longitude },
          { latitude: veh.latitude, longitude: veh.longitude }
        );
        veh.distance_to_leader_km = Number(distKm.toFixed(2));
        if (distKm > DEFAULT_CONVOY_LAG_THRESHOLD_KM) {
          lagging.push({ ...veh, lag_distance_km: Number(distKm.toFixed(2)) });
        }
      } else {
        veh.distance_to_leader_km = 0;
      }
    });

    const cent = calculateConvoyCentroid(valid);
    return { leader: lead, validVehicles: valid, laggingMembers: lagging, centroid: cent };
  }, [members]);

  return (
    <div className="convoy-tracker-container">
      {/* Header Bar */}
      <div className="convoy-header">
        <div className="convoy-title-group">
          <h2>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 19 21 12 17 5 21 12 2" />
            </svg>
            Live Convoy Radar
          </h2>
          <p className="convoy-sub">
            Real-time GPS coordination & lag safety for {tripTitle || 'this trip'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className={`convoy-status-pill ${isConnected ? '' : 'offline'}`}>
            <span className={isConnected ? 'pulse-dot-green' : ''} />
            {isConnected ? 'SUPABASE REALTIME ACTIVE' : 'CONNECTING REALTIME...'}
          </span>
          <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
            {onlinePresences.size} in Convoy
          </span>
        </div>
      </div>

      {/* Convoy Lag Alert Banner (Appears if someone falls > 2.0 km behind) */}
      {laggingMembers.length > 0 && (
        <div className="convoy-lag-alert-banner" data-testid="convoy-lag-alert-banner">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <div className="convoy-lag-alert-title">
              CONVOY SEPARATION WARNING ({DEFAULT_CONVOY_LAG_THRESHOLD_KM} km threshold exceeded)
            </div>
            <div className="convoy-lag-alert-desc">
              {laggingMembers.map((m) => `${m.name} is ${m.lag_distance_km} km behind the lead vehicle`).join('; ')}.
              Please consider slowing down to regroup.
            </div>
          </div>
        </div>
      )}

      {/* Control Actions Bar */}
      <div className="convoy-controls-grid">
        {/* Device GPS Toggle */}
        <div className="convoy-control-card">
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Device GPS</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Broadcast your real location</div>
          </div>
          <button
            type="button"
            onClick={toggleDeviceGPS}
            className={`convoy-btn ${isBroadcasting ? 'convoy-btn-danger' : 'convoy-btn-primary'}`}
          >
            {isBroadcasting ? 'Stop GPS' : 'Share GPS'}
          </button>
        </div>

        {/* Demo Drive Simulator Toggle */}
        <div className="convoy-control-card">
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Highway Simulation</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              {isSimulating ? `Active (Step ${(simStep % 30) + 1}/30)` : '4-Vehicle NH66 Drive'}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleSimulation}
            className={`convoy-btn ${isSimulating ? 'convoy-btn-danger' : 'convoy-btn-secondary'}`}
          >
            {isSimulating ? 'Stop Sim' : 'Simulate Drive'}
          </button>
        </div>

        {/* Ghost Mode Privacy Toggle */}
        <div className="convoy-control-card">
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Ghost Mode</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Hide exact coordinates</div>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={ghostMode}
              onChange={(e) => {
                const next = e.target.checked;
                setGhostMode(next);
                ghostModeRef.current = next;
                if (isSimulating) {
                  executeSimulationStep(simStepRef.current);
                } else if (isBroadcasting) {
                  emitTelemetryPing({ ...myLocation, is_ghost_mode: next });
                }
              }}
              style={{ cursor: 'pointer', width: '18px', height: '18px' }}
            />
          </label>
        </div>
      </div>

      {/* Simulation Scenario Controller Bar */}
      {isSimulating && (
        <div className="convoy-sim-scenario-bar" data-testid="sim-scenario-bar">
          <div className="convoy-sim-scenario-info">
            <span className="sim-badge">4-CAR SIMULATOR</span>
            <span className="sim-route-text">Route: NH66 Goa • Step {(simStep % 30) + 1} of 30</span>
          </div>
          <div className="convoy-sim-scenario-buttons">
            <button
              type="button"
              className={`sim-phase-btn ${simPhase === 'auto' ? 'active' : ''}`}
              onClick={() => handlePhaseChange('auto')}
            >
              Auto Highway Loop
            </button>
            <button
              type="button"
              className={`sim-phase-btn ${simPhase === 'safe' ? 'active' : ''}`}
              onClick={() => handlePhaseChange('safe')}
            >
              Safe Pack (&lt;0.6 km)
            </button>
            <button
              type="button"
              className={`sim-phase-btn ${simPhase === 'warning' ? 'active' : ''}`}
              onClick={() => handlePhaseChange('warning')}
            >
              Trigger Lag (&gt;2.0 km)
            </button>
            <button
              type="button"
              className={`sim-phase-btn ${simPhase === 'regroup' ? 'active' : ''}`}
              onClick={() => handlePhaseChange('regroup')}
            >
              Regroup (&lt;1.5 km)
            </button>
          </div>
        </div>
      )}

      {/* Main Body: Live Map + Convoy Member Roster */}
      <div className="convoy-body-grid">
        {/* Live Convoy Map (Leaflet + OpenStreetMap), driven by the same `members` state */}
        <div className="radar-display-panel convoy-map-panel">
          <ConvoyMap members={members} leaderId={leader?.user_id} />
        </div>

        {/* Convoy Roster & Metrics Feed */}
        <div className="convoy-roster-panel">
          <div className="convoy-roster-header">
            <span>Enrolled Vehicles ({members.length})</span>
            <span style={{ fontSize: '0.8rem', color: '#38bdf8' }}>
              Lead Speed: {leader?.speed_kmh || 0} km/h
            </span>
          </div>

          <div style={{ overflowY: 'auto', maxHeight: '310px' }}>
            {members.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94a3b8', fontSize: '0.88rem' }}>
                No active telemetry pings yet. Click <strong>"Simulate Drive"</strong> or <strong>"Share GPS"</strong> to start transmitting.
              </div>
            ) : (
              members.map((member) => {
                const isLeader = leader && leader.user_id === member.user_id;
                const isLagging = member.distance_to_leader_km > DEFAULT_CONVOY_LAG_THRESHOLD_KM;
                const isOnline = onlinePresences.has(member.user_id);

                return (
                  <div
                    key={member.user_id}
                    className={`convoy-member-card ${isLeader ? 'is-leader' : ''} ${isLagging ? 'is-lagging' : ''}`}
                  >
                    <div className="member-top-row">
                      <div className="member-name-tag">
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: isOnline || isSimulating ? '#10b981' : '#64748b',
                            display: 'inline-block',
                          }}
                        />
                        {member.name}
                        {isLeader && <span style={{ color: '#38bdf8', fontSize: '0.75rem' }}>(Lead Vehicle)</span>}
                        {member.is_ghost_mode && <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>[GHOST]</span>}
                      </div>
                      <div className="member-speed-badge">
                        {member.speed_kmh != null ? `${member.speed_kmh} km/h` : '0 km/h'}
                      </div>
                    </div>

                    <div className="member-metrics-row">
                      <div>
                        GPS:{' '}
                        <span className="metric-highlight">
                          {member.latitude != null && member.longitude != null
                            ? `${member.latitude.toFixed(4)}, ${member.longitude.toFixed(4)}`
                            : 'Masked / Hidden'}
                        </span>
                      </div>
                      <div>
                        Lag:{' '}
                        <span
                          className="metric-highlight"
                          style={{ color: isLagging ? '#ef4444' : '#f1f5f9' }}
                        >
                          {isLeader ? 'Lead (0 km)' : `${member.distance_to_leader_km || 0} km`}
                        </span>
                      </div>
                      {member.heading != null && (
                        <div>
                          Heading: <span className="metric-highlight">{member.heading}°</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConvoyTracker;