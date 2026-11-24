/**
 * The same story can reach us more than once: imported from two files, or
 * written twice as "X" and "X — why it matters on this drive". These helpers
 * keep one copy per story.
 *
 * Stories are matched on their English title, so this also works when the
 * text being returned is in another language.
 */

/** A key that is the same for every copy of one story. */
export function storyKey(englishTitle: string): string {
  return englishTitle
    .trim()
    .toLowerCase()
    .replace(/\s*[—–-]\s*why it matters on this drive\.?$/, '');
}

/**
 * Keeps one row per story, preferring the copy with the plain (shortest)
 * English title. The order of the rows that remain is not changed.
 */
export function dedupeStories<T>(rows: T[], englishTitleOf: (row: T) => string): T[] {
  const bestByKey = new Map<string, T>();
  for (const row of rows) {
    const title = englishTitleOf(row);
    const key = storyKey(title);
    const kept = bestByKey.get(key);
    if (!kept || title.trim().length < englishTitleOf(kept).trim().length) {
      bestByKey.set(key, row);
    }
  }
  const keptRows = new Set(bestByKey.values());
  return rows.filter(row => keptRows.has(row));
}
