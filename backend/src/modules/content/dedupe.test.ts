import { strict as assert } from 'node:assert';
import test from 'node:test';
import { dedupeStories, storyKey } from './dedupe.js';

test('storyKey ignores case, spaces and the "why it matters" ending', () => {
  assert.equal(storyKey('  Dasna carries a 1857 memory '), 'dasna carries a 1857 memory');
  assert.equal(
    storyKey('Dasna carries a 1857 memory — why it matters on this drive'),
    'dasna carries a 1857 memory',
  );
  assert.equal(storyKey('Dasna carries a 1857 memory - Why it matters on this drive.'), 'dasna carries a 1857 memory');
  // A dash inside a normal title is kept.
  assert.equal(
    storyKey('The flat horizon is ending — the Himalayas are rising ahead'),
    'the flat horizon is ending — the himalayas are rising ahead',
  );
});

test('dedupeStories keeps one copy per story, prefers the plain title, and keeps the order', () => {
  const rows = [
    { id: 1, en: 'B story — why it matters on this drive' },
    { id: 2, en: 'A story' },
    { id: 3, en: 'B story' },
    { id: 4, en: 'a story' },
    { id: 5, en: 'C story' },
  ];
  const kept = dedupeStories(rows, row => row.en);
  assert.deepEqual(kept.map(row => row.id), [2, 3, 5]);
});

test('dedupeStories matches on the English title even when the shown title is Hindi', () => {
  const rows = [
    { title: 'हिंदी शीर्षक एक', en: 'Same story' },
    { title: 'हिंदी शीर्षक दो', en: 'Same story — why it matters on this drive' },
  ];
  assert.equal(dedupeStories(rows, row => row.en).length, 1);
});
