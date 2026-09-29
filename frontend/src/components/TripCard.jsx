import React from 'react';
import { Link } from 'react-router-dom';

const TripCard = ({ trip }) => {
  if (!trip) return null;

  return (
    <div className="trip-card">
      <div className="trip-card-header">
        <h3 className="trip-card-title">{trip.title}</h3>
        <p className="trip-card-destination">
          <span>📍</span> {trip.destination}
        </p>
        <span className="trip-card-dates">
          🗓 {trip.start_date} – {trip.end_date}
        </span>
      </div>

      <div className="trip-card-footer">
        <div>
          <span className="trip-code-pill" title="Trip Join Code">
            Code: {trip.trip_code}
          </span>
        </div>
        <Link to={`/trips/${trip.id}`} className="btn btn-secondary btn-sm">
          View Details
        </Link>
      </div>
    </div>
  );
};

export default TripCard;
