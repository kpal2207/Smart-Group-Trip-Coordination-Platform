import api from './auth';

/**
 * Convoy Telemetry API Service
 * Interacts with FastAPI backend for persistent GPS retention and status queries.
 */

// POST /trips/{trip_id}/telemetry — Submit authenticated user's GPS ping
export const submitTelemetry = (tripId, data) =>
  api.post(`/trips/${tripId}/telemetry`, data);

// GET /trips/{trip_id}/convoy/locations — Get latest location of all trip members
export const getConvoyLocations = (tripId) =>
  api.get(`/trips/${tripId}/convoy/locations`);
