import api from './auth';

/**
 * Trip API Service
 * Reuses the existing Axios instance with automatic JWT Bearer token attachment.
 */

// POST /trips/ — Create a new trip
export const createTrip = (data) => api.post('/trips/', data);

// GET /trips/ — List trips for the authenticated user
export const getMyTrips = () => api.get('/trips/');

// GET /trips/{trip_id} — Get details of a single trip
export const getTripDetails = (tripId) => api.get(`/trips/${tripId}`);

// POST /trips/join — Join a trip via JSON payload {"trip_code": "..."}
export const joinTripByCode = (tripCode) => api.post('/trips/join', { trip_code: tripCode });

// GET /trips/join/{trip_code} — Join a trip via shareable link code
export const joinTripByLink = (tripCode) => api.get(`/trips/join/${tripCode}`);
