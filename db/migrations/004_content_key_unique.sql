-- Recommendation Engine V2.1 / migration 004
-- Ensures content_key is the actual conflict target used by the importer.
-- Safe to run on an existing database.

BEGIN;

ALTER TABLE content
  ADD COLUMN IF NOT EXISTS content_key TEXT;

-- Recompute keys using the exact same canonical representation as the importer.
-- This is intentionally MD5 because content_key is an identity/deduplication key,
-- not a security credential.
WITH english AS (
  SELECT DISTINCT ON (content_id)
         content_id,
         title
  FROM content_translations
  WHERE language = 'en'
  ORDER BY content_id
), keys AS (
  SELECT
    c.id,
    md5(
      concat_ws('|',
        lower(trim(e.title)),
        coalesce(c.source_url, c.source_name),
        to_char(round(ST_X(c.location)::numeric, 6), 'FM999999990.000000'),
        to_char(round(ST_Y(c.location)::numeric, 6), 'FM999999990.000000')
      )
    ) AS content_key
  FROM content c
  JOIN english e ON e.content_id = c.id
)
UPDATE content c
SET content_key = k.content_key,
    updated_at = now()
FROM keys k
WHERE c.id = k.id;

-- If an old importer created duplicates, keep the best verified/active/newest row.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY content_key
      ORDER BY verified DESC, active DESC, updated_at DESC, id DESC
    ) AS rn
  FROM content
  WHERE content_key IS NOT NULL
), duplicates AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM content c
USING duplicates d
WHERE c.id = d.id;

-- The importer uses: ON CONFLICT (content_key)
-- Therefore this unique index MUST exist.
DROP INDEX IF EXISTS content_content_key_uidx;
CREATE UNIQUE INDEX content_content_key_uidx
  ON content(content_key);

COMMIT;
