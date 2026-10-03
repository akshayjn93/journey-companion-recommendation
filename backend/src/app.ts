import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { journeyRoutes } from './modules/journey/routes.js';
import { contentRoutes } from './modules/content/routes.js';
import { recommendationRoutes } from './modules/recommendation/routes.js';

/**
 * Builds and configures the Fastify app without starting a listener.
 * Kept separate from server.ts so tests can use Fastify's `inject()`
 * against a fully wired app (routes, error handling, CORS) with no
 * real network socket involved.
 */
export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  // Centralized error handling: never leak internal error details (stack
  // traces, raw DB error messages, etc.) to clients. Validation errors get a
  // clean 400 with the specific issues; everything else is logged server-side
  // and returned as a generic 500.
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'validation_failed',
        issues: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }

    // Fastify's own request validation/parsing errors (e.g. malformed JSON)
    // carry a statusCode < 500 and are safe to pass through as-is.
    if (typeof error.statusCode === 'number' && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    request.log.error(error);
    return reply.code(500).send({ error: 'internal_server_error' });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({ error: 'not_found' });
  });

  app.get('/health', async () => ({ ok: true, service: 'journey-companion-api' }));
  await app.register(journeyRoutes);
  await app.register(contentRoutes);
  await app.register(recommendationRoutes);

  return app;
}
