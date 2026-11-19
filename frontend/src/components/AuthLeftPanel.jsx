import React, { useState, useEffect } from 'react';

const AuthLeftPanel = () => {
  // Live simulated coordinates to show real-time telemetry activity
  const [telemetry, setTelemetry] = useState({
    lat: '15.2993° N',
    lng: '74.1240° E',
    speed: 68,
    activeNodes: 3,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetry((prev) => ({
        ...prev,
        speed: Math.floor(62 + Math.random() * 12),
        lat: `15.${Math.floor(2950 + Math.random() * 100)}° N`,
        lng: `74.${Math.floor(1200 + Math.random() * 80)}° E`,
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="auth-live-panel">
      {/* Background coordinate dot matrix */}
      <div className="auth-grid-bg" />

      {/* SVG Animated Orbital Arcs & Nodes (No airplane) */}
      <svg className="auth-arcs-svg" viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#818cf8" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#c084fc" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Outer orbital route ring */}
        <circle cx="400" cy="400" r="320" stroke="rgba(56, 189, 248, 0.08)" strokeWidth="1.5" strokeDasharray="6 6" />
        <circle cx="400" cy="400" r="230" stroke="rgba(129, 140, 248, 0.12)" strokeWidth="1.5" />
        
        {/* Curved Route Arc */}
        <path
          d="M 120 500 C 260 260, 540 260, 680 500"
          stroke="url(#arcGrad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Waypoint Nodes along the route */}
        <g>
          {/* Node 1 */}
          <circle cx="120" cy="500" r="6" fill="#38bdf8" />
          <circle cx="120" cy="500" r="14" stroke="#38bdf8" strokeWidth="1" opacity="0.4">
            <animate attributeName="r" values="8;18;8" dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0;0.6" dur="3s" repeatCount="indefinite" />
          </circle>

          {/* Node 2 (Midpoint Waypoint) */}
          <circle cx="400" cy="320" r="7" fill="#818cf8" />
          <circle cx="400" cy="320" r="16" stroke="#818cf8" strokeWidth="1" opacity="0.4">
            <animate attributeName="r" values="8;22;8" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0;0.7" dur="2.4s" repeatCount="indefinite" />
          </circle>

          {/* Node 3 */}
          <circle cx="680" cy="500" r="6" fill="#c084fc" />
          <circle cx="680" cy="500" r="14" stroke="#c084fc" strokeWidth="1" opacity="0.4">
            <animate attributeName="r" values="8;18;8" dur="3.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0;0.6" dur="3.2s" repeatCount="indefinite" />
          </circle>
        </g>
      </svg>

      {/* Floating Live Telemetry Badge */}
      <div className="auth-live-badge">
        <span className="live-pulse-dot" />
        <span>LIVE TELEMETRY SYNC • {telemetry.activeNodes} NODES ONLINE</span>
      </div>

      {/* Center Pitch Content (No airplane, No brand name) */}
      <div className="auth-pitch-content">
        {/* Geometric Interconnected Route Waypoints Icon */}
        <svg className="auth-geometric-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="6" width="22" height="22" rx="6" fill="#38bdf8" fillOpacity="0.9" />
          <rect x="36" y="6" width="22" height="22" rx="6" fill="#818cf8" fillOpacity="0.8" />
          <rect x="6" y="36" width="22" height="22" rx="6" fill="#818cf8" fillOpacity="0.8" />
          <rect x="36" y="36" width="22" height="22" rx="6" fill="#c084fc" fillOpacity="0.9" />
          <path d="M17 28 V36 M47 28 V36 M28 17 H36 M28 47 H36" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
        </svg>

        <h1 className="auth-pitch-title">your trips. your plan.</h1>
        <p className="auth-pitch-desc">
          Plan trips collaboratively with interactive maps, budgets, and real-time sync.
        </p>

        {/* Live Telemetry Chips */}
        <div className="auth-telemetry-pill-row">
          <div className="telemetry-chip">
            <span>GPS:</span>
            <span className="telemetry-chip-val">{telemetry.lat}, {telemetry.lng}</span>
          </div>
          <div className="telemetry-chip">
            <span>Speed:</span>
            <span className="telemetry-chip-val">{telemetry.speed} km/h</span>
          </div>
          <div className="telemetry-chip">
            <span>State:</span>
            <span className="telemetry-chip-val" style={{ color: '#10b981' }}>Active Convoy</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLeftPanel;
