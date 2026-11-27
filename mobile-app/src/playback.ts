import { haversineMeters } from './geo';
import { markStep, recordError } from './diagnostics';
import { isSpeaking, speakStory, stopSpeaking, type EndReason } from './narration';
import { logPlay } from './playLog';
import { GAP_MINUTES, getSettings } from './settings';
import { getState, setState } from './store';
import type { Story } from './types';

/**
 * Quiet time between the end of one story and the start of the next.
 * Route mode: the planned journey is already paced, so a short gap is enough.
 */
export const MIN_GAP_MS = 60 * 1000;

/**
 * Explore mode has no plan, so the phone does all the pacing itself. The gap
 * comes from the user's "how talkative" setting: 8, 5 or 3 minutes. The middle
 * one matches the backend's default (defaultMinGapMinutes = 5).
 */
function minGapMs(): number {
  if (getState().mode !== 'explore') return MIN_GAP_MS;
  return GAP_MINUTES[getSettings().talkativeness] * 60 * 1000;
}

/** True when a new story may start right now. */
export function canStartNow(gapMs: number = minGapMs()): boolean {
  const state = getState();
  if (!state.isDriving || state.isPaused) return false;
  if (isSpeaking()) return false;
  return Date.now() - lastEndedAt >= gapMs;
}

/** The quiet gap that applies right now, from the listener's setting. */
export function currentGapMs(): number {
  return minGapMs();
}

/** Seconds left before the quiet gap is over. 0 when a story may start. */
export function gapSecondsLeft(gapMs: number = minGapMs()): number {
  return Math.max(0, Math.ceil((gapMs - (Date.now() - lastEndedAt)) / 1000));
}

/**
 * A waiting story is dropped when the phone is further than this from its
 * trigger point. By then the place has been passed, so the story is too late.
 */
export const MAX_LATE_METERS = 2500;

export type Position = {
  lng: number;
  lat: number;
  speedKmh?: number;
  accuracyMeters?: number;
};

let lastEndedAt = 0;
let lastPosition: Position | null = null;
let gapTimer: ReturnType<typeof setTimeout> | null = null;

function distanceTo(story: Story, position: Position | null): number | undefined {
  const point = story.triggerPoint ?? story.point;
  if (!point || !position) return undefined;
  return Math.round(haversineMeters([position.lng, position.lat], [point.lng, point.lat]));
}

function findStory(id: string): Story | undefined {
  return getState().stories.find(story => story.id === id);
}

/** Adds a story to the waiting line. It plays when it is its turn. */
export function queueStory(story: Story, position: Position) {
  const { queuedIds, journeyId } = getState();
  if (queuedIds.includes(story.id)) return;
  setState({ queuedIds: [...queuedIds, story.id] });
  logPlay({
    event: 'queued',
    journeyId,
    storyId: story.id,
    title: story.title,
    distanceMeters: distanceTo(story, position),
    speedKmh: position.speedKmh,
    accuracyMeters: position.accuracyMeters,
  });
}

/**
 * Starts the next waiting story, if the rules allow it:
 * never talk over a story, keep a quiet gap, and respect pause.
 * Returns the story that started, if any.
 */
export function playNext(position?: Position, gapMs: number = minGapMs()): Story | null {
  if (position) lastPosition = position;
  const here = lastPosition;

  const state = getState();
  if (!state.isDriving || state.isPaused || !state.queuedIds.length) return null;
  if (isSpeaking()) return null;
  if (Date.now() - lastEndedAt < gapMs) return null;

  const queuedIds = [...state.queuedIds];
  const triggeredIds = new Set(state.triggeredIds);
  let next: Story | null = null;

  while (queuedIds.length && !next) {
    const id = queuedIds.shift()!;
    const story = findStory(id);
    triggeredIds.add(id);
    if (!story) continue;

    // Only route stories can be "too late". Explore stories are picked at the
    // moment they play, so they never wait in line.
    const distance = story.triggerPoint ? distanceTo(story, here) : undefined;
    if (distance !== undefined && distance > MAX_LATE_METERS) {
      logPlay({
        event: 'dropped',
        journeyId: state.journeyId,
        storyId: story.id,
        title: story.title,
        distanceMeters: distance,
        speedKmh: here?.speedKmh,
      });
      continue;
    }
    next = story;
  }

  if (!next) {
    setState({ queuedIds, triggeredIds });
    return null;
  }

  const story = next;
  setState({
    queuedIds,
    triggeredIds,
    currentStoryId: story.id,
    isSpeaking: true,
    statusMessage: `Playing "${story.title}".`,
  });
  logPlay({
    event: 'started',
    journeyId: state.journeyId,
    storyId: story.id,
    title: story.title,
    distanceMeters: distanceTo(story, here),
    speedKmh: here?.speedKmh,
    accuracyMeters: here?.accuracyMeters,
  });
  markStep(`Speaking story "${story.title}"`);
  speakStory(
    story.summary,
    (reason, listenedSeconds) => onStoryEnd(story, reason, listenedSeconds),
    story.language ?? 'en',
  );
  return story;
}

function onStoryEnd(story: Story, reason: EndReason, listenedSeconds: number) {
  lastEndedAt = Date.now();
  logPlay({
    event: reason,
    journeyId: getState().journeyId,
    storyId: story.id,
    title: story.title,
    listenedSeconds,
    distanceMeters: distanceTo(story, lastPosition),
  });
  if (reason === 'no_voice') {
    // Nothing was heard, so the story does not count as played, and we try
    // again in about a minute instead of waiting for the full quiet gap.
    const triggeredIds = new Set(getState().triggeredIds);
    triggeredIds.delete(story.id);
    lastEndedAt = Date.now() - minGapMs() + 60 * 1000;
    setState({
      isSpeaking: false,
      triggeredIds,
      statusMessage:
        "The phone's voice did not start. End the drive and check the voice in Settings.",
    });
  } else {
    setState({ isSpeaking: false });
  }
  markStep(`Story ended (${reason}) "${story.title}"`);

  // GPS updates normally start the next story. This timer covers the case
  // where the car is standing still and no new GPS update arrives.
  if (gapTimer) clearTimeout(gapTimer);
  gapTimer = setTimeout(() => {
    gapTimer = null;
    try {
      playNext();
    } catch (err) {
      recordError('Play next story', err);
    }
  }, minGapMs() + 500);
}

/** Where the phone last was. Null before the first GPS fix of a drive. */
export function getLastPosition(): Position | null {
  return lastPosition;
}

/**
 * Plays a story the listener picked by hand from "Stories around you", right
 * now. It counts as played, and the usual quiet gap follows it.
 */
export function playStoryNow(story: Story) {
  // Ending the current story first lets its own bookkeeping finish.
  stopSpeaking('stopped');
  const state = getState();
  const triggeredIds = new Set(state.triggeredIds);
  triggeredIds.add(story.id);
  setState({
    triggeredIds,
    queuedIds: state.queuedIds.filter(id => id !== story.id),
    currentStoryId: story.id,
    isSpeaking: true,
    statusMessage: `Playing "${story.title}".`,
  });
  const base = {
    journeyId: state.journeyId,
    storyId: story.id,
    title: story.title,
    distanceMeters: distanceTo(story, lastPosition),
  };
  logPlay({ event: 'picked', ...base });
  logPlay({ event: 'started', ...base });
  speakStory(
    story.summary,
    (reason, listenedSeconds) => onStoryEnd(story, reason, listenedSeconds),
    story.language ?? 'en',
  );
}

/** Stops the story that is playing now. The next one still waits for the gap. */
export function skipCurrentStory() {
  stopSpeaking('skipped');
}

/** Pause stops the current story and holds all others until resume. */
export function setPaused(paused: boolean) {
  if (getState().isPaused === paused) return;
  if (paused) stopSpeaking('paused');
  setState({
    isPaused: paused,
    statusMessage: paused ? 'Stories are paused.' : 'Stories are on again.',
  });
  logPlay({
    event: paused ? 'stories_paused' : 'stories_resumed',
    journeyId: getState().journeyId,
  });
  if (!paused) playNext();
}

/** Plays the current story again, right now. */
export function replayCurrentStory() {
  const { currentStoryId, journeyId } = getState();
  const story = currentStoryId ? findStory(currentStoryId) : undefined;
  if (!story) return;
  stopSpeaking('stopped');
  setState({ isSpeaking: true, statusMessage: `Playing "${story.title}" again.` });
  logPlay({ event: 'replayed', journeyId, storyId: story.id, title: story.title });
  speakStory(
    story.summary,
    (reason, listenedSeconds) => onStoryEnd(story, reason, listenedSeconds),
    story.language ?? 'en',
  );
}

/** Called when driving stops. Waiting stories go back to "not played yet". */
export function resetPlayback() {
  // Stop first: ending a story sets the gap timer, which we then clear.
  stopSpeaking('stopped');
  if (gapTimer) clearTimeout(gapTimer);
  gapTimer = null;
  lastEndedAt = 0;
  lastPosition = null;
  setState({ queuedIds: [], isSpeaking: false, isPaused: false });
}
