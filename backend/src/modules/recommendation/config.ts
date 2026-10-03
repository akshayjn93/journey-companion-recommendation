export const RECOMMENDATION_CONFIG = {
  // Handoff v2.7 "Important MVP decision: no ranking yet": these weights and
  // minimumScoreToSpeak/minimumInterestingness are kept only so the existing
  // scorer.ts/engine.ts historical scoring code keeps compiling and can be
  // revisited in the future ranking phase - the active MVP eligibility/
  // ordering path in engine.ts does not read minimumInterestingness or
  // minimumScoreToSpeak, and does not use `weights` to pick a winner.
  weights: {
    interestingness: 0.30,
    interestMatch: 0.20,
    sourceConfidence: 0.15,
    proximity: 0.10,
    novelty: 0.10,
    categoryDiversity: 0.10,
    aheadOfTraveller: 0.05,
  },

  minimumInterestingness: 6.5,
  minimumSourceConfidence: 0.70,
  minimumScoreToSpeak: 0.58,

  defaultMinGapMinutes: 5,

  // --- Location-first retrieval (Handoff v2.6 §40.2A) ----------------------
  //
  // Candidates are searched for around the traveller's current location, not
  // filtered through separate windows per content "mode". Start narrow and
  // widen the search only when the candidate pool is sparse - this is a
  // retrieval boundary, not a narration trigger rule.
  preferredSearchRadiusMeters: 10000,
  expandedSearchRadiusMeters: 15000,
  maxSearchRadiusMeters: 25000,
  sparseCandidateThreshold: 3,

  // Single generic pacing/eligibility window. Applies uniformly to every
  // candidate - v2.6 explicitly rules out multiple trigger windows per
  // content type ("one simple pacing/timing layer, not multiple trigger
  // modes").
  preferredAheadMinMeters: 800,
  preferredAheadMaxMeters: 3000,
  maximumAheadMeters: 10000,
  // How far behind the traveller a candidate can be and still be spoken.
  // Kept deliberately larger than a single decision step: when several
  // candidates cluster at the same stop, only one is picked per decision
  // window (Handoff v2.7 follow-up) - the rest fall "behind" almost
  // immediately as the traveller keeps moving. A wide behind window lets
  // those runner-up candidates stay eligible and resurface in a later,
  // quieter decision window (filling silence) instead of being discarded
  // forever the moment a cluster-mate wins. It is still bounded, so
  // long-since-passed content does not resurface indefinitely.
  maximumBehindMeters: 6000,

  // If a candidate is very close, allow it to be selected, but don't let
  // proximity overwhelm a genuinely better story further ahead.
  veryCloseMeters: 500,
  proximityReferenceMeters: 3000,
} as const;

