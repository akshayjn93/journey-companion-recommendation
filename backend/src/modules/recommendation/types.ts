import type { ContentCandidate } from '../content/repository.js';
import type { CandidateContext } from './location.js';

export type RankingContext = {
  interests: string[];
  alreadyPlayed: string[];
  minutesSinceLastInteraction: number;
  previousCategories?: string[];
  currentRouteFraction?: number;
};

export type CandidateRejection = {
  id: string;
  title: string;
  reasons: string[];
};

export type CandidateNarration = {
  headline: string;
  summary: string;
  cue: string;
};

export type ScoredCandidate = ContentCandidate & {
  score: number;
  scoreBreakdown: {
    interestingness: number;
    interestMatch: number;
    sourceConfidence: number;
    proximity: number;
    novelty: number;
    categoryDiversity: number;
    aheadOfTraveller: number;
  };
  routePosition?: {
    routeFraction: number;
    aheadDistanceM: number;
  };
  candidateContext?: CandidateContext;
  narration?: CandidateNarration;
  reasons: string[];
};

export type RecommendationResult = {
  shouldSpeak: boolean;
  recommendation: ScoredCandidate | null;
  rankedCandidates: ScoredCandidate[];
  candidatesConsidered: number;
  rejectedCandidates: CandidateRejection[];
  reasons: string[];
};

// --- Evaluation-state diagnostics (Handoff v2.4 §40.2A) --------------------
//
// The original "never triggered" reporting collapsed every non-selected
// candidate into one bucket. That made it impossible to tell "this was
// evaluated, scored, and lost to something better" apart from "this was
// never even looked at because the journey ended first" (the Muzaffarnagar
// sugar-industry finding). These states make that distinction explicit.
export type EvaluationState =
  | 'TRIGGERED'
  | 'CONSIDERED_BUT_LOST'
  | 'ELIGIBLE_BUT_NOT_EVALUATED'
  | 'OUTSIDE_TRIGGER_WINDOW'
  | 'REJECTED_BY_COOLDOWN'
  | 'REJECTED_BY_ROUTE_CONSTRAINT'
  | 'REJECTED_BY_DETOUR_COST'
  | 'REJECTED_BY_QUALITY';

/**
 * Maps a single skip/rejection reason string (as produced by
 * engine.ts/simulator.ts) to an EvaluationState. Used to classify both a
 * single decision-pass outcome and the aggregated "top reason" for a
 * candidate that was never triggered across a whole simulated journey.
 *
 * `REJECTED_BY_DETOUR_COST` has no producer yet — detour-cost evaluation is
 * not implemented (Handoff v2.6 explicitly defers detour optimization) — it
 * is reserved here so callers can already branch on it.
 */
export function classifySkipReason(reason: string | undefined): EvaluationState {
  if (!reason) return 'CONSIDERED_BUT_LOST';

  if (reason.startsWith('narration cooldown') || reason === 'trigger point violates minimum spacing from last narration') {
    return 'REJECTED_BY_COOLDOWN';
  }
  if (reason === 'candidate is behind the traveller' || reason === 'candidate is too far ahead') {
    return 'OUTSIDE_TRIGGER_WINDOW';
  }
  if (reason === 'no eligible candidate in the current decision window') {
    return 'OUTSIDE_TRIGGER_WINDOW';
  }
  if (
    reason.startsWith('interestingness below') ||
    reason.startsWith('source confidence below') ||
    reason === 'not family friendly' ||
    reason === 'already played' ||
    reason === 'best candidate score is below speech threshold'
  ) {
    return 'REJECTED_BY_QUALITY';
  }
  if (reason === 'lower ranked than selected candidate' || reason === 'lower ranked than top eligible candidate') {
    return 'CONSIDERED_BUT_LOST';
  }

  return 'CONSIDERED_BUT_LOST';
}

