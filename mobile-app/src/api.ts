import type { JourneySimulationResult, NearbyStoriesResult, Story, TriggerPoint } from './types';

/**
 * Calls the existing backend simulate endpoint and normalizes the response
 * into a flat list of stories with real trigger points, mirroring the
 * normalizeJourneyData() logic in mobile-shell/app.js.
 */
/** True when the text is written in Hindi (Devanagari) letters. */
function looksHindi(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

export async function fetchJourneySimulation(
  apiBase: string,
  journeyId: string,
  language: string = 'en',
): Promise<JourneySimulationResult> {
  const trimmedBase = apiBase.trim().replace(/\/+$/, '');
  const response = await fetch(`${trimmedBase}/v1/journeys/${journeyId}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      radiusMeters: 10000,
      assumedSpeedKmh: 60,
      decisionWindowMinutes: 1,
      interests: ['history', 'culture', 'nature', 'food'],
      language,
      includeStepDiagnostics: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Simulate request failed: ${response.status}`);
  }

  const data = await response.json();
  const events = Array.isArray(data.events) ? data.events : [];

  const stories: Story[] = events.map((event: any, index: number) => {
    const content = event.content ?? {};
    const narration = content.narration ?? {};
    const triggerPoint =
      event.triggerPoint &&
      typeof event.triggerPoint.lng === 'number' &&
      typeof event.triggerPoint.lat === 'number'
        ? { lng: event.triggerPoint.lng, lat: event.triggerPoint.lat }
        : null;

    const summary: string =
      narration.summary ||
      content.long_description ||
      content.short_description ||
      content.title ||
      'Route story';

    return {
      id: content.id ?? `route-story-${index}`,
      title: content.title ?? `Story ${index + 1}`,
      category: content.category ?? 'history',
      tags: Array.isArray(content.tags) ? content.tags : [content.category ?? 'history'],
      summary,
      // This endpoint does not say which language it used, so read it off the text.
      language: looksHindi(summary) ? 'hi' : 'en',
      sourceName: content.source_name ?? undefined,
      sourceUrl: content.source_url ?? undefined,
      cue: narration.cue || content.narration_hint || `Short ${content.category ?? 'route'} note.`,
      triggerPoint,
      approxKm: typeof event.approxKm === 'number' ? event.approxKm : null,
    };
  });

  return {
    journeyId: data.journeyId ?? journeyId,
    stories,
  };
}

/**
 * Downloads every story within `radiusMeters` of a point. No route or journey
 * is needed. The phone then picks stories on its own, so it works offline.
 */
export async function fetchNearbyStories(
  apiBase: string,
  center: TriggerPoint,
  radiusMeters: number,
  timeoutMs: number,
  language: string = 'en',
): Promise<NearbyStoriesResult> {
  const trimmedBase = apiBase.trim().replace(/\/+$/, '');
  // Rounded to about 1 km. The server only needs a rough centre.
  const lat = center.lat.toFixed(2);
  const lng = center.lng.toFixed(2);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${trimmedBase}/v1/content/nearby?lat=${lat}&lng=${lng}&radiusMeters=${radiusMeters}&lang=${language}&limit=1000`,
      { signal: controller.signal },
    );
    if (!response.ok) {
      throw new Error(`Nearby stories request failed: ${response.status}`);
    }

    const data = await response.json();
    const items = Array.isArray(data.stories) ? data.stories : [];
    const stories: Story[] = items
      .filter(
        (item: any) =>
          item && typeof item.point?.lng === 'number' && typeof item.point?.lat === 'number',
      )
      .map((item: any) => ({
        id: String(item.id),
        title: item.title ?? 'Story',
        category: item.category ?? 'history',
        tags: Array.isArray(item.tags) ? item.tags : [],
        summary: item.summary || item.title || 'Nearby story',
        cue: item.cue || '',
        // Trust the server's tag, and fall back to the text if an older server sent none.
        language:
          item.language === 'hi' || (!item.language && looksHindi(item.summary ?? ''))
            ? 'hi'
            : 'en',
        sourceName: item.sourceName ?? undefined,
        sourceUrl: item.sourceUrl ?? undefined,
        triggerPoint: null,
        point: { lng: item.point.lng, lat: item.point.lat },
        approxKm: null,
      }));

    return { center, radiusMeters, stories };
  } finally {
    clearTimeout(timer);
  }
}
