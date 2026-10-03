-- Recommendation Engine V2 / migration 005
-- Phase 3 (Journey Playback / Editorial Review roadmap): lightweight story
-- quality metadata, additive only. Does NOT change ranking/scoring — see
-- backend/src/modules/recommendation/scorer.ts, which is untouched.
--
-- editorial_score: human-curated "is this actually a good travel-companion
--   story" score (0-10), independent of the source-fact `interestingness`
--   rating. Nullable — most content has not been editorially reviewed yet.
--
-- story_type: distinguishes a sourced/verified fact from a local tradition
--   presented as tradition rather than established fact (several existing
--   narration_hints already make this distinction in free text, e.g. the
--   Puth/Mahabharata and Kaseri-mound-archaeology stories). Formalizing this
--   lets future narration (Phase 4) reliably hedge language for the latter.

BEGIN;

ALTER TABLE content
  ADD COLUMN IF NOT EXISTS editorial_score NUMERIC(4,2)
    CHECK (editorial_score IS NULL OR (editorial_score >= 0 AND editorial_score <= 10)),
  ADD COLUMN IF NOT EXISTS story_type TEXT NOT NULL DEFAULT 'verified_fact'
    CHECK (story_type IN ('verified_fact', 'local_tradition'));

COMMIT;
