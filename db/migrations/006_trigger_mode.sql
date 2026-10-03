-- Recommendation Engine V2 / migration 006
-- Handoff v2.4 §40.2A "New product capability direction: multi-mode story
-- triggering". Additive only — does NOT change ranking/scoring by itself.
--
-- trigger_mode classifies *how* a content item should be surfaced relative to
-- the traveller's route position:
--   roadside              - traveller is physically approaching/passing it (default,
--                            identical behaviour to all existing content)
--   ahead_recommendation   - a useful/interesting place further ahead on the route
--   area_context           - context for a town/region being approached/entered
--   destination             - context associated with the journey's destination
--   detour_recommendation   - worthwhile place that is not directly on the route
--
-- Existing rows default to 'roadside', so current behaviour is unchanged
-- until content is explicitly authored/tagged with a different mode.

BEGIN;

ALTER TABLE content
  ADD COLUMN IF NOT EXISTS trigger_mode TEXT NOT NULL DEFAULT 'roadside'
    CHECK (trigger_mode IN (
      'roadside',
      'ahead_recommendation',
      'area_context',
      'destination',
      'detour_recommendation'
    ));

CREATE INDEX IF NOT EXISTS content_trigger_mode_idx ON content(trigger_mode);

COMMIT;
