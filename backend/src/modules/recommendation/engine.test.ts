import { strict as assert } from 'node:assert';
import test from 'node:test';
import { RecommendationEngine } from './engine.js';
import { normalizeInterests } from './routes.js';
import type { ContentCandidate } from '../content/repository.js';
import { buildJourneyPackageManifest, buildJourneyPackageDownload, buildJourneyPackageArchive } from '../journey/package.js';
import { computeAheadDistanceMeters, computeTriggerAheadDistanceMeters } from '../route/simulator.js';
import { classifySkipReason } from './types.js';
import { RECOMMENDATION_CONFIG } from './config.js';
import { deriveCandidateContext } from './location.js';

const makeCandidate = (overrides: Partial<ContentCandidate> = {}): ContentCandidate => ({
  id: '1', title: 'Test', short_description: 'Test', long_description: null, narration_hint: null,
  category: 'history', tags: ['history'], interestingness: 9, confidence: 0.95,
  source_name: 'Official', source_url: null, family_friendly: true,
  editorial_score: null, story_type: 'verified_fact', distance_m: 500,
  ...overrides,
});

test('ranks the strongest candidate highest', () => {
  const engine = new RecommendationEngine();
  const ranked = engine.rank([
    makeCandidate({ id: 'a', interestingness: 7, distance_m: 2500 }),
    makeCandidate({ id: 'b', category: 'culture', tags: ['culture'], interestingness: 9.8, distance_m: 100 }),
  ], { interests: ['culture'], alreadyPlayed: [], previousCategories: [], minutesSinceLastInteraction: 20 });
  assert.equal(ranked[0].id, 'b');
});

test('filters already played and untrusted-source candidates', () => {
  const engine = new RecommendationEngine();
  const ranked = engine.rank([
    makeCandidate({ id: 'played' }),
    makeCandidate({ id: 'untrusted', confidence: 0.4 }),
    makeCandidate({ id: 'valid', category: 'food', tags: ['food'] }),
  ], { interests: ['food'], alreadyPlayed: ['played'], previousCategories: [], minutesSinceLastInteraction: 20 });
  assert.deepEqual(ranked.map(x => x.id), ['valid']);
});

test('does not use interestingness to gate or order candidates (Handoff v2.7 MVP decision)', () => {
  const engine = new RecommendationEngine();
  const ranked = engine.rank([
    makeCandidate({ id: 'low-interest', interestingness: 0.5, distance_m: 100 }),
    makeCandidate({ id: 'high-interest', interestingness: 9.8, distance_m: 5000 }),
  ], { interests: [], alreadyPlayed: [], previousCategories: [], minutesSinceLastInteraction: 20 });

  // Both remain eligible even though 'low-interest' is far below the legacy
  // minimumInterestingness threshold, and ordering follows plain proximity
  // to the traveller, not the interestingness value.
  assert.deepEqual(ranked.map(x => x.id), ['low-interest', 'high-interest']);
});

test('does not speak during cooldown', () => {
  const engine = new RecommendationEngine();
  const result = engine.recommend([makeCandidate()], { interests: [], alreadyPlayed: [], previousCategories: [], minutesSinceLastInteraction: 1 });
  assert.equal(result.shouldSpeak, false);
});

test('returns ranked candidates for explainability', () => {
  const engine = new RecommendationEngine();
  const result = engine.recommend([
    makeCandidate({ id: 'a' }), makeCandidate({ id: 'b', category: 'food', tags: ['food'] }),
  ], { interests: ['food'], alreadyPlayed: [], previousCategories: [], minutesSinceLastInteraction: 20 });
  assert.equal(result.shouldSpeak, true);
  assert.equal(result.rankedCandidates.length, 2);
  assert.ok(result.recommendation?.scoreBreakdown);
});


test('prefers a strong story that is naturally ahead of the traveller', () => {
  const engine = new RecommendationEngine();
  const ranked = engine.rank([
    makeCandidate({ id: 'near', interestingness: 9.5, distance_m: 100, route_fraction: 0.505, route_length_m: 100000 }),
    makeCandidate({ id: 'ahead', category: 'culture', tags: ['culture'], interestingness: 9, distance_m: 600, route_fraction: 0.52, route_length_m: 100000 }),
  ], {
    interests: ['culture'],
    alreadyPlayed: [],
    previousCategories: [],
    minutesSinceLastInteraction: 20,
    currentRouteFraction: 0.5,
  });
  assert.equal(ranked[0].id, 'ahead');
  assert.equal(ranked[0].routePosition?.aheadDistanceM, 2000);
});

test('rejects stories that are too far ahead for the route corridor', () => {
  const engine = new RecommendationEngine();
  const ranked = engine.rank([
    makeCandidate({ id: 'far', route_fraction: 0.8, route_length_m: 100000 }),
    makeCandidate({ id: 'good', route_fraction: 0.52, route_length_m: 100000 }),
  ], {
    interests: [],
    alreadyPlayed: [],
    previousCategories: [],
    minutesSinceLastInteraction: 20,
    currentRouteFraction: 0.5,
  });
  assert.deepEqual(ranked.map(x => x.id), ['good']);
});


test('keeps route distance deterministic from route fraction', () => {
  const engine = new RecommendationEngine();
  const ranked = engine.rank([
    makeCandidate({ id: 'story', route_fraction: 0.508, route_length_m: 100000 }),
  ], {
    interests: [],
    alreadyPlayed: [],
    previousCategories: [],
    minutesSinceLastInteraction: 20,
    currentRouteFraction: 0.5,
  });
  assert.equal(ranked[0].routePosition?.aheadDistanceM, 800);
});

test('keeps a useful story eligible in the wider route corridor even when it is just over the old 5 km cutoff', () => {
  const engine = new RecommendationEngine();
  const ranked = engine.rank([
    makeCandidate({ id: 'distant-but-useful', route_fraction: 0.56, route_length_m: 100000 }),
  ], {
    interests: [],
    alreadyPlayed: [],
    previousCategories: [],
    minutesSinceLastInteraction: 20,
    currentRouteFraction: 0.5,
  });
  assert.equal(ranked[0].id, 'distant-but-useful');
  assert.equal(ranked[0].routePosition?.aheadDistanceM, 6000);
});

test('calculates ahead distance from route fraction relative to traveller and trigger points', () => {
  assert.equal(computeAheadDistanceMeters(0.508, 0.5, 100000), 800);
  assert.equal(computeTriggerAheadDistanceMeters(0.508, 0.5, 100000), 800);
});

test('normalizes user profile interests before ranking', () => {
  const normalized = normalizeInterests({
    interests: ['  History ', 'culture'],
    profile: { interests: ['history', '  Nature ', 'culture'] },
  });

  assert.deepEqual(normalized, ['history', 'culture', 'nature']);
});

test('includes a deterministic narration preview alongside ranked recommendations', () => {
  const engine = new RecommendationEngine();
  const result = engine.recommend([
    makeCandidate({
      id: 'story-1',
      title: 'Loni Fort is tied to Timur\'s invasion',
      category: 'history',
      tags: ['history', 'fort'],
      long_description: 'A Mughal-era fort with a strategic location along the route.',
      narration_hint: 'Short historic note about the fort and the route.',
    }),
  ], {
    interests: ['history'],
    alreadyPlayed: [],
    previousCategories: [],
    minutesSinceLastInteraction: 20,
  });

  assert.equal(result.shouldSpeak, true);
  assert.ok(result.recommendation?.narration);
  assert.match(result.recommendation?.narration?.summary ?? '', /Loni Fort|historic|route/i);
});

test('builds an offline journey package manifest with route and story metadata', () => {
  const route = {
    type: 'LineString',
    coordinates: [
      [77.0, 28.7],
      [77.6, 28.9],
      [78.2, 29.1],
    ],
  } as const;

  const manifest = buildJourneyPackageManifest({
    journeyId: 'journey-123',
    route,
    language: 'en',
    interests: ['history', 'culture'],
    content: [
      makeCandidate({
        id: 'c-1', title: 'Loni Fort', category: 'history', tags: ['history'],
        long_description: 'Historic fort on the route.', narration_hint: 'Quick note',
      }),
      makeCandidate({
        id: 'c-2', title: 'Bharatpur Market', category: 'culture', tags: ['culture'],
        long_description: 'Local market and craft tradition.', narration_hint: 'Market stop',
      }),
    ],
  });

  assert.equal(manifest.journeyId, 'journey-123');
  assert.equal(manifest.route.type, 'LineString');
  assert.equal(manifest.assets.length, 3);
  assert.equal(manifest.storyCount, 2);
  assert.ok(manifest.stories[0].narration?.summary);
});

test('builds a mobile-ready journey download package contract', () => {
  const route = {
    type: 'LineString',
    coordinates: [
      [77.0, 28.7],
      [77.6, 28.9],
      [78.2, 29.1],
    ],
  } as const;

  const pkg = buildJourneyPackageDownload({
    journeyId: 'journey-456',
    route,
    language: 'en',
    interests: ['history'],
    content: [
      makeCandidate({
        id: 'c-3', title: 'Sambhal Market', category: 'culture', tags: ['history', 'culture'],
        long_description: 'Local craft and trade history.', narration_hint: 'Market stop',
      }),
    ],
  });

  assert.equal(pkg.packageVersion, 'journey-package-v1');
  assert.equal(pkg.files.length, 3);
  assert.equal(pkg.files[0].name, 'route.geojson');
  assert.ok(pkg.manifest.storyCount === 1);
});

test('builds a zip archive for a downloadable journey package', () => {
  const route = {
    type: 'LineString',
    coordinates: [
      [77.0, 28.7],
      [77.6, 28.9],
      [78.2, 29.1],
    ],
  } as const;

  const archive = buildJourneyPackageArchive({
    journeyId: 'journey-zip',
    route,
    language: 'en',
    interests: ['history'],
    content: [
      makeCandidate({
        id: 'zip-story', title: 'Haridwar Route', category: 'history', tags: ['history'],
        long_description: 'Historic route context.', narration_hint: 'Short note',
      }),
    ],
  });

  assert.equal(archive.subarray(0, 4).toString('hex'), '504b0304');
  assert.ok(archive.includes(Buffer.from('route.geojson')));
  assert.ok(archive.includes(Buffer.from('manifest.json')));
});

// --- Location-first recommendation model (Handoff v2.6 §40.2A) -----------

test('the generic pacing window matches the pre-existing global constants', () => {
  assert.equal(RECOMMENDATION_CONFIG.preferredAheadMinMeters, 800);
  assert.equal(RECOMMENDATION_CONFIG.preferredAheadMaxMeters, 3000);
  assert.equal(RECOMMENDATION_CONFIG.maximumAheadMeters, 10000);
  assert.equal(RECOMMENDATION_CONFIG.maximumBehindMeters, 6000);
});

test('deriveCandidateContext falls back to distance-to-route when no current route position is known', () => {
  const context = deriveCandidateContext(makeCandidate({ distance_m: 750 }));
  assert.deepEqual(context, { distanceFromUserM: 750 });
});

test('deriveCandidateContext derives isAhead/routeDistanceM/etaMinutes from route position when available', () => {
  const ahead = deriveCandidateContext(
    makeCandidate({ distance_m: 100, route_fraction: 0.51, route_length_m: 100000 }),
    0.5,
    60,
  );
  assert.equal(ahead.isAhead, true);
  assert.equal(ahead.routeDistanceM, 1000);
  assert.equal(ahead.etaMinutes, 1);

  const behind = deriveCandidateContext(
    makeCandidate({ distance_m: 100, route_fraction: 0.49, route_length_m: 100000 }),
    0.5,
    60,
  );
  assert.equal(behind.isAhead, false);
  assert.equal(behind.etaMinutes, undefined);
});

test('every candidate is evaluated against the same single pacing window, regardless of content type or journey', () => {
  const engine = new RecommendationEngine();

  const tooFarAhead = engine.rank([
    makeCandidate({ id: 'far', route_fraction: 0.62, route_length_m: 100000 }),
  ], {
    interests: [],
    alreadyPlayed: [],
    previousCategories: [],
    minutesSinceLastInteraction: 20,
    currentRouteFraction: 0.5,
  });
  assert.deepEqual(tooFarAhead.map(x => x.id), []);

  // Same 12km-ahead distance, but now near the route end - still rejected,
  // because there is no special destination window any more. The location-
  // first model relies on the traveller's simulated position getting close
  // enough on its own, not on a wider window for specific content.
  const stillTooFarAhead = engine.rank([
    makeCandidate({ id: 'near-end', route_fraction: 0.98, route_length_m: 100000 }),
  ], {
    interests: [],
    alreadyPlayed: [],
    previousCategories: [],
    minutesSinceLastInteraction: 20,
    currentRouteFraction: 0.86,
  });
  assert.deepEqual(stillTooFarAhead.map(x => x.id), []);
});

test('the narration cooldown applies uniformly, with no per-content bypass', () => {
  const engine = new RecommendationEngine();

  const nearRouteEnd = engine.recommend([
    makeCandidate({ id: 'near-end', route_fraction: 0.995, route_length_m: 100000 }),
  ], {
    interests: [], alreadyPlayed: [], previousCategories: [], minutesSinceLastInteraction: 1, currentRouteFraction: 0.99,
  });
  assert.equal(nearRouteEnd.shouldSpeak, false);
  assert.deepEqual(nearRouteEnd.reasons, ['narration cooldown: 5 minutes']);

  const midRoute = engine.recommend([
    makeCandidate({ id: 'roadside-1', route_fraction: 0.5, route_length_m: 100000 }),
  ], {
    interests: [], alreadyPlayed: [], previousCategories: [], minutesSinceLastInteraction: 1, currentRouteFraction: 0.5,
  });
  assert.equal(midRoute.shouldSpeak, false);
});

test('classifySkipReason maps known reasons to their evaluation state', () => {
  assert.equal(classifySkipReason('narration cooldown: 8 minutes'), 'REJECTED_BY_COOLDOWN');
  assert.equal(classifySkipReason('trigger point violates minimum spacing from last narration'), 'REJECTED_BY_COOLDOWN');
  assert.equal(classifySkipReason('candidate is behind the traveller'), 'OUTSIDE_TRIGGER_WINDOW');
  assert.equal(classifySkipReason('candidate is too far ahead'), 'OUTSIDE_TRIGGER_WINDOW');
  assert.equal(classifySkipReason('no eligible candidate in the current decision window'), 'OUTSIDE_TRIGGER_WINDOW');
  assert.equal(classifySkipReason('not family friendly'), 'REJECTED_BY_QUALITY');
  assert.equal(classifySkipReason('already played'), 'REJECTED_BY_QUALITY');
  assert.equal(classifySkipReason('interestingness below 6.5'), 'REJECTED_BY_QUALITY');
  assert.equal(classifySkipReason('source confidence below 0.7'), 'REJECTED_BY_QUALITY');
  assert.equal(classifySkipReason('best candidate score is below speech threshold'), 'REJECTED_BY_QUALITY');
  assert.equal(classifySkipReason('lower ranked than selected candidate'), 'CONSIDERED_BUT_LOST');
  assert.equal(classifySkipReason('lower ranked than top eligible candidate'), 'CONSIDERED_BUT_LOST');
  assert.equal(classifySkipReason(undefined), 'CONSIDERED_BUT_LOST');
});

