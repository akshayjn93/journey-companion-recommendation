CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS journeys (
  id UUID PRIMARY KEY,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  interests TEXT[] NOT NULL DEFAULT '{}',
  language TEXT NOT NULL DEFAULT 'en',
  route_geometry geometry(LineString, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content (
  id UUID PRIMARY KEY,
  content_key TEXT,
  category TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  location geometry(Point, 4326) NOT NULL,
  interestingness NUMERIC(4,2) NOT NULL CHECK (interestingness >= 0 AND interestingness <= 10),
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_name TEXT NOT NULL,
  source_url TEXT,
  -- review_status drives the verification pipeline: pending → verified | rejected
  -- Only verified items are served to travellers (verified boolean is kept in sync).
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'verified', 'rejected')),
  rejection_reason TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  family_friendly BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  -- Phase 3 story-quality metadata (see migration 005). Additive only, not
  -- used by the recommendation scorer.
  editorial_score NUMERIC(4,2)
    CHECK (editorial_score IS NULL OR (editorial_score >= 0 AND editorial_score <= 10)),
  story_type TEXT NOT NULL DEFAULT 'verified_fact'
    CHECK (story_type IN ('verified_fact', 'local_tradition')),
  -- Phase 4 multi-mode triggering (see migration 006). Additive only.
  trigger_mode TEXT NOT NULL DEFAULT 'roadside'
    CHECK (trigger_mode IN (
      'roadside', 'ahead_recommendation', 'area_context', 'destination', 'detour_recommendation'
    )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Language-specific text for each content item.
-- English ('en') is required; other languages are optional and fall back to 'en'.
CREATE TABLE IF NOT EXISTS content_translations (
  content_id        UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  language          TEXT NOT NULL,
  title             TEXT NOT NULL,
  short_description TEXT NOT NULL,
  long_description  TEXT,
  narration_hint    TEXT,
  PRIMARY KEY (content_id, language)
);

CREATE UNIQUE INDEX IF NOT EXISTS content_content_key_uidx ON content(content_key);
CREATE INDEX IF NOT EXISTS content_location_idx      ON content USING GIST(location);
CREATE INDEX IF NOT EXISTS content_category_idx      ON content(category);
CREATE INDEX IF NOT EXISTS content_review_status_idx ON content(review_status);
CREATE INDEX IF NOT EXISTS content_trigger_mode_idx  ON content(trigger_mode);
CREATE INDEX IF NOT EXISTS content_translations_lang_idx ON content_translations(language);

CREATE TABLE IF NOT EXISTS journey_events (
  id BIGSERIAL PRIMARY KEY,
  journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  content_id UUID REFERENCES content(id),
  event_type TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
