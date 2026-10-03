import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../common/db.js';
import { findNearRoute } from '../content/repository.js';
import { recommendationEngine } from '../recommendation/engine.js';
import { normalizeInterests } from '../recommendation/routes.js';
import { RECOMMENDATION_CONFIG } from '../recommendation/config.js';
import { simulateJourney, type SimulatedEvent } from '../route/simulator.js';
import { buildJourneyPackageArchive, buildJourneyPackageDownload, buildJourneyPackageManifest } from './package.js';

const CreateJourney = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  interests: z.array(z.string()).default([]),
  language: z.string().default('en'),
  routeGeoJson: z.object({ type: z.literal('LineString'), coordinates: z.array(z.array(z.number()).length(2)).min(2) }),
});

const SimulateOptions = z.object({
  radiusMeters: z.number().int().positive().default(RECOMMENDATION_CONFIG.preferredSearchRadiusMeters),
  assumedSpeedKmh: z.number().positive().default(60),
  minGapMinutes: z.number().positive().default(RECOMMENDATION_CONFIG.defaultMinGapMinutes),
  decisionWindowMinutes: z.number().positive().default(1),
  interests: z.array(z.string()).default([]),
  language: z.string().default('en'),
  includeStepDiagnostics: z.boolean().default(true),
});

const IdParam = z.object({ id: z.string().uuid() });

const PackageQuery = z.object({
  radiusMeters: z.coerce.number().int().positive().default(RECOMMENDATION_CONFIG.preferredSearchRadiusMeters),
  maxStories: z.coerce.number().int().positive().max(100).default(20),
  language: z.string().default('en'),
  format: z.enum(['json', 'zip']).default('json'),
});

export async function journeyRoutes(app: FastifyInstance) {
  app.post('/v1/journeys', async (request, reply) => {
    const input = CreateJourney.parse(request.body);
    const normalizedInterests = normalizeInterests(input);
    const id = randomUUID();

    await db.query(
      `INSERT INTO journeys(id, origin, destination, interests, language, route_geometry)
       VALUES ($1,$2,$3,$4,$5,ST_SetSRID(ST_GeomFromGeoJSON($6),4326))`,
      [id, input.origin, input.destination, normalizedInterests, input.language, JSON.stringify(input.routeGeoJson)],
    );

    const candidates = await findNearRoute(input.routeGeoJson, 3000, input.language);
    const ranked = recommendationEngine.rank(candidates, {
      interests: normalizedInterests,
      alreadyPlayed: [],
      previousCategories: [],
      minutesSinceLastInteraction: 999,
    });

    return reply.send({ journeyId: id, candidates: ranked.slice(0, 10) });
  });

  app.post('/v1/journeys/:id/simulate', async (request, reply) => {
    const { id } = IdParam.parse(request.params);
    const opts = SimulateOptions.parse(request.body ?? {});
    const result = await simulateJourney(id, opts);
    if (result === null) return reply.code(404).send({ error: 'journey not found' });

    const { routeLengthKm, events, diagnostics } = result;
    return reply.send({ journeyId: id, coverage: computeCoverage(routeLengthKm, events, opts.assumedSpeedKmh), diagnostics, events });
  });

  app.get('/v1/journeys/:id/package', async (request, reply) => {
    const { id } = IdParam.parse(request.params);
    const { radiusMeters, maxStories, language, format } = PackageQuery.parse(request.query);

    const journeyResult = await db.query(
      `SELECT interests, language, ST_AsGeoJSON(route_geometry) AS route_geojson
       FROM journeys WHERE id = $1`,
      [id],
    );

    if (journeyResult.rowCount === 0) return reply.code(404).send({ error: 'journey not found' });

    const row = journeyResult.rows[0];
    const route = JSON.parse(row.route_geojson) as { type: 'LineString'; coordinates: Array<[number, number]> };
    const savedInterests = Array.isArray(row.interests) ? row.interests : [];
    const finalLanguage = row.language ?? language;
    const candidates = await findNearRoute(route, radiusMeters, finalLanguage);
    const ranked = recommendationEngine.rank(candidates, {
      interests: normalizeInterests({ interests: savedInterests }),
      alreadyPlayed: [],
      previousCategories: [],
      minutesSinceLastInteraction: 999,
      currentRouteFraction: 0,
    });

    const content = ranked.slice(0, maxStories);

    if (format === 'zip') {
      const archive = buildJourneyPackageArchive({
        journeyId: id,
        route,
        language: finalLanguage,
        interests: normalizeInterests({ interests: savedInterests }),
        content,
      });

      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="journey-${id}.zip"`)
        .send(archive);
    }

    const packagePayload = buildJourneyPackageDownload({
      journeyId: id,
      route,
      language: finalLanguage,
      interests: normalizeInterests({ interests: savedInterests }),
      content,
    });

    return reply.send(packagePayload);
  });
}

function computeCoverage(routeLengthKm: number, events: SimulatedEvent[], assumedSpeedKmh: number) {
  const checkpoints = [0, ...events.map(e => e.approxKm), routeLengthKm];
  const gaps = checkpoints.slice(1).map((km, i) => Number((km - checkpoints[i]).toFixed(1)));
  const longestGapKm = Number(Math.max(...gaps).toFixed(1));
  const avgGapKm = Number((gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1));
  const kmToMinutes = (km: number) => Number(((km / assumedSpeedKmh) * 60).toFixed(1));

  return {
    routeLengthKm,
    storyCount: events.length,
    longestGapKm,
    avgGapKm,
    longestGapMinutes: kmToMinutes(longestGapKm),
    avgGapMinutes: kmToMinutes(avgGapKm),
    uncoveredStretches: checkpoints.slice(1)
      .map((km, i) => ({ fromKm: checkpoints[i], toKm: km, gapKm: Number((km - checkpoints[i]).toFixed(1)) }))
      .filter(s => s.gapKm > 60),
  };
}
