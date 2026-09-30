import React, { useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const Home = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const notImplemented = () => {
    alert("This feature will be available when the Expense module is integrated.");
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Welcome, {user?.name || 'Traveler'}!</h1>
        <p style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
      </header>

      <div className="dashboard-grid">
        <section className="dashboard-section">
          <h2>Trip Management</h2>
          <div className="btn-group">
            <button className="btn btn-primary" onClick={() => navigate('/trips/create')}>
              Create Trip
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/trips/join')}>
              Join Trip
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/trips')}>
              My Trips
            </button>
          </div>
        </section>

        <section className="dashboard-section">
          <h2>Expense Management</h2>
          <div className="btn-group">
            <button className="btn btn-primary" onClick={() => navigate('/trips')}>
              Manage Expenses
            </button>
          </div>
        </section>

        <section className="dashboard-section section-disabled">
          <h2>Coming Soon</h2>
          <div className="btn-group vertical">
            <button className="btn btn-disabled" disabled>Real-time Location</button>
            <button className="btn btn-disabled" disabled>Route Monitoring</button>
            <button className="btn btn-disabled" disabled>Emergency Alerts</button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Home;
