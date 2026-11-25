import AsyncStorage from '@react-native-async-storage/async-storage';
import { logPlay } from './playLog';
import { getState } from './store';
import type { Story } from './types';

/**
 * Thumbs up or down for a story. Saved on the phone, and also written to the
 * play log, so we can learn which stories people like.
 */
const RATINGS_KEY = 'journey-companion:ratings';

export type Rating = 'up' | 'down';

let ratings: Record<string, Rating> = {};
let loading: Promise<void> | null = null;
const listeners = new Set<(next: Record<string, Rating>) => void>();

export function loadRatings(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(RATINGS_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        if (saved && typeof saved === 'object') ratings = saved;
      } catch {
        // No saved ratings yet.
      }
    })();
  }
  return loading;
}

export function getRatings(): Record<string, Rating> {
  return ratings;
}

export function subscribeRatings(listener: (next: Record<string, Rating>) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Sets a rating. Tapping the same thumb again takes the rating away. */
export function rateStory(story: Story, rating: Rating) {
  const next = { ...ratings };
  if (next[story.id] === rating) {
    delete next[story.id];
  } else {
    next[story.id] = rating;
    logPlay({
      event: rating === 'up' ? 'liked' : 'disliked',
      journeyId: getState().journeyId,
      storyId: story.id,
      title: story.title,
    });
  }
  ratings = next;
  listeners.forEach(listener => listener(next));
  AsyncStorage.setItem(RATINGS_KEY, JSON.stringify(next)).catch(() => {});
}
