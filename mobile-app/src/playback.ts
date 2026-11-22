import { haversineMeters } from './geo';
import { markStep, recordError } from './diagnostics';
import { isSpeaking, speakStory, stopSpeaking, type EndReason } from './narration';
import { logPlay } from './playLog';
import { getState, setState } from './store';
import type { Story } from './types';

/**
 * Quiet time between the end of one story and the start of the next.
 * Route mode: the planned journey is already paced, so a short gap is enough.
 */
export const MIN_GAP_MS = 60 * 1000;

/**
 * Explore mode has no plan, so the phone does all the pacing itself. This
 * matches the backend's default gap (defaultMinGapMinutes = 5).
 */
export const EXPLORE_MIN_GAP_MS = 5 * 60 * 1000;

function minGapMs(): number {
  return getState().mode === 'explore' ? EXPLORE_MIN_GAP_MS : MIN_GAP_MS;
}

/** True when a new story may start right now. */
export function canStartNow(): boolean {
  const state = getState();
  if (!state.isDriving || state.isPaused) return false;
  if (isSpeaking()) return false;
  return Date.now() - lastEndedAt >= minGapMs();
}

/** Seconds left before the quiet gap is over. 0 when a story may start. */
export function gapSecondsLeft(): number {
  return Math.max(0, Math.ceil((minGapMs() - (Date.now() - lastEndedAt)) / 1000));
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
export function playNext(position?: Position): Story | null {
  if (position) lastPosition = position;
  const here = lastPosition;

  const state = getState();
  if (!state.isDriving || state.isPaused || !state.queuedIds.length) return null;
  if (isSpeaking()) return null;
  if (Date.now() - lastEndedAt < minGapMs()) return null;

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
  speakStory(story.summary, (reason, listenedSeconds) => onStoryEnd(story, reason, listenedSeconds));
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
        "The phone's voice did not start. Stop driving and use Test voice on the start screen.",
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
  speakStory(story.summary, (reason, listenedSeconds) => onStoryEnd(story, reason, listenedSeconds));
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
