-- Migration: split confidence into trustworthiness score + formal verification fields
--
-- Context: the original `confidence` column (0–1 numeric) was doing two jobs:
--   1. How trustworthy/accurate the source is (editorial judgement, 0–1)
--   2. Whether the item has been formally verified by a human reviewer
--
-- This migration separates them cleanly.
--
-- Status: NOT YET APPLIED — run this after the v1 content import is stable.
-- Apply with: docker exec -i <db-container> psql -U journey -d journey -f /path/to/this/file
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Rename existing confidence → source_confidence (keeps the 0–1 trustworthiness score)
ALTER TABLE content RENAME COLUMN confidence TO source_confidence;

-- 2. Add source_type — describes where the fact came from, which informs trust level
ALTER TABLE content ADD COLUMN IF NOT EXISTS source_type TEXT
  CHECK (source_type IN ('official', 'academic', 'news', 'wiki', 'community', 'placeholder'))
  DEFAULT 'placeholder';

-- 3. Add verified_at — timestamp of when a human reviewer formally approved this item
--    NULL means not yet formally verified (even if review_status = 'verified')
ALTER TABLE content ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- 4. Backfill verified_at from existing review_status where possible
UPDATE content SET verified_at = updated_at WHERE review_status = 'verified';

-- 5. Backfill source_type for existing seed data
UPDATE content SET source_type = 'placeholder' WHERE source_name LIKE 'PLACEHOLDER%';

COMMIT;
