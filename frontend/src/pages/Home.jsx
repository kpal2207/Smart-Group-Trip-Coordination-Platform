import React, { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

const Home = () => {
  const { user } = useContext(AuthContext);

  const notImplemented = () => {
    alert("This feature will be available when the Trip module is integrated.");
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Welcome, {user?.name || 'Traveler'}!</h1>
      </header>

      <div className="dashboard-grid">
        <section className="dashboard-section">
          <h2>Trip Management</h2>
          <div className="btn-group">
            <button className="btn btn-primary" onClick={notImplemented}>Create Trip</button>
            <button className="btn btn-secondary" onClick={notImplemented}>Join Trip</button>
          </div>
        </section>

        <section className="dashboard-section">
          <h2>Expense Management</h2>
          <div className="btn-group">
            <button className="btn btn-primary" onClick={notImplemented}>Manage Expenses</button>
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
