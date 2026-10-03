import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findNearRoute } from '../content/repository.js';
import { recommendationEngine } from './engine.js';
import { RECOMMENDATION_CONFIG } from './config.js';

const normalizeToken = (value: string) => value.trim().toLowerCase();

export function normalizeInterests(input: unknown): string[] {
  const value = input as {
    interests?: string[];
    profile?: { interests?: string[] };
  } | null | undefined;

  const raw = [
    ...(value?.interests ?? []),
    ...(value?.profile?.interests ?? []),
  ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0);

  const unique = [...new Set(raw.map(normalizeToken).filter(Boolean))];
  return unique;
}

const RequestSchema = z.object({
  routeGeoJson: z.object({
    type: z.literal('LineString'),
    coordinates: z.array(z.array(z.number()).length(2)).min(2),
  }),
  currentRouteFraction: z.number().min(0).max(1).default(0),
  radiusMeters: z.number().positive().default(RECOMMENDATION_CONFIG.preferredSearchRadiusMeters),
  language: z.string().min(2).default('en'),
  interests: z.array(z.string()).default([]),
  alreadyPlayed: z.array(z.string()).default([]),
  previousCategories: z.array(z.string()).default([]),
  minutesSinceLastInteraction: z.number().min(0).default(999),
});

export async function recommendationRoutes(app: FastifyInstance) {
  app.post('/v1/recommendations', async (request, reply) => {
    const input = RequestSchema.parse(request.body);
    const candidates = await findNearRoute(input.routeGeoJson, input.radiusMeters, input.language);
    const interests = normalizeInterests(input);

    return reply.send(
      recommendationEngine.recommend(candidates, {
        interests,
        alreadyPlayed: input.alreadyPlayed,
        previousCategories: input.previousCategories,
        minutesSinceLastInteraction: input.minutesSinceLastInteraction,
        currentRouteFraction: input.currentRouteFraction,
      }),
    );
  });
}
