// Candidate -> current-location relationship (Handoff v2.6 §40.2A).
//
// v2.6 replaces the earlier "runtime intent" model (roadside /
// destination_context / etc., derived per candidate from route geometry)
// with something intentionally smaller: a plain distance/timing relationship
// between a candidate and the traveller's current location. There is no
// intent classification at all any more - every candidate is evaluated the
// same way, using one generic pacing window (see config.ts).
//
// Per the doc, not every field is mandatory. `distanceFromUserM` is always
// useful; `isAhead`/`routeDistanceM`/`etaMinutes` are optional route context
// that only exist when a route and the traveller's current route fraction
// are available, and must never be required for the basic recommendation
// model to work.
export type CandidateContext = {
  distanceFromUserM: number;
  isAhead?: boolean;
  routeDistanceM?: number;
  etaMinutes?: number;
};

/**
 * Derives the small candidate -> current-location relationship used for
 * eligibility and scoring.
 *
 * `candidate.distance_m` is the candidate's distance to the route line
 * (already computed in SQL). When the traveller's current route fraction is
 * also known, we combine that with the along-route offset between the
 * traveller and the candidate to approximate the real straight-line
 * distance from the traveller's current position - a closer proxy for
 * "distance from where the traveller actually is" than distance-to-route
 * alone, without needing a second round-trip to the database for exact
 * coordinates.
 */
export function deriveCandidateContext(
  candidate: { distance_m: number; route_fraction?: number; route_length_m?: number },
  currentRouteFraction?: number,
  assumedSpeedKmh = 60,
): CandidateContext {
  if (
    currentRouteFraction === undefined ||
    candidate.route_fraction === undefined ||
    !candidate.route_length_m
  ) {
    return { distanceFromUserM: candidate.distance_m };
  }

  const routeDistanceM = (candidate.route_fraction - currentRouteFraction) * candidate.route_length_m;
  const distanceFromUserM = Math.sqrt(candidate.distance_m ** 2 + routeDistanceM ** 2);
  const metersPerMinute = (assumedSpeedKmh * 1000) / 60;

  return {
    distanceFromUserM: Number(distanceFromUserM.toFixed(1)),
    isAhead: routeDistanceM >= 0,
    routeDistanceM: Number(routeDistanceM.toFixed(1)),
    etaMinutes: routeDistanceM > 0 ? Number((routeDistanceM / metersPerMinute).toFixed(1)) : undefined,
  };
}
