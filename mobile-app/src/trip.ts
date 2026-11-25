import { readPlayLog } from './playLog';
import { getRatings, type Rating } from './ratings';
import type { Story } from './types';

/** What happened to one story during a drive. */
export type TripStory = {
  story: Story;
  /** True when it was heard to the end. */
  finished: boolean;
  rating?: Rating;
};

export type TripSummary = {
  minutes: number;
  stories: TripStory[];
};

/**
 * Builds the list of stories heard since the drive began, in the order they
 * played. It reads the play log, so it also works after the app was closed
 * and reopened in the middle of a drive.
 */
export async function buildTripSummary(
  startedAt: string | null,
  stories: Story[],
): Promise<TripSummary> {
  const since = startedAt ? Date.parse(startedAt) : Date.now();
  const byId = new Map(stories.map(story => [story.id, story]));
  const entries = (await readPlayLog()).filter(entry => Date.parse(entry.at) >= since);
  const ratings = getRatings();

  const order: string[] = [];
  const finished = new Set<string>();
  for (const entry of entries) {
    if (!entry.storyId || !byId.has(entry.storyId)) continue;
    if ((entry.event === 'started' || entry.event === 'replayed') && !order.includes(entry.storyId)) {
      order.push(entry.storyId);
    }
    if (entry.event === 'finished') finished.add(entry.storyId);
  }

  return {
    minutes: Math.max(0, Math.round((Date.now() - since) / 60000)),
    stories: order.map(id => ({
      story: byId.get(id)!,
      finished: finished.has(id),
      rating: ratings[id],
    })),
  };
}
