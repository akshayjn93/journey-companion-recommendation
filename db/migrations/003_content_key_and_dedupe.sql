-- Recommendation Engine V2.1
-- Stable content identity + one-time cleanup of duplicate imported stories.
-- Safe to run once after the existing content tables exist.

BEGIN;

ALTER TABLE content
  ADD COLUMN IF NOT EXISTS content_key TEXT;

-- Build the same stable identity used by the importer from the English title,
-- source identity, and rounded coordinates.
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
WHERE c.id = k.id
  AND c.content_key IS DISTINCT FROM k.content_key;

-- Keep the best copy when older imports created duplicates.
-- Priority: verified > active > newest update > stable UUID.
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

CREATE UNIQUE INDEX IF NOT EXISTS content_content_key_uidx
  ON content(content_key);


COMMIT;
