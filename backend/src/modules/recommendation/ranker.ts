import type { ContentCandidate } from '../content/repository.js';
import { recommendationEngine } from './engine.js';
import type { RankingContext } from './types.js';

/** Backwards-compatible wrapper used by existing journey code. */
export type { RankingContext };

export function rankCandidates(candidates: ContentCandidate[], ctx: RankingContext) {
  return recommendationEngine.rank(candidates, ctx);
}
