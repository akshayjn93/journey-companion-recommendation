import AsyncStorage from '@react-native-async-storage/async-storage';
import type { JourneyMode, Story, StoryLanguage, TriggerPoint } from './types';

const JOURNEY_KEY = 'journey-companion:saved-journey';
const PROGRESS_KEY = 'journey-companion:progress';
// Stories already told in explore mode. Kept between explore sessions, so a
// daily drive does not repeat the same stories.
const EXPLORE_PLAYED_KEY = 'journey-companion:explore-played';

export type DrivingState = {
  isDriving: boolean;
  journeyId: string | null;
  mode: JourneyMode;
  /** Explore mode: server address and the centre of the last download. */
  apiBase: string | null;
  center: TriggerPoint | null;
  /** Explore mode: the language stories were downloaded in. */
  storyLanguage: StoryLanguage;
  stories: Story[];
  triggeredIds: Set<string>;
  /** Stories that reached their trigger point and are waiting for their turn. */
  queuedIds: string[];
  currentStoryId: string | null;
  /** True when the user has paused stories. */
  isPaused: boolean;
  /** True while a story is being spoken. Not saved on the phone. */
  isSpeaking: boolean;
  /** When the current drive began (ISO time). Used for the trip summary. */
  driveStartedAt: string | null;
  statusMessage: string;
};

const state: DrivingState = {
  isDriving: false,
  journeyId: null,
  mode: 'route',
  apiBase: null,
  center: null,
  storyLanguage: 'en',
  stories: [],
  triggeredIds: new Set(),
  queuedIds: [],
  currentStoryId: null,
  isPaused: false,
  isSpeaking: false,
  driveStartedAt: null,
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
    queuedIds: state.queuedIds,
    currentStoryId: state.currentStoryId,
    isPaused: state.isPaused,
    driveStartedAt: state.driveStartedAt,
    isDriving: state.isDriving,
  });
  if (state.mode === 'explore') {
    enqueueWrite(EXPLORE_PLAYED_KEY, [...state.triggeredIds]);
  }
}

/** Stories already told in earlier explore sessions. */
export async function readExplorePlayed(): Promise<string[]> {
  await writeQueue;
  try {
    const raw = await AsyncStorage.getItem(EXPLORE_PLAYED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Lets explore mode tell every story again. */
export async function forgetExplorePlayed(): Promise<void> {
  if (state.mode === 'explore') {
    state.triggeredIds = new Set();
    state.currentStoryId = null;
    saveProgress();
    notify();
  } else {
    enqueueWrite(EXPLORE_PLAYED_KEY, []);
  }
  await writeQueue;
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
        state.mode = journey.mode === 'explore' ? 'explore' : 'route';
        state.apiBase = journey.apiBase ?? null;
        state.center = journey.center ?? null;
        state.storyLanguage = journey.storyLanguage === 'hi' ? 'hi' : 'en';
        state.stories = journey.stories;

        const progress = progressRaw ? JSON.parse(progressRaw) : null;
        if (progress && progress.journeyId === state.journeyId) {
          state.triggeredIds = new Set(progress.triggeredIds ?? []);
          state.queuedIds = Array.isArray(progress.queuedIds) ? progress.queuedIds : [];
          state.isPaused = Boolean(progress.isPaused);
          state.driveStartedAt = typeof progress.driveStartedAt === 'string' ? progress.driveStartedAt : null;
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
  if (
    'triggeredIds' in partial ||
    'queuedIds' in partial ||
    'currentStoryId' in partial ||
    'isPaused' in partial ||
    'driveStartedAt' in partial ||
    'isDriving' in partial
  ) {
    saveProgress();
  }
  notify();
}

function saveJourney() {
  enqueueWrite(JOURNEY_KEY, {
    journeyId: state.journeyId,
    mode: state.mode,
    apiBase: state.apiBase,
    center: state.center,
    storyLanguage: state.storyLanguage,
    stories: state.stories,
    savedAt: new Date().toISOString(),
  });
}

/**
 * Explore mode: swaps in a fresh download of nearby stories as the traveller
 * moves on. Stories already played stay marked as played.
 */
export function replaceNearbyStories(stories: Story[], center: TriggerPoint) {
  state.stories = stories;
  state.center = center;
  saveJourney();
  notify();
}

export function resetJourneyState(
  journeyId: string,
  stories: Story[],
  explore?: { apiBase: string; center: TriggerPoint; playedIds?: string[]; language?: StoryLanguage },
) {
  Object.assign(state, {
    journeyId,
    mode: explore ? 'explore' : 'route',
    apiBase: explore?.apiBase ?? null,
    center: explore?.center ?? null,
    storyLanguage: explore?.language ?? 'en',
    stories,
    triggeredIds: new Set<string>(explore?.playedIds ?? []),
    queuedIds: [],
    currentStoryId: null,
    isPaused: false,
    isSpeaking: false,
    statusMessage: 'Finding where you are…',
  });
  saveJourney();
  saveProgress();
  notify();
}

export function getCurrentStory(): Story | null {
  return state.stories.find(story => story.id === state.currentStoryId) ?? null;
}
