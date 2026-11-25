import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A record of what happened to each story during test drives. It is saved on
 * the phone only, and can be shared from the app after a drive.
 */
const PLAY_LOG_KEY = 'journey-companion:play-log';
const MAX_ENTRIES = 1000;

export type PlayLogEvent =
  | 'queued' // reached the trigger point, waiting for its turn
  | 'started'
  | 'finished'
  | 'skipped'
  | 'paused' // cut short because the user paused stories
  | 'stopped' // cut short because driving was stopped or it was replaced
  | 'error'
  | 'timeout'
  | 'no_voice' // the phone never started speaking
  | 'dropped' // waited too long in the queue, the place was already passed
  | 'replayed'
  | 'liked' // thumbs up from the listener
  | 'disliked' // thumbs down from the listener
  | 'stories_paused'
  | 'stories_resumed';

export type PlayLogEntry = {
  at: string;
  event: PlayLogEvent;
  journeyId: string | null;
  storyId?: string;
  title?: string;
  /** Distance from the phone to the story's trigger point. */
  distanceMeters?: number;
  speedKmh?: number;
  accuracyMeters?: number;
  listenedSeconds?: number;
};

let entries: PlayLogEntry[] | null = null;

// All reads and writes run one after another, so entries can not be lost.
let chain: Promise<void> = Promise.resolve();

async function load(): Promise<PlayLogEntry[]> {
  if (entries) return entries;
  try {
    const raw = await AsyncStorage.getItem(PLAY_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    entries = Array.isArray(parsed) ? parsed : [];
  } catch {
    entries = [];
  }
  return entries;
}

export function logPlay(entry: Omit<PlayLogEntry, 'at'>): void {
  const stamped: PlayLogEntry = { at: new Date().toISOString(), ...entry };
  chain = chain
    .then(async () => {
      const list = await load();
      list.push(stamped);
      if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
      await AsyncStorage.setItem(PLAY_LOG_KEY, JSON.stringify(list));
    })
    .catch(() => {
      // The log must never break the app.
    });
}

export function readPlayLog(): Promise<PlayLogEntry[]> {
  const result = chain.then(async () => [...(await load())]);
  chain = result.then(
    () => {},
    () => {},
  );
  return result;
}

export function clearPlayLog(): Promise<void> {
  chain = chain
    .then(async () => {
      entries = [];
      await AsyncStorage.removeItem(PLAY_LOG_KEY);
    })
    .catch(() => {});
  return chain;
}
