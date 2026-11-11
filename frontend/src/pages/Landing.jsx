import React, { useContext, useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/landing.css';

const Landing = () => {
  const { isAuthenticated, loading } = useContext(AuthContext);

  // Theme state: dark / light mode (saved in localStorage)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('convoy_theme') || 'dark';
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('convoy_theme', nextTheme);
  };

  // Interactive Live Simulator State
  const [convoySpeed, setConvoySpeed] = useState(68);
  const [lagDistance, setLagDistance] = useState(2.4);
  const [ghostModeActive, setGhostModeActive] = useState(false);
  const [isAutoSimulating, setIsAutoSimulating] = useState(true);
  const [activeTab, setActiveTab] = useState('radar');

  // Interactive Expense Calculator State
  const [expenseTotal, setExpenseTotal] = useState(4800);
  const [numVehicles, setNumVehicles] = useState(4);

  // Interactive FAQ State
  const [openFaq, setOpenFaq] = useState(null);

  // Auto-drive simulation effect (simulates live telemetry fluctuations)
  useEffect(() => {
    if (!isAutoSimulating) return;

    const interval = setInterval(() => {
      setConvoySpeed((prev) => {
        const delta = (Math.random() - 0.48) * 3;
        return Math.min(105, Math.max(35, Math.round(prev + delta)));
      });

      setLagDistance((prev) => {
        const delta = (Math.random() - 0.49) * 0.12;
        return Number(Math.min(4.5, Math.max(0.5, prev + delta)).toFixed(1));
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [isAutoSimulating]);

  // Redirect to home if user is already authenticated
  if (!loading && isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  // Calculate dynamic polling cadence based on speed
  const getPollingInfo = (speed) => {
    if (speed > 40) return { interval: '5 seconds', label: 'FAST CADENCE (HIGHWAY)', color: '#38bdf8' };
    if (speed >= 10) return { interval: '15 seconds', label: 'MODERATE CADENCE', color: '#10b981' };
    return { interval: '30 seconds', label: 'POWER SAVER CADENCE', color: '#f59e0b' };
  };

  const pollingInfo = getPollingInfo(convoySpeed);
  const isLagging = lagDistance > 2.0;

  // Road stripe animation speed tied to convoySpeed
  const roadAnimationDuration = convoySpeed > 0 ? Math.max(0.2, (60 / convoySpeed)).toFixed(2) + 's' : '0s';

  return (
    <div className="landing-wrapper" data-theme={theme}>
      {/* Live Telemetry Ticker Ribbon */}
      <div className="telemetry-ticker">
        <div className="ticker-track">
          <span className="ticker-item"><span className="ticker-dot green"></span> SATELLITES: 14 GPS/GLONASS LOCKED</span>
          <span className="ticker-item"><span className="ticker-dot blue"></span> LATENCY: 38ms</span>
          <span className="ticker-item"><span className="ticker-dot green"></span> REFRESH CADENCE: {pollingInfo.interval.toUpperCase()}</span>
          <span className="ticker-item"><span className="ticker-dot purple"></span> GHOST SHIELD: PRIVACY-ACTIVE</span>
          <span className="ticker-item"><span className="ticker-dot yellow"></span> LAG RADAR: 2.0 KM SAFETY LIMIT</span>
          <span className="ticker-item"><span className="ticker-dot green"></span> SATELLITES: 14 GPS/GLONASS LOCKED</span>
          <span className="ticker-item"><span className="ticker-dot blue"></span> LATENCY: 38ms</span>
          <span className="ticker-item"><span className="ticker-dot green"></span> REFRESH CADENCE: {pollingInfo.interval.toUpperCase()}</span>
        </div>
      </div>

      {/* Sticky Navigation */}
      <header className="landing-nav">
        <div className="landing-nav-container">
          <Link to="/" className="landing-brand">
            <div className="landing-brand-icon">🚗</div>
            <span>ConvoySync</span>
          </Link>

          <nav className="landing-nav-links">
            <a href="#simulator" className="landing-nav-link">Live Radar</a>
            <a href="#features" className="landing-nav-link">Features</a>
            <a href="#how-it-works" className="landing-nav-link">How It Works</a>
            <a href="#faq" className="landing-nav-link">FAQ</a>
          </nav>

          <div className="landing-nav-actions">
            <button
              onClick={toggleTheme}
              className="theme-toggle-btn"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
            <Link to="/login" className="btn btn-secondary btn-sm">Log In</Link>
            <Link to="/signup" className="btn btn-primary btn-sm">Get Started</Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-hero-container">
          <div className="hero-pill">
            <span className="hero-pill-dot"></span>
            <span>Live Telemetry Radar • 2.0 km Lag Warning • Real-Time Expense Split</span>
          </div>

          <h1 className="hero-title">
            Travel Together. <br />
            <span className="hero-title-gradient">Never Lose the Convoy.</span>
          </h1>

          <p className="hero-subtitle">
            The high-precision coordination system engineered for multi-vehicle road trips. Monitor convoy separation on a live animated radar,
            automate battery-adaptive GPS polling, and split expenses effortlessly.
          </p>

          <div className="hero-cta-group">
            <Link to="/signup" className="btn-cta-primary pulse-btn">
              <span>Start a Trip Free</span>
              <span>&rarr;</span>
            </Link>
            <Link to="/login" className="btn-cta-secondary">
              <span>Join with Trip Code</span>
            </Link>
          </div>
        </div>

        {/* Live Interactive Simulator */}
        <div id="simulator" className="simulator-section-wrapper">
          <div className="simulator-card">
            <div className="simulator-header">
              <div className="sim-header-left">
                <span className="pulse-indicator"></span>
                <strong>Live Convoy Radar & Telemetry Cockpit</strong>
              </div>
              <div className="sim-header-right">
                <button
                  onClick={() => setIsAutoSimulating(!isAutoSimulating)}
                  className={`sim-mode-toggle ${isAutoSimulating ? 'active' : ''}`}
                >
                  {isAutoSimulating ? '⏹ Pause Auto-Cruise' : '▶ Play Auto-Cruise'}
                </button>
              </div>
            </div>

            {/* Interactive Control Dashboard */}
            <div className="sim-controls-panel">
              <div className="sim-control-group">
                <label className="sim-control-label">
                  <span>Convoy Speed:</span>
                  <strong className="sim-value-highlight">{convoySpeed} km/h</strong>
                </label>
                <input
                  type="range"
                  min="0"
                  max="120"
                  value={convoySpeed}
                  onChange={(e) => {
                    setIsAutoSimulating(false);
                    setConvoySpeed(Number(e.target.value));
                  }}
                  className="sim-slider"
                />
                <div className="sim-slider-ticks">
                  <span>0 (Stopped)</span>
                  <span>10 (15s)</span>
                  <span>40 (5s)</span>
                  <span>120 km/h</span>
                </div>
              </div>

              <div className="sim-control-group">
                <label className="sim-control-label">
                  <span>Vehicle 3 Separation:</span>
                  <strong className="sim-value-highlight" style={{ color: isLagging ? '#ef4444' : '#10b981' }}>
                    {lagDistance.toFixed(1)} km {isLagging ? '(⚠️ Lag Alert Triggered)' : '(In Convoy)'}
                  </strong>
                </label>
                <input
                  type="range"
                  min="0.2"
                  max="5.0"
                  step="0.1"
                  value={lagDistance}
                  onChange={(e) => {
                    setIsAutoSimulating(false);
                    setLagDistance(Number(e.target.value));
                  }}
                  className="sim-slider"
                />
                <div className="sim-slider-ticks">
                  <span>0.2 km</span>
                  <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>2.0 km Limit</span>
                  <span>5.0 km</span>
                </div>
              </div>

              <div className="sim-stat-badge-box">
                <div className="sim-stat-mini-label">Adaptive Polling</div>
                <div className="sim-stat-mini-val" style={{ color: pollingInfo.color }}>
                  {pollingInfo.interval}
                </div>
                <div className="sim-stat-mini-sub">{pollingInfo.label}</div>
              </div>
            </div>

            {/* Split Screen: Circular 360° Radar Scanner + Animated Highway Road */}
            <div className="sim-cockpit-split">
              {/* Circular Sweep Radar Display */}
              <div className="radar-scanner-box">
                <div className="radar-scope">
                  {/* Rotating Radar Sweep Beam */}
                  <div className="radar-beam"></div>

                  {/* Concentric Range Rings */}
                  <div className="radar-ring ring-1"><span className="ring-label">500m</span></div>
                  <div className="radar-ring ring-2"><span className="ring-label">1.0km</span></div>
                  <div className="radar-ring ring-threshold"><span className="ring-label alert">2.0km Limit</span></div>

                  {/* Crosshairs */}
                  <div className="radar-crosshair-h"></div>
                  <div className="radar-crosshair-v"></div>

                  {/* Radar Vehicle Blips */}
                  <div className="radar-blip blip-lead" title="Lead Vehicle" style={{ top: '35%', left: '55%' }}>
                    <span className="blip-ping"></span>
                    <span className="blip-dot"></span>
                    <span className="blip-tag">LEAD</span>
                  </div>

                  <div className="radar-blip blip-v2" title="Vehicle 2" style={{ top: '48%', left: '46%' }}>
                    <span className="blip-ping"></span>
                    <span className="blip-dot"></span>
                    <span className="blip-tag">V2</span>
                  </div>

                  {/* Vehicle 3 Blip (Moves based on lagDistance) */}
                  <div
                    className={`radar-blip ${isLagging ? 'blip-lagging' : 'blip-v3'}`}
                    title="Vehicle 3"
                    style={{
                      top: `${Math.min(88, 52 + lagDistance * 7)}%`,
                      left: `${Math.max(12, 44 - lagDistance * 6)}%`
                    }}
                  >
                    <span className="blip-ping"></span>
                    <span className="blip-dot"></span>
                    <span className="blip-tag">V3</span>
                  </div>

                  {/* Vehicle 4 (Ghost Mode) */}
                  {!ghostModeActive && (
                    <div className="radar-blip blip-v4" title="Vehicle 4" style={{ top: '62%', left: '60%' }}>
                      <span className="blip-ping"></span>
                      <span className="blip-dot"></span>
                      <span className="blip-tag">V4</span>
                    </div>
                  )}

                  {ghostModeActive && (
                    <div className="radar-ghost-indicator">
                      👻 V4 GHOST SHIELD ACTIVE
                    </div>
                  )}
                </div>
                <div className="radar-subtext">360° SPATIAL CENTROID SWEEP</div>
              </div>

              {/* Animated Infinite Highway Track */}
              <div className="highway-radar-track">
                <div className="road-info-bar">
                  <span>HIGHWAY NH-48 EXPRESSWAY • LANE 1</span>
                  <span style={{ color: '#38bdf8' }}>CRUISING @ {convoySpeed} KM/H</span>
                </div>

                <div className="radar-road">
                  {/* Scrolling Road Stripes (Speed-Linked Animation) */}
                  <div
                    className="road-dashed-center animated-stripes"
                    style={{
                      animationDuration: roadAnimationDuration,
                      animationPlayState: convoySpeed === 0 ? 'paused' : 'running'
                    }}
                  ></div>

                  {/* Lead Vehicle */}
                  <div className="radar-vehicle lead-vehicle" style={{ left: '88%' }}>
                    <div className="vehicle-pulse-glow glow-blue"></div>
                    <div className="vehicle-symbol car-bobbing">🚗</div>
                    <div className="vehicle-tooltip">
                      <div className="tt-name">Lead Vehicle</div>
                      <div className="tt-speed">{convoySpeed} km/h • 0.0 km</div>
                    </div>
                  </div>

                  {/* Vehicle 2 */}
                  <div className="radar-vehicle v2-vehicle" style={{ left: '66%' }}>
                    <div className="vehicle-pulse-glow glow-green"></div>
                    <div className="vehicle-symbol car-bobbing" style={{ animationDelay: '0.2s' }}>🚙</div>
                    <div className="vehicle-tooltip">
                      <div className="tt-name">Vehicle 2</div>
                      <div className="tt-speed">{Math.max(0, convoySpeed - 3)} km/h • 0.6 km</div>
                    </div>
                  </div>

                  {/* Vehicle 3 (Position dynamically moves with lag distance slider) */}
                  <div
                    className="radar-vehicle v3-vehicle"
                    style={{
                      left: `${Math.max(8, 66 - lagDistance * 13)}%`,
                      transition: isAutoSimulating ? 'left 1.2s ease-in-out' : 'left 0.15s ease-out'
                    }}
                  >
                    <div className={`vehicle-pulse-glow ${isLagging ? 'glow-red' : 'glow-green'}`}></div>
                    <div className="vehicle-symbol car-bobbing" style={{ animationDelay: '0.4s' }}>🚐</div>
                    <div className="vehicle-tooltip">
                      <div className="tt-name">Vehicle 3</div>
                      <div className="tt-speed" style={{ color: isLagging ? '#f87171' : '#34d399' }}>
                        {Math.max(0, convoySpeed - 12)} km/h • {lagDistance.toFixed(1)} km
                      </div>
                    </div>
                  </div>

                  {/* Vehicle 4 (Ghost Mode Toggle) */}
                  <div className="radar-vehicle v4-vehicle" style={{ left: '38%' }}>
                    <div className={`vehicle-pulse-glow ${ghostModeActive ? 'glow-purple' : 'glow-green'}`}></div>
                    <div className="vehicle-symbol car-bobbing" style={{ animationDelay: '0.6s' }}>
                      {ghostModeActive ? '👻' : '🛻'}
                    </div>
                    <div className="vehicle-tooltip">
                      <div className="tt-name">Vehicle 4</div>
                      <div className="tt-speed" style={{ color: ghostModeActive ? '#c084fc' : '#94a3b8' }}>
                        {ghostModeActive ? 'Ghost Shield ON' : `${convoySpeed} km/h • 1.4 km`}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Vehicle Status Table */}
            <div className="sim-table-wrap">
              <table className="sim-table">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Role</th>
                    <th>Current Speed</th>
                    <th>Lag Separation</th>
                    <th>Telemetry Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <span className="car-badge car-lead">🚗</span>
                      <strong>Lead Vehicle</strong>
                    </td>
                    <td>Convoy Lead (Heading 042° NE)</td>
                    <td>{convoySpeed} km/h</td>
                    <td>0.0 km (Reference)</td>
                    <td><span className="badge-pill pill-lead">LEADER</span></td>
                    <td><span className="action-txt">Pacing Group</span></td>
                  </tr>

                  <tr>
                    <td>
                      <span className="car-badge car-safe">🚙</span>
                      <strong>Vehicle 2</strong>
                    </td>
                    <td>Mid-Pack</td>
                    <td>{Math.max(0, convoySpeed - 3)} km/h</td>
                    <td>0.6 km</td>
                    <td><span className="badge-pill pill-safe">IN CONVOY</span></td>
                    <td><span className="action-txt">Synced</span></td>
                  </tr>

                  <tr style={{ background: isLagging ? 'rgba(239, 68, 68, 0.08)' : 'transparent', transition: 'background 0.3s' }}>
                    <td>
                      <span className="car-badge car-lag">🚐</span>
                      <strong>Vehicle 3</strong>
                    </td>
                    <td>Rear Guard</td>
                    <td>{Math.max(0, convoySpeed - 12)} km/h</td>
                    <td style={{ fontWeight: 'bold', color: isLagging ? '#ef4444' : '#10b981' }}>
                      {lagDistance.toFixed(1)} km
                    </td>
                    <td>
                      <span className={`badge-pill ${isLagging ? 'pill-lag' : 'pill-safe'}`}>
                        {isLagging ? '⚠️ LAGGING (>2.0 km)' : 'SAFE'}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => {
                          setIsAutoSimulating(false);
                          setLagDistance(1.1);
                        }}
                        className="btn-tiny"
                        title="Simulate vehicle accelerating to catch up"
                      >
                        Catch Up
                      </button>
                    </td>
                  </tr>

                  <tr>
                    <td>
                      <span className="car-badge car-ghost">👻</span>
                      <strong>Vehicle 4</strong>
                    </td>
                    <td>Support Unit</td>
                    <td>{ghostModeActive ? '--' : `${convoySpeed} km/h`}</td>
                    <td>{ghostModeActive ? 'Hidden' : '1.4 km'}</td>
                    <td>
                      <span className={`badge-pill ${ghostModeActive ? 'pill-ghost' : 'pill-safe'}`}>
                        {ghostModeActive ? 'GHOST SHIELD' : 'BROADCASTING'}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => setGhostModeActive(!ghostModeActive)}
                        className="btn-tiny"
                        style={{
                          background: ghostModeActive ? '#8b5cf6' : 'rgba(255, 255, 255, 0.1)',
                          color: 'white'
                        }}
                      >
                        {ghostModeActive ? 'Disable Ghost' : 'Enable Ghost'}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Feature Deep Dive Tabs */}
      <section id="features" className="landing-features">
        <div className="section-container">
          <div className="section-header">
            <div className="section-tag">Interactive Architecture</div>
            <h2 className="section-title">Designed for the Reality of Highway Travel</h2>
            <p className="section-desc">
              Explore how ConvoySync handles live coordination, intelligent battery conservation, and group settlements.
            </p>
          </div>

          {/* Feature Tab Bar */}
          <div className="feature-tabs-bar">
            <button
              className={`feature-tab-btn ${activeTab === 'radar' ? 'active' : ''}`}
              onClick={() => setActiveTab('radar')}
            >
              📡 Convoy Radar & Lag
            </button>
            <button
              className={`feature-tab-btn ${activeTab === 'expense' ? 'active' : ''}`}
              onClick={() => setActiveTab('expense')}
            >
              💰 Expense Splitter
            </button>
            <button
              className={`feature-tab-btn ${activeTab === 'privacy' ? 'active' : ''}`}
              onClick={() => setActiveTab('privacy')}
            >
              🛡️ Ghost Privacy
            </button>
            <button
              className={`feature-tab-btn ${activeTab === 'pwa' ? 'active' : ''}`}
              onClick={() => setActiveTab('pwa')}
            >
              📱 Driver Ergonomics
            </button>
          </div>

          {/* Tab 1: Convoy Radar */}
          {activeTab === 'radar' && (
            <div className="tab-showcase-card animated-fade-in">
              <div className="showcase-content">
                <span className="showcase-tag">GIS & TELEMETRY</span>
                <h3>Haversine Geodesic Math with Automatic Separation Radar</h3>
                <p>
                  ConvoySync computes continuous great-circle distances (Earth radius 6,371 km) relative to the convoy leader or the dynamic geographic centroid of all active vehicles.
                </p>
                <ul className="showcase-list">
                  <li><strong>Automatic 2.0 km Lag Warnings:</strong> Visual alerts trigger the moment a vehicle falls behind due to traffic or tolls.</li>
                  <li><strong>Speed-Adaptive Polling:</strong> Adjusts cadence automatically (&gt;40 km/h: 5s, 10–40 km/h: 15s, &lt;10 km/h: 30s).</li>
                  <li><strong>Compass Bearing:</strong> Computes 0° to 360° navigation direction towards the group centroid.</li>
                </ul>
              </div>
              <div className="showcase-visual">
                <div className="interactive-metric-card glow-card">
                  <div className="metric-header">Separation Formula</div>
                  <div className="metric-code">
                    <code>d = 2R · atan2(√a, √(1-a))</code>
                  </div>
                  <div className="metric-status-row">
                    <span>Threshold: <strong>2.0 km</strong></span>
                    <span>Status: <strong style={{ color: '#10b981' }}>Active</strong></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Expense Split Calculator */}
          {activeTab === 'expense' && (
            <div className="tab-showcase-card animated-fade-in">
              <div className="showcase-content">
                <span className="showcase-tag">SHARED COSTS</span>
                <h3>Instant Multi-Vehicle Expense Splitting</h3>
                <p>
                  Log fuel, highway toll tags, cabin rentals, and group food. Automated debt minimization calculates net balances so friends never have to do mental math on vacation.
                </p>
                <ul className="showcase-list">
                  <li><strong>Itemized & Equal Splits:</strong> Split equally among cars or assign specific receipts.</li>
                  <li><strong>Direct Settle-Up:</strong> One-tap balance resolution when returning from the road.</li>
                  <li><strong>Offline Receipt Storing:</strong> Capture expenses even in remote areas with no signal.</li>
                </ul>
              </div>
              <div className="showcase-visual">
                <div className="interactive-calc-widget glow-card">
                  <h4>Try the Live Expense Splitter</h4>
                  <div className="calc-row">
                    <label>Total Shared Trip Expense:</label>
                    <input
                      type="number"
                      value={expenseTotal}
                      onChange={(e) => setExpenseTotal(Math.max(0, Number(e.target.value)))}
                      className="calc-input"
                    />
                  </div>
                  <div className="calc-row">
                    <label>Vehicles in Convoy:</label>
                    <select
                      value={numVehicles}
                      onChange={(e) => setNumVehicles(Number(e.target.value))}
                      className="calc-select"
                    >
                      <option value={2}>2 Vehicles</option>
                      <option value={3}>3 Vehicles</option>
                      <option value={4}>4 Vehicles</option>
                      <option value={5}>5 Vehicles</option>
                      <option value={6}>6 Vehicles</option>
                    </select>
                  </div>
                  <div className="calc-result-box">
                    <span>Fair Split Per Vehicle:</span>
                    <strong>₹{numVehicles > 0 ? (expenseTotal / numVehicles).toFixed(0) : 0}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Ghost Mode Privacy */}
          {activeTab === 'privacy' && (
            <div className="tab-showcase-card animated-fade-in">
              <div className="showcase-content">
                <span className="showcase-tag">PRIVACY FIRST</span>
                <h3>One-Tap Ghost Mode Privacy</h3>
                <p>
                  Taking a private detour, stopping for fuel, or heading home early? Ghost Mode masks your exact coordinates without kicking you out of the group.
                </p>
                <ul className="showcase-list">
                  <li><strong>Zero Coordinate Leakage:</strong> When enabled, latitude and longitude serialize as <code>null</code> on the server.</li>
                  <li><strong>Active Membership Preserved:</strong> You remain part of the trip chat, itinerary, and expense pool.</li>
                  <li><strong>Instant Rejoin:</strong> One tap restores real-time radar tracking when you rejoin the convoy line.</li>
                </ul>
              </div>
              <div className="showcase-visual">
                <div className="privacy-pill-card glow-card">
                  <div className="privacy-toggle-demo">
                    <div className="privacy-status-badge">
                      🔒 Privacy Shield: <strong>Guaranteed at API Level</strong>
                    </div>
                    <div className="privacy-payload-box">
                      <pre>
{`{
  "vehicle_id": 4,
  "is_ghost_mode": true,
  "latitude": null,
  "longitude": null,
  "location_status": "GHOST_MODE"
}`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Driver Ergonomics & PWA */}
          {activeTab === 'pwa' && (
            <div className="tab-showcase-card animated-fade-in">
              <div className="showcase-content">
                <span className="showcase-tag">DRIVER ERGONOMICS</span>
                <h3>Glanceable UI & Progressive Web App</h3>
                <p>
                  Built specifically for in-cabin safety. Drivers need high-contrast status cues that can be interpreted at a glance without taking eyes off the road.
                </p>
                <ul className="showcase-list">
                  <li><strong>48px+ Touch Targets:</strong> Touch controls meet strict in-vehicle accessibility standards.</li>
                  <li><strong>High-Contrast Color Coding:</strong> Immediate visual feedback for Safe (Green), Lagging (Red), and Ghost Mode.</li>
                  <li><strong>Installable PWA:</strong> Add directly to iOS or Android home screen with zero app store installation friction.</li>
                </ul>
              </div>
              <div className="showcase-visual">
                <div className="hud-preview-mini glow-card">
                  <div className="hud-mini-screen">
                    <div className="mini-hud-speed">{convoySpeed}</div>
                    <div className="mini-hud-unit">KM/H • CRUISE</div>
                    <div className="mini-hud-status" style={{ background: isLagging ? '#ef4444' : '#10b981' }}>
                      {isLagging ? '⚠️ CONVOY LAG DETECTED' : 'CONVOY SYNCHRONIZED'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="landing-steps">
        <div className="section-container">
          <div className="section-header">
            <div className="section-tag">Step-by-Step Flow</div>
            <h2 className="section-title">How ConvoySync Works in 3 Steps</h2>
            <p className="section-desc">
              Connect your entire group in under 60 seconds with zero proprietary hardware required.
            </p>
          </div>

          <div className="steps-grid">
            <div className="step-card interactive-hover-card">
              <div className="step-number">1</div>
              <h3>Create or Join with Trip Code</h3>
              <p>
                The expedition leader creates a trip and generates a 6-character code (e.g. <code>TRIP-982</code>). Group members join directly from mobile browsers.
              </p>
            </div>

            <div className="step-card interactive-hover-card">
              <div className="step-number">2</div>
              <h3>Sync Live on the Highway</h3>
              <p>
                Open the live convoy radar. Adaptive telemetry tracks separation distances and alerts drivers if anyone falls behind by more than 2.0 km.
              </p>
            </div>

            <div className="step-card interactive-hover-card">
              <div className="step-number">3</div>
              <h3>Split Costs & Settle Up</h3>
              <p>
                Log shared tolls, fuel stops, and meals as you travel. When the trip ends, settle balances with one tap and complete clarity.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section id="faq" className="landing-features" style={{ background: 'var(--bg-secondary)' }}>
        <div className="section-container" style={{ maxWidth: '800px' }}>
          <div className="section-header">
            <div className="section-tag">Got Questions?</div>
            <h2 className="section-title">Frequently Asked Questions</h2>
          </div>

          <div className="faq-accordion">
            <div className="faq-item">
              <button
                className="faq-question"
                onClick={() => setOpenFaq(openFaq === 1 ? null : 1)}
              >
                <span>How does the 2.0 km Convoy Lag alert work?</span>
                <span>{openFaq === 1 ? '−' : '+'}</span>
              </button>
              {openFaq === 1 && (
                <div className="faq-answer">
                  ConvoySync calculates the great-circle Haversine distance between your vehicle and either the convoy leader or the group's spatial centroid. If the distance exceeds 2.0 km, the status automatically flags as Lagging so lead cars know to ease pace.
                </div>
              )}
            </div>

            <div className="faq-item">
              <button
                className="faq-question"
                onClick={() => setOpenFaq(openFaq === 2 ? null : 2)}
              >
                <span>Does continuous GPS tracking drain phone battery?</span>
                <span>{openFaq === 2 ? '−' : '+'}</span>
              </button>
              {openFaq === 2 && (
                <div className="faq-answer">
                  No! ConvoySync uses a speed-adaptive polling algorithm. When stopped or moving slowly (&lt;10 km/h), polling throttles down to once every 30 seconds. It only polls at 5 seconds during high-speed highway cruising (&gt;40 km/h).
                </div>
              )}
            </div>

            <div className="faq-item">
              <button
                className="faq-question"
                onClick={() => setOpenFaq(openFaq === 3 ? null : 3)}
              >
                <span>What happens when someone enables Ghost Mode?</span>
                <span>{openFaq === 3 ? '−' : '+'}</span>
              </button>
              {openFaq === 3 && (
                <div className="faq-answer">
                  Their latitude and longitude are immediately stripped on the backend and set to null. They still remain enrolled in the trip, expenses, and notifications, but their live location is completely hidden on the map.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="landing-bottom-cta">
        <div className="cta-banner-container">
          <h2 className="cta-banner-title">Ready for Your Next Road Trip?</h2>
          <p className="cta-banner-desc">
            Keep your vehicles synchronized, your drivers connected, and your expenses completely clear.
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/signup" className="btn-cta-primary pulse-btn" style={{ background: '#0284c7' }}>
              Create Your Trip Now
            </Link>
            <Link to="/login" className="btn-cta-secondary" style={{ background: 'transparent', color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>
              Join Existing Trip
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-container">
          <div className="footer-copy">
            <strong>ConvoySync</strong> — Smart Group Trip Coordination & Live Convoy Platform
          </div>
          <div>
            DA-IICT Software Engineering • Group 8 (Sprint 2)
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
