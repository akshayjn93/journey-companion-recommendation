import type { ContentCandidate } from '../content/repository.js';
import { RECOMMENDATION_CONFIG } from './config.js';
import { scoreCandidate } from './scorer.js';
import type { CandidateContext } from './location.js';
import type { CandidateRejection, RankingContext, RecommendationResult, ScoredCandidate } from './types.js';

export class RecommendationEngine {
  private eligibility(candidate: ContentCandidate, context: RankingContext): string[] {
    const reasons: string[] = [];
    const played = new Set(context.alreadyPlayed);

    if (!candidate.family_friendly) reasons.push('not family friendly');
    if (played.has(candidate.id)) reasons.push('already played');
    // Handoff v2.7 "Important MVP decision: no ranking yet": interestingness is
    // no longer required/used for eligibility - new content doesn't need it,
    // and it must not act as a hidden quality gate. Source confidence remains
    // a provenance/trust check (not a ranking weight), so it still applies.
    if (candidate.confidence < RECOMMENDATION_CONFIG.minimumSourceConfidence) {
      reasons.push(`source confidence below ${RECOMMENDATION_CONFIG.minimumSourceConfidence}`);
    }

    // One simple pacing/timing window applies to every candidate (Handoff
    // v2.6 §40.2A: "one simple pacing/timing layer, not multiple trigger
    // modes"). Route position is optional supporting context - this whole
    // block is skipped when it isn't available.
    if (context.currentRouteFraction !== undefined && candidate.route_fraction !== undefined) {
      const aheadMeters = (candidate.route_fraction - context.currentRouteFraction) * (candidate.route_length_m ?? 0);
      if (aheadMeters < -RECOMMENDATION_CONFIG.maximumBehindMeters) {
        reasons.push('candidate is behind the traveller');
      }
      if (aheadMeters > RECOMMENDATION_CONFIG.maximumAheadMeters) {
        reasons.push('candidate is too far ahead');
      }
    }

    return reasons;
  }


  // Handoff v2.7 "Candidate ordering for MVP": ordering is based on the
  // candidate's relationship to the traveller's current location, not a
  // weighted quality score. A candidate positioned within the preferred
  // "ahead of traveller" window (see config.ts) is treated as a natural
  // introduction and preferred over one that is merely closer but poorly
  // timed (e.g. almost alongside the traveller); ties are broken by plain
  // distance from the traveller's current location, then deterministically
  // by id. `scoreCandidate()` still runs (existing scorer code is kept for
  // historical/reference purposes and diagnostics), but `.score` is not used
  // to decide the winner.
  private isWithinPreferredAheadWindow(candidateContext?: CandidateContext): boolean {
    if (!candidateContext || candidateContext.routeDistanceM === undefined) return false;
    return (
      candidateContext.routeDistanceM >= RECOMMENDATION_CONFIG.preferredAheadMinMeters &&
      candidateContext.routeDistanceM <= RECOMMENDATION_CONFIG.preferredAheadMaxMeters
    );
  }

  private compareByLocation(a: ScoredCandidate, b: ScoredCandidate): number {
    const aPreferred = this.isWithinPreferredAheadWindow(a.candidateContext);
    const bPreferred = this.isWithinPreferredAheadWindow(b.candidateContext);
    if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;

    const aDist = a.candidateContext?.distanceFromUserM ?? a.distance_m;
    const bDist = b.candidateContext?.distanceFromUserM ?? b.distance_m;
    if (aDist !== bDist) return aDist - bDist;

    return a.id.localeCompare(b.id);
  }

  rank(candidates: ContentCandidate[], context: RankingContext): ScoredCandidate[] {
    return candidates
      .filter(candidate => this.eligibility(candidate, context).length === 0)
      .map(candidate => scoreCandidate(candidate, context))
      .sort((a, b) => this.compareByLocation(a, b));
  }

  explainRejections(candidates: ContentCandidate[], context: RankingContext): CandidateRejection[] {
    return candidates
      .map(candidate => ({ id: candidate.id, title: candidate.title, reasons: this.eligibility(candidate, context) }))
      .filter(item => item.reasons.length > 0);
  }

  recommend(candidates: ContentCandidate[], context: RankingContext): RecommendationResult {
    const rankedCandidates = this.rank(candidates, context);
    const rejectedCandidates = this.explainRejections(candidates, context);
    const best = rankedCandidates[0] ?? null;

    // A single, uniform cooldown/pacing gate applies regardless of what the
    // best candidate is (Handoff v2.6 §40.2A: "one simple pacing/timing
    // layer, not multiple trigger modes" - no per-content bypass rules).
    const cooldownActive = context.minutesSinceLastInteraction < RECOMMENDATION_CONFIG.defaultMinGapMinutes;

    if (cooldownActive) {
      return {
        shouldSpeak: false,
        recommendation: null,
        rankedCandidates,
        candidatesConsidered: candidates.length,
        rejectedCandidates,
        reasons: [`narration cooldown: ${RECOMMENDATION_CONFIG.defaultMinGapMinutes} minutes`],
      };
    }

    if (!best) {
      return {
        shouldSpeak: false,
        recommendation: null,
        rankedCandidates,
        candidatesConsidered: candidates.length,
        rejectedCandidates,
        reasons: ['no eligible candidate in the current decision window'],
      };
    }

    // Handoff v2.7: no minimum-score speech gate. Eligibility (active,
    // verified/confidence, family-friendly, not-already-played) and the
    // ahead/behind + cooldown pacing above are the only gates for the MVP -
    // a weighted quality score is not used to decide whether to speak.
    return {
      shouldSpeak: true,
      recommendation: best,
      rankedCandidates,
      candidatesConsidered: candidates.length,
      rejectedCandidates,
      reasons: best.reasons,
    };
  }
}

export const recommendationEngine = new RecommendationEngine();
