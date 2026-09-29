import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTripDetails } from '../api/trip';
import { AuthContext } from '../context/AuthContext';

const TripDetails = () => {
  const { tripId } = useParams();
  const { user } = useContext(AuthContext);

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [copyCodeSuccess, setCopyCodeSuccess] = useState(false);
  const [copyLinkSuccess, setCopyLinkSuccess] = useState(false);

  useEffect(() => {
    const fetchTrip = async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        const res = await getTripDetails(tripId);
        setTrip(res.data);
      } catch (err) {
        if (err.response?.status === 404) {
          setErrorMsg('Trip not found or you are not a member.');
        } else {
          setErrorMsg(err.response?.data?.detail || 'Failed to load trip details.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (tripId) {
      fetchTrip();
    }
  }, [tripId]);

  const handleCopyCode = async () => {
    if (!trip?.trip_code) return;
    try {
      await navigator.clipboard.writeText(trip.trip_code);
      setCopyCodeSuccess(true);
      setTimeout(() => setCopyCodeSuccess(false), 2500);
    } catch {
      setCopyCodeSuccess(false);
    }
  };

  const shareableUrl = trip ? `${window.location.origin}/trips/join/${trip.trip_code}` : '';

  const handleCopyLink = async () => {
    if (!shareableUrl) return;
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopyLinkSuccess(true);
      setTimeout(() => setCopyLinkSuccess(false), 2500);
    } catch {
      setCopyLinkSuccess(false);
    }
  };

  if (loading) {
    return (
      <div className="trip-page-container">
        <div className="loading-container" style={{ height: '300px' }}>
          <div className="spinner"></div>
          <p>Loading trip details...</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="trip-page-container">
        <div className="page-header">
          <Link to="/trips" className="btn btn-secondary btn-sm">
            &larr; Back to My Trips
          </Link>
        </div>
        <div className="alert alert-error">
          <p>{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (!trip) return null;

  const isHost = user && trip && trip.host_id === user.id;

  return (
    <div className="trip-page-container">
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1>{trip.title}</h1>
            <span className={`badge ${isHost ? 'badge-host' : 'badge-member'}`}>
              {isHost ? 'Host' : 'Member'}
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>📍 {trip.destination}</p>
        </div>
        <div className="page-header-actions">
          <Link to="/trips" className="btn btn-secondary btn-sm">
            &larr; Back to My Trips
          </Link>
        </div>
      </div>

      <div className="trip-detail-card">
        {/* Meta details */}
        <div className="trip-meta-section">
          <div className="trip-meta-item">
            <label>Destination</label>
            <p>{trip.destination}</p>
          </div>
          <div className="trip-meta-item">
            <label>Start Date</label>
            <p>{trip.start_date}</p>
          </div>
          <div className="trip-meta-item">
            <label>End Date</label>
            <p>{trip.end_date}</p>
          </div>
          <div className="trip-meta-item">
            <label>Your Role</label>
            <p>{isHost ? 'Trip Host (Creator)' : 'Trip Member'}</p>
          </div>
        </div>

        {/* Description */}
        <div className="trip-description">
          <label>Description</label>
          <p style={{ color: trip.description ? 'var(--text-color)' : 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
            {trip.description || 'No description provided for this trip.'}
          </p>
        </div>

        {/* Shareable Link & Code Box */}
        <div className="trip-share-box">
          <h3>Invite Friends to This Trip</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '15px' }}>
            Share the unique 8-character code or the invite link with travelers so they can join your group trip.
          </p>

          <div className="code-display-row">
            <div>
              <span className="trip-code-large">{trip.trip_code}</span>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="btn btn-secondary btn-sm"
            >
              {copyCodeSuccess ? 'Code Copied!' : 'Copy Code'}
            </button>
            {copyCodeSuccess && <span className="copy-feedback">Copied to clipboard!</span>}
          </div>

          <div style={{ marginTop: '15px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Shareable Link
            </label>
            <div className="share-link-row" style={{ marginTop: '5px' }}>
              <input
                type="text"
                readOnly
                value={shareableUrl}
                className="share-link-input"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="btn btn-primary btn-sm"
              >
                {copyLinkSuccess ? 'Link Copied!' : 'Copy Link'}
              </button>
            </div>
            {copyLinkSuccess && <div className="copy-feedback">Link copied! Share it with your group.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TripDetails;
