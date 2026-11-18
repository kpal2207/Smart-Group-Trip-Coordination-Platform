# Sprint 2 Telemetry API

Both endpoints require a Sprint 1 JWT bearer token and active trip membership. The authenticated user ID comes from the token.

## Submit a location ping

`POST /trips/{trip_id}/telemetry`

~~~http
Authorization: Bearer <access_token>
Content-Type: application/json
~~~

~~~json
{
  "latitude": 37.7749,
  "longitude": -122.4194,
  "speed_kmh": 24.5,
  "heading": 180,
  "is_ghost_mode": false
}
~~~

Latitude must be between -90 and 90; longitude between -180 and 180; speed must be non-negative; heading may be null or between 0 and 360. Invalid values return 422. Success returns 201 with the stored ping and UTC timestamp. Non-members receive 403; missing or invalid tokens receive 401.

## Read convoy locations

`GET /trips/{trip_id}/convoy/locations`

Returns one item per enrolled member, including members without a ping. `location_status` is `fresh` (up to 60 seconds), `stale` (60 seconds to 5 minutes), `unavailable` (no ping or older than 5 minutes), or `hidden` (Ghost Mode). Coordinates are null for unavailable or hidden locations. Ghost Mode coordinates are also null in the POST acknowledgement.

~~~json
{
  "user_id": 42,
  "name": "Asha Patel",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "speed_kmh": 24.5,
  "heading": 180,
  "is_ghost_mode": false,
  "location_status": "fresh",
  "recorded_at": "2026-11-04T10:30:00Z"
}
~~~

Example request:

~~~bash
curl -X POST "http://localhost:8000/trips/12/telemetry" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"latitude":37.7749,"longitude":-122.4194,"speed_kmh":24.5,"heading":180,"is_ghost_mode":false}'
~~~

Sprint 2 uses REST polling (5–30 seconds). WebSockets and server-sent events are deferred to Sprint 3.
