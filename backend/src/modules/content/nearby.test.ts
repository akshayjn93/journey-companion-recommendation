import { strict as assert } from 'node:assert';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { db } from '../../common/db.js';

let app: FastifyInstance;

test.before(async () => {
  app = await buildApp();
});

test.after(async () => {
  await app.close();
  await db.end();
});

test('GET /v1/content/nearby rejects a request with no location', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/content/nearby' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'validation_failed');
});

test('GET /v1/content/nearby rejects a radius that is too large', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/v1/content/nearby?lat=28.6&lng=77.2&radiusMeters=5000000',
  });
  assert.equal(res.statusCode, 400);
});

test('GET /v1/content/nearby returns stories nearest first, inside the radius', async () => {
  const radiusMeters = 50000;
  const res = await app.inject({
    method: 'GET',
    url: `/v1/content/nearby?lat=28.6139&lng=77.209&radiusMeters=${radiusMeters}`,
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(body.center, { lng: 77.209, lat: 28.6139 });
  assert.equal(body.storyCount, body.stories.length);

  const titles = body.stories.map((story: { title: string }) => story.title.trim().toLowerCase());
  assert.equal(new Set(titles).size, titles.length, 'no story title is repeated');
  assert.ok(
    !titles.some((title: string) => title.endsWith('why it matters on this drive')),
    'the "why it matters on this drive" copy of a story is left out',
  );

  let previous = 0;
  for (const story of body.stories) {
    assert.equal(typeof story.id, 'string');
    assert.ok(story.title.length > 0);
    assert.ok(story.summary.startsWith(story.title.trim()));
    assert.equal(typeof story.point.lng, 'number');
    assert.equal(typeof story.point.lat, 'number');
    assert.ok(story.distanceMeters <= radiusMeters);
    assert.ok(story.distanceMeters >= previous, 'stories are ordered nearest first');
    previous = story.distanceMeters;
  }
});

test('GET /v1/content/nearby returns an empty list far from any content', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/v1/content/nearby?lat=-60&lng=-140&radiusMeters=1000',
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().storyCount, 0);
});

test('GET /v1/content/nearby honours the limit', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/v1/content/nearby?lat=28.6139&lng=77.209&radiusMeters=300000&limit=3',
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().stories.length <= 3);
});
