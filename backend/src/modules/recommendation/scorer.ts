import type { ContentCandidate } from '../content/repository.js';
import { RECOMMENDATION_CONFIG } from './config.js';
import { deriveCandidateContext, type CandidateContext } from './location.js';
import type { RankingContext, ScoredCandidate } from './types.js';

const normalize = (value: string) => value.trim().toLowerCase();

function scoreInterestMatch(candidate: ContentCandidate, interests: string[]) {
  if (!interests.length || !candidate.tags.length) return 0;
  const wanted = new Set(interests.map(normalize));
  const matches = candidate.tags.filter(tag => wanted.has(normalize(tag))).length;
  return Math.min(1, matches / Math.min(2, Math.max(1, wanted.size)));
}

function scoreProximity(distanceMeters: number) {
  return Math.max(0, 1 - distanceMeters / RECOMMENDATION_CONFIG.proximityReferenceMeters);
}

function scoreAhead(candidateContext: CandidateContext) {
  if (candidateContext.routeDistanceM === undefined) return 0.5;

  const aheadMeters = candidateContext.routeDistanceM;
  if (aheadMeters < 0) {
    // Behind the traveller: possible only within the small grace distance handled
    // by eligibility; scoring still penalises it heavily.
    return 0;
  }

  const { preferredAheadMinMeters, preferredAheadMaxMeters, maximumAheadMeters } = RECOMMENDATION_CONFIG;

  if (aheadMeters >= preferredAheadMinMeters && aheadMeters <= preferredAheadMaxMeters) {
    return 1;
  }

  if (aheadMeters < preferredAheadMinMeters) {
    return Math.max(0.45, aheadMeters / preferredAheadMinMeters);
  }

  if (aheadMeters <= maximumAheadMeters) {
    const span = maximumAheadMeters - preferredAheadMaxMeters;
    return Math.max(0.2, 1 - (aheadMeters - preferredAheadMaxMeters) / span);
  }

  return 0;
}

function scoreCategoryDiversity(candidate: ContentCandidate, previousCategories: string[]) {
  if (!previousCategories.length) return 1;
  const recent = previousCategories.slice(-2).map(normalize);
  return recent.includes(normalize(candidate.category)) ? 0.25 : 1;
}

function buildNarrationPreview(candidate: ContentCandidate) {
  const title = candidate.title.trim();
  const baseFact = candidate.long_description?.trim() || candidate.short_description?.trim() || candidate.narration_hint?.trim() || 'This stop adds context to the road ahead.';
  const cue = candidate.narration_hint?.trim() || `Short ${candidate.category} note along the route.`;
  // Cue is surfaced separately (e.g. a UI "Cue:" line) — don't also embed it
  // in the narrated summary, otherwise the same sentence gets said/shown twice.
  const summary = `${title}. ${baseFact}`.replace(/\s+/g, ' ').trim();

  return {
    headline: title,
    cue,
    summary,
  };
}

export function scoreCandidate(candidate: ContentCandidate, ctx: RankingContext): ScoredCandidate {
  const alreadyPlayed = new Set(ctx.alreadyPlayed);
  const candidateContext = deriveCandidateContext(candidate, ctx.currentRouteFraction);
  const aheadOfTraveller = scoreAhead(candidateContext);

  const breakdown = {
    interestingness: Math.max(0, Math.min(1, candidate.interestingness / 10)),
    interestMatch: scoreInterestMatch(candidate, ctx.interests),
    sourceConfidence: candidate.confidence,
    proximity: scoreProximity(candidateContext.distanceFromUserM),
    novelty: alreadyPlayed.has(candidate.id) ? 0 : 1,
    categoryDiversity: scoreCategoryDiversity(candidate, ctx.previousCategories ?? []),
    aheadOfTraveller,
  };

  const w = RECOMMENDATION_CONFIG.weights;
  const score =
    w.interestingness * breakdown.interestingness +
    w.interestMatch * breakdown.interestMatch +
    w.sourceConfidence * breakdown.sourceConfidence +
    w.proximity * breakdown.proximity +
    w.novelty * breakdown.novelty +
    w.categoryDiversity * breakdown.categoryDiversity +
    w.aheadOfTraveller * breakdown.aheadOfTraveller;

  const routePosition = candidate.route_fraction !== undefined && ctx.currentRouteFraction !== undefined
    ? {
        routeFraction: candidate.route_fraction,
        aheadDistanceM: Number(Math.max(0, candidateContext.routeDistanceM ?? 0).toFixed(1)),
      }
    : undefined;

  const reasons: string[] = [];
  if (breakdown.interestingness >= 0.8) reasons.push('high-interest content');
  if (breakdown.interestMatch > 0) reasons.push('matches traveller interests');
  if (routePosition && routePosition.aheadDistanceM >= RECOMMENDATION_CONFIG.preferredAheadMinMeters &&
      routePosition.aheadDistanceM <= RECOMMENDATION_CONFIG.preferredAheadMaxMeters) {
    reasons.push('well ahead of the traveller for a natural introduction');
  } else if (breakdown.proximity >= 0.75) {
    reasons.push('very close to the route');
  } else if (breakdown.proximity >= 0.4) {
    reasons.push('near the route');
  }
  if (breakdown.categoryDiversity === 1) reasons.push('adds category variety');
  if (breakdown.sourceConfidence >= 0.9) reasons.push('high-confidence source');
  if (!reasons.length) reasons.push('best available candidate');

  return {
    ...candidate,
    score: Number(score.toFixed(4)),
    scoreBreakdown: breakdown,
    routePosition,
    candidateContext,
    narration: buildNarrationPreview(candidate),
    reasons,
  };
}
