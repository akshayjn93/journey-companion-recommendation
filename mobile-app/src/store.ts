import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Story } from './types';

const JOURNEY_KEY = 'journey-companion:saved-journey';
const PROGRESS_KEY = 'journey-companion:progress';

export type DrivingState = {
  isDriving: boolean;
  journeyId: string | null;
  stories: Story[];
  triggeredIds: Set<string>;
  currentStoryId: string | null;
  statusMessage: string;
};

const state: DrivingState = {
  isDriving: false,
  journeyId: null,
  stories: [],
  triggeredIds: new Set(),
  currentStoryId: null,
  statusMessage: 'Not driving yet.',
};

type Listener = (next: DrivingState) => void;
const listeners = new Set<Listener>();

// Writes run one after another so an older save can never land after a newer one.
let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(key: string, value: unknown) {
  const payload = JSON.stringify(value);
  writeQueue = writeQueue.then(() => AsyncStorage.setItem(key, payload)).catch(() => {});
}

function saveProgress() {
  enqueueWrite(PROGRESS_KEY, {
    journeyId: state.journeyId,
    triggeredIds: [...state.triggeredIds],
    currentStoryId: state.currentStoryId,
    isDriving: state.isDriving,
  });
}

function notify() {
  // A new object each time, so React sees a change and re-renders.
  const snapshot = { ...state };
  listeners.forEach(listener => listener(snapshot));
}

let hydratePromise: Promise<void> | null = null;

/**
 * Loads the saved journey and progress from the phone. Safe to call many
 * times. The background location task calls this too, because Android can
 * relaunch the app with empty memory.
 */
export function hydrate(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const [[, journeyRaw], [, progressRaw]] = await AsyncStorage.multiGet([
          JOURNEY_KEY,
          PROGRESS_KEY,
        ]);
        // A journey loaded in this run is newer than anything on disk.
        if (state.stories.length || !journeyRaw) return;

        const journey = JSON.parse(journeyRaw);
        if (!Array.isArray(journey.stories) || !journey.stories.length) return;
        state.journeyId = journey.journeyId ?? null;
        state.stories = journey.stories;

        const progress = progressRaw ? JSON.parse(progressRaw) : null;
        if (progress && progress.journeyId === state.journeyId) {
          state.triggeredIds = new Set(progress.triggeredIds ?? []);
          state.currentStoryId = progress.currentStoryId ?? null;
          state.isDriving = Boolean(progress.isDriving);
        }
        notify();
      } catch {
        // Unreadable saved data: start clean.
      }
    })();
  }
  return hydratePromise;
}

export function getState(): DrivingState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(partial: Partial<DrivingState>) {
  Object.assign(state, partial);
  if ('triggeredIds' in partial || 'currentStoryId' in partial || 'isDriving' in partial) {
    saveProgress();
  }
  notify();
}

export function resetJourneyState(journeyId: string, stories: Story[]) {
  Object.assign(state, {
    journeyId,
    stories,
    triggeredIds: new Set<string>(),
    currentStoryId: null,
    statusMessage: 'Waiting for GPS fix...',
  });
  enqueueWrite(JOURNEY_KEY, { journeyId, stories, savedAt: new Date().toISOString() });
  saveProgress();
  notify();
}

export function getCurrentStory(): Story | null {
  return state.stories.find(story => story.id === state.currentStoryId) ?? null;
}
