import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createTrip } from '../api/trip';

const CreateTrip = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    destination: '',
    start_date: '',
    end_date: '',
  });

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdTrip, setCreatedTrip] = useState(null);

  const [copyCodeSuccess, setCopyCodeSuccess] = useState(false);
  const [copyLinkSuccess, setCopyLinkSuccess] = useState(false);

  const validate = () => {
    const errs = {};
    if (!formData.title.trim()) {
      errs.title = 'Title is required.';
    } else if (formData.title.trim().length > 200) {
      errs.title = 'Title must be at most 200 characters.';
    }

    if (!formData.destination.trim()) {
      errs.destination = 'Destination is required.';
    } else if (formData.destination.trim().length > 200) {
      errs.destination = 'Destination must be at most 200 characters.';
    }

    if (!formData.start_date) {
      errs.start_date = 'Start date is required.';
    }

    if (!formData.end_date) {
      errs.end_date = 'End date is required.';
    } else if (formData.start_date && formData.end_date < formData.start_date) {
      errs.end_date = 'End date cannot be before start date.';
    }

    return errs;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});

    setIsSubmitting(true);
    try {
      const payload = {
        title: formData.title.trim(),
        destination: formData.destination.trim(),
        description: formData.description.trim() ? formData.description.trim() : null,
        start_date: formData.start_date,
        end_date: formData.end_date,
      };

      const res = await createTrip(payload);
      setCreatedTrip(res.data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        setApiError(detail);
      } else if (Array.isArray(detail)) {
        setApiError(detail.map((d) => d.msg).join(', '));
      } else {
        setApiError('Failed to create trip. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = async () => {
    if (!createdTrip?.trip_code) return;
    try {
      await navigator.clipboard.writeText(createdTrip.trip_code);
      setCopyCodeSuccess(true);
      setTimeout(() => setCopyCodeSuccess(false), 2500);
    } catch {
      setCopyCodeSuccess(false);
    }
  };

  const shareableUrl = createdTrip ? `${window.location.origin}/trips/join/${createdTrip.trip_code}` : '';

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

  if (createdTrip) {
    return (
      <div className="trip-page-container">
        <div className="trip-success-panel">
          <div className="success-header">
            <h2>🎉 Trip Created Successfully!</h2>
            <p>Your group trip is ready. Share the code or link with friends to have them join.</p>
          </div>

          <div className="trip-meta-section">
            <div className="trip-meta-item">
              <label>Trip Title</label>
              <p>{createdTrip.title}</p>
            </div>
            <div className="trip-meta-item">
              <label>Destination</label>
              <p>{createdTrip.destination}</p>
            </div>
            <div className="trip-meta-item">
              <label>Dates</label>
              <p>{createdTrip.start_date} to {createdTrip.end_date}</p>
            </div>
          </div>

          <div className="trip-share-box">
            <h3>Trip Code</h3>
            <div className="code-display-row">
              <span className="trip-code-large">{createdTrip.trip_code}</span>
              <button type="button" onClick={handleCopyCode} className="btn btn-secondary btn-sm">
                {copyCodeSuccess ? 'Copied!' : 'Copy Code'}
              </button>
            </div>

            <h3>Shareable Link</h3>
            <div className="share-link-row">
              <input
                type="text"
                readOnly
                value={shareableUrl}
                className="share-link-input"
              />
              <button type="button" onClick={handleCopyLink} className="btn btn-primary btn-sm">
                {copyLinkSuccess ? 'Link Copied!' : 'Copy Link'}
              </button>
            </div>
            {copyLinkSuccess && <div className="copy-feedback">Link copied to clipboard!</div>}
          </div>

          <div className="btn-group" style={{ marginTop: '25px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => navigate(`/trips/${createdTrip.id}`)}
              className="btn btn-primary"
            >
              View Trip Details
            </button>
            <button
              type="button"
              onClick={() => navigate('/trips')}
              className="btn btn-secondary"
            >
              Go to My Trips
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="trip-page-container">
      <div className="page-header">
        <h1>Create a New Trip</h1>
        <Link to="/trips" className="btn btn-secondary btn-sm">
          &larr; Back to My Trips
        </Link>
      </div>

      <div className="trip-detail-card" style={{ maxWidth: '650px', margin: '0 auto' }}>
        {apiError && <div className="alert alert-error">{apiError}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">Trip Title *</label>
            <input
              id="title"
              name="title"
              type="text"
              maxLength={200}
              placeholder="e.g., Summer in Europe"
              value={formData.title}
              onChange={handleChange}
            />
            {errors.title && <span className="error-text">{errors.title}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="destination">Destination *</label>
            <input
              id="destination"
              name="destination"
              type="text"
              maxLength={200}
              placeholder="e.g., Paris, France"
              value={formData.destination}
              onChange={handleChange}
            />
            {errors.destination && <span className="error-text">{errors.destination}</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div className="form-group">
              <label htmlFor="start_date">Start Date *</label>
              <input
                id="start_date"
                name="start_date"
                type="date"
                value={formData.start_date}
                onChange={handleChange}
              />
              {errors.start_date && <span className="error-text">{errors.start_date}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="end_date">End Date *</label>
              <input
                id="end_date"
                name="end_date"
                type="date"
                value={formData.end_date}
                onChange={handleChange}
              />
              {errors.end_date && <span className="error-text">{errors.end_date}</span>}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="description">Description (optional)</label>
            <textarea
              id="description"
              name="description"
              rows={4}
              placeholder="Add details, itinerary notes, or travel plans..."
              value={formData.description}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                fontFamily: 'inherit',
                fontSize: '1rem',
              }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isSubmitting}
            style={{ marginTop: '10px' }}
          >
            {isSubmitting ? 'Creating Trip...' : 'Create Trip'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateTrip;
