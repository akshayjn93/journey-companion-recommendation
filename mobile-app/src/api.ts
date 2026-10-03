import type { JourneySimulationResult, Story } from './types';

/**
 * Calls the existing backend simulate endpoint and normalizes the response
 * into a flat list of stories with real trigger points, mirroring the
 * normalizeJourneyData() logic in mobile-shell/app.js.
 */
export async function fetchJourneySimulation(
  apiBase: string,
  journeyId: string,
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
      language: 'en',
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

    return {
      id: content.id ?? `route-story-${index}`,
      title: content.title ?? `Story ${index + 1}`,
      category: content.category ?? 'history',
      tags: Array.isArray(content.tags) ? content.tags : [content.category ?? 'history'],
      summary:
        narration.summary ||
        content.long_description ||
        content.short_description ||
        content.title ||
        'Route story',
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
