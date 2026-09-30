import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { joinTripByCode } from '../api/trip';

const JoinTrip = () => {
  const { tripCode: urlTripCode } = useParams();
  const navigate = useNavigate();

  const [tripCode, setTripCode] = useState(urlTripCode || '');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (urlTripCode) {
      setTripCode(urlTripCode.toUpperCase());
    }
  }, [urlTripCode]);

  const handleJoin = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanCode = tripCode.trim().toUpperCase();

    if (!cleanCode) {
      setErrorMsg('Please enter a trip code.');
      return;
    }

    if (cleanCode.length !== 8) {
      setErrorMsg('Trip code must be exactly 8 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await joinTripByCode(cleanCode);
      const joinedTrip = res.data.trip;
      setSuccessMsg(`Successfully joined "${joinedTrip.title}"! Redirecting to trip details...`);
      setTimeout(() => {
        navigate(`/trips/${joinedTrip.id}`);
      }, 1500);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;

      if (status === 401) {
        setErrorMsg('Authentication required. Please log in to join this trip.');
      } else if (status === 404) {
        setErrorMsg('Trip not found. Please check the trip code.');
      } else if (status === 409) {
        setErrorMsg('You are already a member of this trip.');
      } else if (status === 422) {
        if (Array.isArray(detail)) {
          setErrorMsg(detail.map((d) => d.msg).join(', '));
        } else {
          setErrorMsg('Invalid trip code format. Please check and try again.');
        }
      } else {
        setErrorMsg(typeof detail === 'string' ? detail : 'Failed to join trip. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="trip-page-container">
      <div className="page-header">
        <h1>Join a Group Trip</h1>
        <Link to="/trips" className="btn btn-secondary btn-sm">
          &larr; Back to My Trips
        </Link>
      </div>

      <div className="trip-detail-card" style={{ maxWidth: '550px', margin: '0 auto' }}>
        {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}

        {urlTripCode ? (
          /* Confirmation UI for shareable link entry */
          <div className="join-confirm-card">
            <h3>You have an invite to join a trip!</h3>
            <p style={{ color: 'var(--text-muted)' }}>
              Click below to accept the invitation and become a member of this trip.
            </p>
            <div className="join-code-highlight">{urlTripCode.toUpperCase()}</div>
            <div>
              <button
                type="button"
                onClick={handleJoin}
                className="btn btn-primary btn-block"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Joining Trip...' : 'Confirm & Join Trip'}
              </button>
            </div>
            <p style={{ marginTop: '15px', fontSize: '0.9rem' }}>
              Want to join a different trip?{' '}
              <Link to="/trips/join">Enter another code</Link>
            </p>
          </div>
        ) : (
          /* Manual code entry UI */
          <form onSubmit={handleJoin}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
              Enter the 8-character unique code shared by the trip host.
            </p>
            <div className="form-group">
              <label htmlFor="tripCode">Trip Code</label>
              <input
                id="tripCode"
                name="tripCode"
                type="text"
                maxLength={8}
                placeholder="e.g., A7B9K2M4"
                value={tripCode}
                onChange={(e) => setTripCode(e.target.value.toUpperCase())}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '1.2rem',
                  letterSpacing: '2px',
                  textAlign: 'center',
                }}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Joining Trip...' : 'Join Trip'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default JoinTrip;
