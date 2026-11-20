import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RotateCw, UserPlus, Plus } from 'lucide-react';
import { getMyTrips } from '../api/trip';
import TripCard from '../components/TripCard';

const MyTrips = () => {
  const { data: trips = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['myTrips'],
    queryFn: () => getMyTrips().then((res) => res.data || []),
  });

  const errorMsg = error?.response?.data?.detail || error?.message;

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
            onClick={() => refetch()}
            className="btn btn-secondary btn-sm"
            disabled={isFetching}
          >
            <RotateCw size={14} className={isFetching ? 'spin' : ''} style={{ marginRight: '6px' }} />
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
          <Link to="/trips/join" className="btn btn-secondary btn-sm">
            <UserPlus size={14} style={{ marginRight: '6px' }} />
            Join Trip
          </Link>
          <Link to="/trips/create" className="btn btn-primary btn-sm">
            <Plus size={14} style={{ marginRight: '6px' }} />
            Create Trip
          </Link>
        </div>
      </div>

      {/* Error state */}
      {errorMsg && (
        <div className="alert alert-error">
          <p>{errorMsg}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="btn btn-secondary btn-sm"
            style={{ marginTop: '10px' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
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
