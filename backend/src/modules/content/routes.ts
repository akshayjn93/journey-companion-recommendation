import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../../common/db.js';

// ---------------------------------------------------------------------------
// Admin auth
// ---------------------------------------------------------------------------
// Guards the review/editorial endpoints with a shared-secret header. If
// ADMIN_API_KEY is not set (e.g. local docker-compose dev), the check is
// skipped so local workflows are unaffected. Set ADMIN_API_KEY once this
// backend is deployed somewhere publicly reachable (e.g. Render).
async function requireAdminKey(request: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return;
  const provided = request.headers['x-admin-key'];
  if (provided !== expected) {
    return reply.code(401).send({ error: 'unauthorized: missing or invalid x-admin-key header' });
  }
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const TranslationFields = z.object({
  title:            z.string().min(1),
  shortDescription: z.string().min(1),
  longDescription:  z.string().optional(),
  narrationHint:    z.string().optional(),
});

const SubmitContent = z.object({
  category:       z.string().min(1),
  tags:           z.array(z.string()).default([]),
  location: z.object({
    lng: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90),
  }),
  interestingness: z.number().min(0).max(10),
  confidence:      z.number().min(0).max(1),
  sourceName:      z.string().min(1),
  sourceUrl:       z.string().url().optional(),
  familyFriendly:  z.boolean().default(true),
  // Phase 3 story-quality metadata: additive, not used by the scorer.
  editorialScore:  z.number().min(0).max(10).optional(),
  storyType:       z.enum(['verified_fact', 'local_tradition']).default('verified_fact'),
  // English is required; additional languages are optional.
  translations: z.object({
    en: TranslationFields,
    hi: TranslationFields.optional(),
  }).passthrough(),
});

// A reviewer can approve, reject (reason required), or requeue back to pending.
const ReviewDecision = z.discriminatedUnion('status', [
  z.object({ status: z.literal('verified') }),
  z.object({ status: z.literal('rejected'), rejectionReason: z.string().min(1) }),
  z.object({ status: z.literal('pending') }),
]);

const ListQuery = z.object({
  status:   z.enum(['pending', 'verified', 'rejected']).optional(),
  category: z.string().optional(),
  lang:     z.string().default('en'),
  limit:    z.coerce.number().int().positive().max(100).default(50),
  offset:   z.coerce.number().int().min(0).default(0),
});

const IdParam = z.object({ id: z.string().uuid() });

// Editorial review is independent of the pending/verified/rejected pipeline —
// it records human judgement of story quality (see Phase 3, journey playback
// roadmap), not whether the fact is publishable.
const EditorialUpdate = z.object({
  editorialScore: z.number().min(0).max(10).optional(),
  storyType:      z.enum(['verified_fact', 'local_tradition']).optional(),
}).refine(v => v.editorialScore !== undefined || v.storyType !== undefined, {
  message: 'Provide at least one of editorialScore or storyType',
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function contentRoutes(app: FastifyInstance) {

  /**
   * POST /v1/content
   * Submit a new content candidate with translations.
   * English translation is required. Other languages are optional.
   * The item enters the pipeline as 'pending' — awaiting human review.
   */
  app.post('/v1/content', async (request, reply) => {
    const input = SubmitContent.parse(request.body);
    const id = randomUUID();

    await db.query(
      `INSERT INTO content
         (id, category, tags, location, interestingness, confidence,
          source_name, source_url, family_friendly, editorial_score, story_type, review_status)
       VALUES
         ($1,$2,$3, ST_SetSRID(ST_Point($4,$5),4326), $6,$7,$8,$9,$10,$11,$12,'pending')`,
      [
        id,
        input.category,
        input.tags,
        input.location.lng,
        input.location.lat,
        input.interestingness,
        input.confidence,
        input.sourceName,
        input.sourceUrl    ?? null,
        input.familyFriendly,
        input.editorialScore ?? null,
        input.storyType,
      ],
    );

    for (const [lang, tx] of Object.entries(input.translations) as [string, z.infer<typeof TranslationFields> | undefined][]) {
      if (!tx) continue;
      await db.query(
        `INSERT INTO content_translations
           (content_id, language, title, short_description, long_description, narration_hint)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, lang, tx.title, tx.shortDescription, tx.longDescription ?? null, tx.narrationHint ?? null],
      );
    }

    return reply.code(201).send({ id, reviewStatus: 'pending' });
  });

  /**
   * GET /v1/content?status=pending&lang=hi
   * List content candidates, filterable by review status and category.
   * Text is returned in the requested language, falling back to English.
   */
  app.get('/v1/content', async (request, reply) => {
    const { status, category, lang, limit, offset } = ListQuery.parse(request.query);

    const conditions: string[] = [];
    const params: unknown[] = [lang]; // $1 = requested language (for LEFT JOIN)

    if (status) {
      params.push(status);
      conditions.push(`c.review_status = $${params.length}`);
    }
    if (category) {
      params.push(category);
      conditions.push(`c.category = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);
    const limitIdx  = params.length - 1;
    const offsetIdx = params.length;

    const result = await db.query(
      `SELECT
         c.id, c.category, c.tags, c.interestingness, c.confidence,
         c.source_name, c.source_url, c.family_friendly,
         c.editorial_score, c.story_type,
         c.review_status, c.rejection_reason,
         ST_X(c.location) AS lng, ST_Y(c.location) AS lat,
         c.created_at, c.updated_at,
         COALESCE(t.title,             te.title)             AS title,
         COALESCE(t.short_description, te.short_description) AS short_description,
         COALESCE(t.long_description,  te.long_description)  AS long_description,
         COALESCE(t.narration_hint,    te.narration_hint)    AS narration_hint
       FROM   content c
       JOIN   content_translations te ON te.content_id = c.id AND te.language = 'en'
       LEFT   JOIN content_translations t  ON t.content_id  = c.id AND t.language = $1
       ${where}
       ORDER  BY c.created_at DESC
       LIMIT  $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );

    return reply.send({ total: result.rowCount, items: result.rows });
  });

  /**
   * PATCH /v1/content/:id/status
   * Move a content item through the review pipeline:
   *   pending  -> verified  (sets verified=true  — item is now served to travellers)
   *   pending  -> rejected  (sets verified=false — item is hidden, reason recorded)
   *   rejected -> pending   (requeue for review after edits)
   *
   * Protected by ADMIN_API_KEY (see requireAdminKey above) once deployed.
   */
  app.patch('/v1/content/:id/status', { preHandler: requireAdminKey }, async (request, reply) => {
    const { id } = IdParam.parse(request.params);
    const decision = ReviewDecision.parse(request.body);

    const isVerified      = decision.status === 'verified';
    const rejectionReason = decision.status === 'rejected' ? decision.rejectionReason : null;

    const result = await db.query(
      `UPDATE content
       SET    review_status    = $1,
              verified         = $2,
              rejection_reason = $3,
              updated_at       = now()
       WHERE  id = $4
       RETURNING id, review_status, rejection_reason`,
      [decision.status, isVerified, rejectionReason, id],
    );

    if (result.rowCount === 0) return reply.code(404).send({ error: 'content not found' });
    return reply.send(result.rows[0]);
  });

  /**
   * PATCH /v1/content/:id/editorial
   * Record a human editorial judgement of story quality (Phase 3 roadmap).
   * This is independent of the pending/verified/rejected review pipeline and
   * is NOT read by the recommendation scorer — it is for evaluation/reporting
   * (e.g. the journey playback report) until/unless a future evidence-based
   * scoring change decides to use it.
   *
   * Protected by ADMIN_API_KEY (see requireAdminKey above) once deployed.
   */
  app.patch('/v1/content/:id/editorial', { preHandler: requireAdminKey }, async (request, reply) => {
    const { id } = IdParam.parse(request.params);
    const input = EditorialUpdate.parse(request.body);

    const result = await db.query(
      `UPDATE content
       SET    editorial_score = COALESCE($1, editorial_score),
              story_type      = COALESCE($2, story_type),
              updated_at      = now()
       WHERE  id = $3
       RETURNING id, editorial_score, story_type`,
      [
        input.editorialScore ?? null,
        input.storyType ?? null,
        id,
      ],
    );

    if (result.rowCount === 0) return reply.code(404).send({ error: 'content not found' });
    return reply.send(result.rows[0]);
  });
}
