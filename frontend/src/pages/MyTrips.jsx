import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMyTrips } from '../api/trip';
import TripCard from '../components/TripCard';

const MyTrips = () => {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchTrips = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await getMyTrips();
      setTrips(res.data || []);
    } catch (err) {
      setErrorMsg(
        err.response?.data?.detail || 'Failed to load your trips. Please check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips();
  }, []);

  return (
    <div className="trip-page-container">
      <div className="page-header">
        <div>
          <h1>My Trips</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Manage the group trips you are hosting or have joined.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            onClick={fetchTrips}
            className="btn btn-secondary btn-sm"
            disabled={loading}
          >
            ↻ Refresh
          </button>
          <Link to="/trips/join" className="btn btn-secondary btn-sm">
            Join Trip
          </Link>
          <Link to="/trips/create" className="btn btn-primary btn-sm">
            + Create Trip
          </Link>
        </div>
      </div>

      {/* Error state */}
      {errorMsg && (
        <div className="alert alert-error">
          <p>{errorMsg}</p>
          <button
            type="button"
            onClick={fetchTrips}
            className="btn btn-secondary btn-sm"
            style={{ marginTop: '10px' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="loading-container" style={{ height: '300px' }}>
          <div className="spinner"></div>
          <p>Loading your trips...</p>
        </div>
      ) : trips.length === 0 ? (
        /* Empty state */
        <div className="empty-state">
          <h3>No trips yet</h3>
          <p>You haven't created or joined any trips yet. Get started now!</p>
          <div className="btn-group" style={{ justifyContent: 'center' }}>
            <Link to="/trips/create" className="btn btn-primary">
              Create a Trip
            </Link>
            <Link to="/trips/join" className="btn btn-secondary">
              Join with a Code
            </Link>
          </div>
        </div>
      ) : (
        /* List state */
        <div className="trip-grid">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
};

export default MyTrips;
