import { db } from '../../common/db.js';
import type { ContentCandidate } from '../content/repository.js';
import { recommendationEngine } from '../recommendation/engine.js';
import { RECOMMENDATION_CONFIG } from '../recommendation/config.js';
import { deriveCandidateContext } from '../recommendation/location.js';
import { classifySkipReason, type EvaluationState } from '../recommendation/types.js';

export type SimulatorOptions = {
  radiusMeters?: number;
  assumedSpeedKmh?: number;
  minGapMinutes?: number;
  decisionWindowMinutes?: number;
  interests?: string[];
  language?: string;
  includeStepDiagnostics?: boolean;
};

export type SimulatorCandidateOutcome = {
  id: string;
  title: string;
  category: string;
  distanceM: number;
  routeFraction: number;
  routeKm: number;
  status: 'selected' | 'rejected' | 'not_selected';
  evaluationState: EvaluationState;
  reasons: string[];
  score?: number;
};

export type SimulatorDecisionStep = {
  decisionIndex: number;
  decisionRouteFraction: number;
  decisionApproxKm: number;
  minutesSinceLastInteraction: number;
  windowCandidates: number;
  eligibleCandidates: number;
  shouldSpeak: boolean;
  spoke: boolean;
  silenceReasons: string[];
  selectedCandidate?: { id: string; title: string; category: string; score: number };
  candidateOutcomes: SimulatorCandidateOutcome[];
};

export type SimulatorNeverTriggeredCandidate = {
  id: string;
  title: string;
  category: string;
  distanceM: number;
  routeFraction: number;
  routeKm: number;
  firstSeenKm: number;
  lastSeenKm: number;
  timesConsidered: number;
  timesEligible: number;
  evaluationState: EvaluationState;
  topSkipReasons: Array<{ reason: string; count: number }>;
};

export type SimulatorDiagnostics = {
  categoryDistribution: Record<string, number>;
  rejectionReasonCounts: Array<{ reason: string; count: number }>;
  neverTriggeredCandidates: SimulatorNeverTriggeredCandidate[];
  duplicateCandidates: Array<{ title: string; count: number; ids: string[] }>;
  stepDiagnostics?: SimulatorDecisionStep[];
};

export type SimulatedEvent = {
  routeFraction: number;
  approxKm: number;
  decisionRouteFraction: number;
  decisionApproxKm: number;
  decisionAheadDistanceM: number;
  candidateRouteFraction: number;
  candidateApproxKm: number;
  triggerAheadDistanceM: number;
  triggerPoint: { lng: number; lat: number };
  content: ContentCandidate & { score: number; scoreBreakdown: object; reasons: string[] };
  candidatesConsidered: number;
  alternatives: Array<{ id: string; title: string; score: number; distance_m: number; routeFraction?: number }>;
  rejectedCandidates: Array<{ id: string; title: string; reasons: string[] }>;
};

export type SimulatorResult = {
  routeLengthKm: number;
  events: SimulatedEvent[];
  diagnostics: SimulatorDiagnostics;
};

type CandidateTracker = {
  id: string;
  title: string;
  category: string;
  distanceM: number;
  routeFraction: number;
  routeKm: number;
  // -1 means the candidate has never entered a single decision window.
  firstSeenKm: number;
  lastSeenKm: number;
  timesConsidered: number;
  timesEligible: number;
  triggered: boolean;
  skipReasonCounts: Map<string, number>;
};

export function computeAheadDistanceMeters(candidateRouteFraction: number, travellerRouteFraction: number, routeLengthM: number) {
  return Number(Math.max(0, (candidateRouteFraction - travellerRouteFraction) * routeLengthM).toFixed(1));
}

export function computeTriggerAheadDistanceMeters(candidateRouteFraction: number, triggerRouteFraction: number, routeLengthM: number) {
  return Number(Math.max(0, (candidateRouteFraction - triggerRouteFraction) * routeLengthM).toFixed(1));
}

function incrementCounter(counter: Map<string, number>, key: string) {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function mapToSortedCounts(counter: Map<string, number>) {
  return [...counter.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.reason.localeCompare(b.reason);
    });
}

export async function simulateJourney(journeyId: string, opts: SimulatorOptions = {}): Promise<SimulatorResult | null> {
  const {
    // This is the corridor pre-fetch radius (how far from the route we ask
    // the database for candidates at all), not the per-decision retrieval
    // radius used below. It must cover at least maxSearchRadiusMeters so the
    // sparse-pool expansion logic has candidates to expand into - a caller
    // cannot shrink it below that floor (see clamp below), since doing so
    // would silently starve the expansion tiers of anything to expand into.
    radiusMeters: requestedRadiusMeters = RECOMMENDATION_CONFIG.maxSearchRadiusMeters,
    assumedSpeedKmh = 60,
    minGapMinutes = RECOMMENDATION_CONFIG.defaultMinGapMinutes,
    decisionWindowMinutes = 1,
    interests = [],
    language = 'en',
    includeStepDiagnostics = true,
  } = opts;
  const radiusMeters = Math.max(requestedRadiusMeters, RECOMMENDATION_CONFIG.maxSearchRadiusMeters);

  if (assumedSpeedKmh <= 0 || minGapMinutes <= 0 || decisionWindowMinutes <= 0) {
    throw new Error('assumedSpeedKmh, minGapMinutes and decisionWindowMinutes must be positive');
  }

  const journeyResult = await db.query(
    `SELECT interests,
            ST_Length(route_geometry::geography) AS length_m,
            ST_AsGeoJSON(route_geometry) AS route_geojson
     FROM journeys WHERE id = $1`,
    [journeyId],
  );

  if (journeyResult.rowCount === 0) return null;

  const { length_m, route_geojson, interests: savedInterests } = journeyResult.rows[0];
  const lengthM = Number(length_m);
  const routeLengthKm = Number((lengthM / 1000).toFixed(1));
  const mergedInterests = interests.length ? interests : (savedInterests ?? []);
  const metersPerMinute = (assumedSpeedKmh * 1000) / 60;
  const decisionStepMeters = metersPerMinute * decisionWindowMinutes;
  const decisionStepFraction = decisionStepMeters / lengthM;
  const minGapMeters = metersPerMinute * minGapMinutes;
  const minGapFraction = minGapMeters / lengthM;

  const result = await db.query(
    `SELECT
       c.id,
       COALESCE(t.title, te.title) AS title,
       COALESCE(t.short_description, te.short_description) AS short_description,
       COALESCE(t.long_description, te.long_description) AS long_description,
       COALESCE(t.narration_hint, te.narration_hint) AS narration_hint,
       c.category, c.tags, c.interestingness, c.confidence,
       c.source_name, c.source_url, c.family_friendly,
       c.editorial_score, c.story_type,
       ST_Distance(c.location::geography, route.geom::geography) AS distance_m,
       ST_LineLocatePoint(route.geom, c.location) AS route_fraction,
       ST_Length(route.geom::geography) AS route_length_m,
       ST_X(ST_LineInterpolatePoint(route.geom, ST_LineLocatePoint(route.geom, c.location))) AS trigger_lng,
       ST_Y(ST_LineInterpolatePoint(route.geom, ST_LineLocatePoint(route.geom, c.location))) AS trigger_lat
     FROM (SELECT ST_GeomFromGeoJSON($1) AS geom) route
     JOIN content c ON c.active = true AND c.verified = true
     JOIN content_translations te ON te.content_id = c.id AND te.language = 'en'
     LEFT JOIN content_translations t ON t.content_id = c.id AND t.language = $3
     WHERE ST_DWithin(c.location::geography, route.geom::geography, $2)
     ORDER BY route_fraction ASC`,
    [route_geojson, radiusMeters, language],
  );

  const candidates = result.rows as ContentCandidate[];

  // Detect content that looks duplicated within this route's corridor (same
  // normalized title retrieved under different content ids). This is a
  // regression canary for the historical duplicate-content bug, not expected
  // to fire now that content_key has a unique DB constraint.
  const titleGroups = new Map<string, string[]>();
  for (const candidate of candidates) {
    const key = candidate.title.trim().toLowerCase();
    const ids = titleGroups.get(key) ?? [];
    ids.push(candidate.id);
    titleGroups.set(key, ids);
  }
  const duplicateCandidates = [...titleGroups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([title, ids]) => ({ title, count: ids.length, ids }))
    .sort((a, b) => b.count - a.count);

  const alreadyPlayed: string[] = [];
  const previousCategories: string[] = [];
  const events: SimulatedEvent[] = [];
  const stepDiagnostics: SimulatorDecisionStep[] = [];
  const categoryCounts = new Map<string, number>();
  const rejectionReasonCounts = new Map<string, number>();
  const candidateTrackers = new Map<string, CandidateTracker>();

  // Seed a tracker for every retrieved candidate up front. Previously
  // trackers were only created the first time a candidate showed up inside a
  // windowCandidates pass, so a candidate that never entered any decision
  // window (e.g. positioned right at the route's very end, after the last
  // narration's cooldown jump skips past it) was completely invisible in
  // diagnostics — it simply never appeared anywhere. Seeding up front lets
  // those candidates surface as ELIGIBLE_BUT_NOT_EVALUATED instead of
  // silently vanishing. See Handoff v2.4 §40.2A / the Muzaffarnagar
  // sugar-industry finding.
  for (const candidate of candidates) {
    const routeFraction = Number(candidate.route_fraction ?? 0);
    candidateTrackers.set(candidate.id, {
      id: candidate.id,
      title: candidate.title,
      category: candidate.category,
      distanceM: Number(candidate.distance_m),
      routeFraction,
      routeKm: Number(((routeFraction * lengthM) / 1000).toFixed(1)),
      firstSeenKm: -1,
      lastSeenKm: -1,
      timesConsidered: 0,
      timesEligible: 0,
      triggered: false,
      skipReasonCounts: new Map<string, number>(),
    });
  }

  let lastSpeakFraction = -minGapFraction;
  let currentFraction = 0;
  let decisionIndex = 0;
  let lastEvaluatedFraction = -1;

  async function evaluateDecision(fraction: number): Promise<{ spoke: boolean; forcedNextFraction?: number }> {
    lastEvaluatedFraction = fraction;
    const minutesSinceLast = ((fraction - lastSpeakFraction) * lengthM) / metersPerMinute;

    // Location-first candidate retrieval (Handoff v2.6 §40.2A): rather than
    // filtering the pre-fetched corridor pool by a per-content trigger
    // window/intent, search around the traveller's current simulated
    // position (this route fraction, converted to a real distance via
    // deriveCandidateContext) with an expandable radius. Start narrow and
    // widen only when the candidate pool is sparse - the radius is a
    // retrieval boundary, not a narration trigger rule; a candidate 15km
    // away does not need to be spoken about immediately just because it
    // entered the radius (that's still governed by scoring + pacing below).
    const withContext = candidates.map(candidate => ({
      candidate,
      context: deriveCandidateContext(candidate, fraction, assumedSpeedKmh),
    }));

    const withinRadius = (radius: number) => withContext.filter(({ context }) => {
      if (context.routeDistanceM !== undefined && context.routeDistanceM < -RECOMMENDATION_CONFIG.maximumBehindMeters) {
        return false;
      }
      return context.distanceFromUserM <= radius;
    });

    let windowCandidates = withinRadius(RECOMMENDATION_CONFIG.preferredSearchRadiusMeters).map(x => x.candidate);
    if (windowCandidates.length < RECOMMENDATION_CONFIG.sparseCandidateThreshold) {
      windowCandidates = withinRadius(RECOMMENDATION_CONFIG.expandedSearchRadiusMeters).map(x => x.candidate);
    }
    if (windowCandidates.length < RECOMMENDATION_CONFIG.sparseCandidateThreshold) {
      windowCandidates = withinRadius(RECOMMENDATION_CONFIG.maxSearchRadiusMeters).map(x => x.candidate);
    }

    const decision = recommendationEngine.recommend(windowCandidates, {
      interests: mergedInterests,
      alreadyPlayed,
      previousCategories,
      minutesSinceLastInteraction: minutesSinceLast,
      currentRouteFraction: fraction,
    });

    const rejectionById = new Map(decision.rejectedCandidates.map(candidate => [candidate.id, candidate.reasons]));
    const rankedById = new Map(decision.rankedCandidates.map(candidate => [candidate.id, candidate]));
    let spoke = false;
    let selectedCandidateId: string | null = null;
    let forcedNextFraction: number | undefined;
    const silenceReasons = decision.shouldSpeak ? [] : [...decision.reasons];

    if (decision.shouldSpeak && decision.recommendation) {
      const chosen = decision.recommendation;
      const chosenFraction = Number(chosen.route_fraction ?? fraction);
      const triggerFraction = Math.max(fraction, chosenFraction - (RECOMMENDATION_CONFIG.preferredAheadMinMeters / lengthM));

      // Do not narrate repeatedly at essentially the same place.
      if (triggerFraction - lastSpeakFraction >= minGapFraction) {
        const triggerResult = await db.query(
          `SELECT
             ST_X(ST_LineInterpolatePoint(ST_GeomFromGeoJSON($1), $2)) AS lng,
             ST_Y(ST_LineInterpolatePoint(ST_GeomFromGeoJSON($1), $2)) AS lat`,
          [route_geojson, triggerFraction],
        );
        const triggerPoint = triggerResult.rows[0] ?? { lng: chosen.trigger_lng, lat: chosen.trigger_lat };

        alreadyPlayed.push(chosen.id);
        previousCategories.push(chosen.category);
        lastSpeakFraction = triggerFraction;
        spoke = true;
        selectedCandidateId = chosen.id;
        forcedNextFraction = triggerFraction + minGapFraction;
        incrementCounter(categoryCounts, chosen.category);

        const candidateFraction = Number(chosen.route_fraction ?? triggerFraction);
        const decisionAheadDistanceM = computeAheadDistanceMeters(candidateFraction, fraction, lengthM);
        const triggerAheadDistanceM = computeTriggerAheadDistanceMeters(candidateFraction, triggerFraction, lengthM);

        events.push({
          routeFraction: Number(triggerFraction.toFixed(4)),
          approxKm: Number(((triggerFraction * lengthM) / 1000).toFixed(1)),
          decisionRouteFraction: Number(fraction.toFixed(4)),
          decisionApproxKm: Number(((fraction * lengthM) / 1000).toFixed(1)),
          decisionAheadDistanceM: Number(decisionAheadDistanceM.toFixed(1)),
          candidateRouteFraction: Number(candidateFraction.toFixed(4)),
          candidateApproxKm: Number(((candidateFraction * lengthM) / 1000).toFixed(1)),
          triggerAheadDistanceM: Number(triggerAheadDistanceM.toFixed(1)),
          triggerPoint: {
            lng: Number(triggerPoint.lng),
            lat: Number(triggerPoint.lat),
          },
          content: chosen,
          candidatesConsidered: decision.candidatesConsidered,
          alternatives: decision.rankedCandidates.slice(1, 4).map(candidate => ({
            id: candidate.id,
            title: candidate.title,
            score: candidate.score,
            distance_m: Number(candidate.distance_m),
            routeFraction: candidate.route_fraction,
          })),
          rejectedCandidates: decision.rejectedCandidates,
        });
      } else {
        silenceReasons.push('trigger point violates minimum spacing from last narration');
      }
    }

    const decisionApproxKm = Number(((fraction * lengthM) / 1000).toFixed(1));
    const candidateOutcomes: SimulatorCandidateOutcome[] = windowCandidates.map(candidate => {
      const routeFraction = Number(candidate.route_fraction ?? 0);
      const routeKm = Number(((routeFraction * lengthM) / 1000).toFixed(1));
      const rejectionReasons = rejectionById.get(candidate.id);
      const rankedCandidate = rankedById.get(candidate.id);
      let status: SimulatorCandidateOutcome['status'];
      let reasons: string[] = [];

      if (spoke && selectedCandidateId === candidate.id) {
        status = 'selected';
      } else if (rejectionReasons) {
        status = 'rejected';
        reasons = [...rejectionReasons];
      } else {
        status = 'not_selected';
        if (spoke) {
          reasons = ['lower ranked than selected candidate'];
        } else if (silenceReasons.length) {
          reasons = [...silenceReasons];
        } else if (decision.rankedCandidates[0] && decision.rankedCandidates[0].id !== candidate.id) {
          reasons = ['lower ranked than top eligible candidate'];
        } else {
          reasons = ['not selected'];
        }
      }

      if (status !== 'selected') {
        reasons.forEach(reason => incrementCounter(rejectionReasonCounts, reason));
      }

      const tracker = candidateTrackers.get(candidate.id)!;

      if (tracker.firstSeenKm === -1) tracker.firstSeenKm = decisionApproxKm;
      tracker.lastSeenKm = decisionApproxKm;
      tracker.timesConsidered += 1;
      if (!rejectionReasons) tracker.timesEligible += 1;
      if (status === 'selected') {
        tracker.triggered = true;
      } else {
        reasons.forEach(reason => incrementCounter(tracker.skipReasonCounts, reason));
      }

      return {
        id: candidate.id,
        title: candidate.title,
        category: candidate.category,
        distanceM: Number(candidate.distance_m),
        routeFraction: Number(routeFraction.toFixed(4)),
        routeKm,
        status,
        evaluationState: status === 'selected' ? 'TRIGGERED' : classifySkipReason(reasons[0]),
        reasons,
        score: rankedCandidate ? Number(rankedCandidate.score.toFixed(4)) : undefined,
      };
    });

    if (includeStepDiagnostics) {
      stepDiagnostics.push({
        decisionIndex,
        decisionRouteFraction: Number(fraction.toFixed(4)),
        decisionApproxKm,
        minutesSinceLastInteraction: Number(minutesSinceLast.toFixed(2)),
        windowCandidates: windowCandidates.length,
        eligibleCandidates: decision.rankedCandidates.length,
        shouldSpeak: decision.shouldSpeak,
        spoke,
        silenceReasons,
        selectedCandidate: spoke && decision.recommendation
          ? {
            id: decision.recommendation.id,
            title: decision.recommendation.title,
            category: decision.recommendation.category,
            score: Number(decision.recommendation.score.toFixed(4)),
          }
          : undefined,
        candidateOutcomes,
      });
    }

    decisionIndex += 1;
    return { spoke, forcedNextFraction };
  }

  while (currentFraction <= 1) {
    const { spoke, forcedNextFraction } = await evaluateDecision(currentFraction);

    if (spoke && forcedNextFraction !== undefined) {
      currentFraction = Math.max(currentFraction + decisionStepFraction, forcedNextFraction);
      continue;
    }

    currentFraction += decisionStepFraction;
  }

  // Final-approach decision opportunity (Handoff v2.4 §41 scenario 5): the
  // main loop above can exit with candidates near the destination never
  // having entered a single decision window, if the last narration's
  // cooldown jump lands past route fraction 1. Guarantee one last decision
  // pass anchored at the route end so those candidates are at minimum
  // evaluated (and, for destination-mode content, may actually trigger via
  // the cooldown bypass in engine.ts) rather than silently disappearing from
  // diagnostics.
  if (lastEvaluatedFraction < 1) {
    await evaluateDecision(1);
  }

  const categoryDistribution = Object.fromEntries(
    [...categoryCounts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    }),
  );

  const neverTriggeredCandidates: SimulatorNeverTriggeredCandidate[] = [...candidateTrackers.values()]
    .filter(candidate => !candidate.triggered)
    .map(candidate => {
      const topSkipReasons = mapToSortedCounts(candidate.skipReasonCounts).slice(0, 5);
      const evaluationState: EvaluationState = candidate.timesConsidered === 0
        ? 'ELIGIBLE_BUT_NOT_EVALUATED'
        : classifySkipReason(topSkipReasons[0]?.reason);

      return {
        id: candidate.id,
        title: candidate.title,
        category: candidate.category,
        distanceM: Number(candidate.distanceM.toFixed(1)),
        routeFraction: Number(candidate.routeFraction.toFixed(4)),
        routeKm: Number(candidate.routeKm.toFixed(1)),
        firstSeenKm: candidate.firstSeenKm === -1 ? candidate.routeKm : Number(candidate.firstSeenKm.toFixed(1)),
        lastSeenKm: candidate.lastSeenKm === -1 ? candidate.routeKm : Number(candidate.lastSeenKm.toFixed(1)),
        timesConsidered: candidate.timesConsidered,
        timesEligible: candidate.timesEligible,
        evaluationState,
        topSkipReasons,
      };
    })
    .sort((a, b) => {
      if (a.firstSeenKm !== b.firstSeenKm) return a.firstSeenKm - b.firstSeenKm;
      return b.timesConsidered - a.timesConsidered;
    });

  return {
    routeLengthKm,
    events,
    diagnostics: {
      categoryDistribution,
      rejectionReasonCounts: mapToSortedCounts(rejectionReasonCounts),
      neverTriggeredCandidates,
      duplicateCandidates,
      stepDiagnostics: includeStepDiagnostics ? stepDiagnostics : undefined,
    },
  };
}

