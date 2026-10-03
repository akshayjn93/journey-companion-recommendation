/**
 * Import curated production content into PostgreSQL.
 *
 * Usage:
 *   npm run import-content
 *   npm run import-content -- path/to/content.json
 *   npm run import-content -- path/to/content.json --pending
 *
 * Imports are idempotent by content_key. Re-running the same file updates the
 * existing story and its translations instead of creating another UUID row.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { db } from '../src/common/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

type Translation = {
  title: string;
  shortDescription: string;
  longDescription?: string;
  narrationHint?: string;
};

type ContentRecord = {
  category: string;
  tags: string[];
  location: { lng: number; lat: number };
  interestingness: number;
  confidence: number;
  sourceName: string;
  sourceUrl?: string;
  familyFriendly?: boolean;
  editorialScore?: number;
  storyType?: 'verified_fact' | 'local_tradition';
  translations: { en: Translation; [lang: string]: Translation | undefined };
};

function stableUuid(input: string): string {
  const bytes = createHash('sha256').update(input).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildContentKey(rec: ContentRecord): string {
  // IMPORTANT: this must stay in sync with db/migrations/003_content_key_and_dedupe.sql.
  // We store a compact hash so the key is deterministic, index-friendly, and does not
  // depend on the length of a title/source URL.
  const canonical = [
    rec.translations.en.title.trim().toLowerCase(),
    rec.sourceUrl ?? rec.sourceName,
    rec.location.lng.toFixed(6),
    rec.location.lat.toFixed(6),
  ].join('|');

  return createHash('md5').update(canonical).digest('hex');
}

async function main() {
  const args = process.argv.slice(2);
  const pending = args.includes('--pending');
  const fileArg = args.find(arg => !arg.startsWith('--'));
  const filePath = fileArg ?? resolve(__dirname, '../../delhi-nainital-content-v1.json');

  let records: ContentRecord[];
  try {
    records = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    console.error(`Could not read file: ${filePath}`);
    process.exit(1);
  }

  if (!Array.isArray(records) || records.length === 0) {
    console.error('File must contain a non-empty JSON array.');
    process.exit(1);
  }

  const reviewStatus = pending ? 'pending' : 'verified';
  const verified = !pending;

  console.log(`\nImporting ${records.length} records from:\n  ${filePath}`);
  console.log(`Mode: ${pending ? 'PENDING REVIEW' : 'VERIFIED CURATED CONTENT'}`);
  console.log('Identity: content_key (idempotent)\n');

  const client = await db.connect();
  let upserted = 0;

  try {
    await client.query('BEGIN');

    for (const rec of records) {
      if (!rec.translations?.en?.title) {
        console.warn(`  ⚠  Skipping record with no English title (category: ${rec.category})`);
        continue;
      }

      const contentKey = buildContentKey(rec);
      const id = stableUuid(contentKey);

      // Do not depend on an ON CONFLICT inference target here. Older databases
      // may have content_key but not yet have the unique index from migration 004.
      // The import runs in one transaction, so an explicit lookup + UPDATE/INSERT
      // is deterministic and lets the importer work during schema rollout too.
      const existing = await client.query<{ id: string }>(
        `SELECT id
           FROM content
          WHERE content_key = $1
          ORDER BY verified DESC, active DESC, updated_at DESC, id DESC
          LIMIT 1
          FOR UPDATE`,
        [contentKey],
      );

      let contentId: string;

      if (existing.rowCount) {
        contentId = existing.rows[0].id;

        await client.query(
          `UPDATE content
              SET category = $2,
                  tags = $3,
                  location = ST_SetSRID(ST_Point($4,$5),4326),
                  interestingness = $6,
                  confidence = $7,
                  source_name = $8,
                  source_url = $9,
                  family_friendly = $10,
                  review_status = $11,
                  verified = $12,
                  editorial_score = $13,
                  story_type = $14,
                  rejection_reason = NULL,
                  updated_at = now()
            WHERE id = $1`,
          [
            contentId,
            rec.category,
            rec.tags ?? [],
            rec.location.lng,
            rec.location.lat,
            rec.interestingness,
            rec.confidence,
            rec.sourceName,
            rec.sourceUrl ?? null,
            rec.familyFriendly ?? true,
            reviewStatus,
            verified,
            rec.editorialScore ?? null,
            rec.storyType ?? 'verified_fact',
          ],
        );
      } else {
        contentId = id;

        await client.query(
          `INSERT INTO content
             (id, content_key, category, tags, location, interestingness, confidence,
              source_name, source_url, family_friendly, review_status, verified, rejection_reason,
              editorial_score, story_type, updated_at)
           VALUES
             ($1,$2,$3,$4,ST_SetSRID(ST_Point($5,$6),4326),$7,$8,$9,$10,$11,$12,$13,NULL,$14,$15,now())`,
          [
            contentId,
            contentKey,
            rec.category,
            rec.tags ?? [],
            rec.location.lng,
            rec.location.lat,
            rec.interestingness,
            rec.confidence,
            rec.sourceName,
            rec.sourceUrl ?? null,
            rec.familyFriendly ?? true,
            reviewStatus,
            verified,
            rec.editorialScore ?? null,
            rec.storyType ?? 'verified_fact',
          ],
        );
      }

      upserted++;

      for (const [lang, tx] of Object.entries(rec.translations)) {
        if (!tx) continue;
        await client.query(
          `INSERT INTO content_translations
             (content_id, language, title, short_description, long_description, narration_hint)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (content_id, language) DO UPDATE SET
             title = EXCLUDED.title,
             short_description = EXCLUDED.short_description,
             long_description = EXCLUDED.long_description,
             narration_hint = EXCLUDED.narration_hint`,
          [contentId, lang, tx.title, tx.shortDescription, tx.longDescription ?? null, tx.narrationHint ?? null],
        );
      }

      console.log(`  ✓  [${rec.category.padEnd(12)}] ${rec.translations.en.title}`);
    }

    await client.query('COMMIT');
    console.log(`\n✓ Import complete — ${upserted} content records upserted.\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✗ Import failed, transaction rolled back.\n', err);
    process.exit(1);
  } finally {
    client.release();
    await db.end();
  }
}

main();
