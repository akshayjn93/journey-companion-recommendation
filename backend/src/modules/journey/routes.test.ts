import { strict as assert } from 'node:assert';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { db } from '../../common/db.js';

const SIMPLE_ROUTE = {
  type: 'LineString' as const,
  coordinates: [
    [77.209, 28.6139],
    [77.5, 28.9],
    [79.4636, 29.3919],
  ],
};

let app: FastifyInstance;
let journeyId: string;

test.before(async () => {
  app = await buildApp();
});

test.after(async () => {
  if (journeyId) await db.query('DELETE FROM journeys WHERE id = $1', [journeyId]);
  await app.close();
  await db.end();
});

test('POST /v1/journeys rejects an invalid body with a clean 400', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/journeys',
    payload: { origin: 'Delhi' }, // missing required fields
  });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.error, 'validation_failed');
  assert.ok(Array.isArray(body.issues));
});

test('POST /v1/journeys creates a journey and returns ranked candidates', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/journeys',
    payload: {
      origin: 'Delhi',
      destination: 'Nainital',
      interests: ['history'],
      language: 'en',
      routeGeoJson: SIMPLE_ROUTE,
    },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.journeyId);
  assert.ok(Array.isArray(body.candidates));
  journeyId = body.journeyId;
});

test('POST /v1/journeys/:id/simulate rejects a non-UUID id with a clean 400', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/journeys/not-a-uuid/simulate',
    payload: {},
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'validation_failed');
});

test('POST /v1/journeys/:id/simulate returns 404 for a well-formed but unknown id', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/journeys/00000000-0000-0000-0000-000000000000/simulate',
    payload: {},
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, 'journey not found');
});

test('POST /v1/journeys/:id/simulate returns a coverage object for a real journey', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/v1/journeys/${journeyId}/simulate`,
    payload: { interests: ['history'], language: 'en' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.journeyId, journeyId);
  assert.ok(typeof body.coverage.routeLengthKm === 'number');
  assert.ok(typeof body.coverage.longestGapKm === 'number');
  assert.ok(Array.isArray(body.events));
});

test('GET /v1/journeys/:id/package rejects a malformed query with a clean 400', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/journeys/${journeyId}/package?radiusMeters=abc&maxStories=xyz`,
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'validation_failed');
});

test('GET /v1/journeys/:id/package returns a manifest for a real journey', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/journeys/${journeyId}/package`,
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.journeyId, journeyId);
  assert.ok(body.manifest);
  assert.ok(Array.isArray(body.manifest.stories));
});

test('unknown routes return a clean 404', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/does-not-exist' });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, 'not_found');
});
