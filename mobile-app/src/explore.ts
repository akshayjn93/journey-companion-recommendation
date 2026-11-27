import * as Location from 'expo-location';
import {
  chooseNext,
  findAhead,
  findNearby,
  HeadingTracker,
  isFood,
  PaceTracker,
  WALK_GAP_MS,
  WALK_RADIUS_METERS,
} from './ahead';
import { fetchNearbyStories } from './api';
import { markStep, recordError } from './diagnostics';
import { haversineMeters } from './geo';
import type { StoryLanguage } from './types';
import {
  canStartNow,
  currentGapMs,
  gapSecondsLeft,
  playNext,
  queueStory,
  type Position,
} from './playback';
import { getSettings } from './settings';
import {
  getState,
  readExplorePlayed,
  replaceNearbyStories,
  resetJourneyState,
  setState,
} from './store';

/**
 * Explore mode: no route and no journey ID. The phone downloads the stories
 * around it once, then picks what to tell from its location and heading. It
 * keeps working without signal until the traveller leaves the downloaded area.
 */

export const EXPLORE_JOURNEY_ID = 'explore';

/** How far around the traveller stories are downloaded. */
const DOWNLOAD_RADIUS_METERS = 100000;
/** Download again after moving this far from the centre of the last download. */
const REFRESH_AFTER_METERS = 40000;
/** If a refresh fails (no signal), wait this long before trying again. */
const REFRESH_RETRY_MS = 3 * 60 * 1000;
/** The first download can be slow when the server is waking up. */
const FIRST_DOWNLOAD_TIMEOUT_MS = 70000;
const REFRESH_TIMEOUT_MS = 20000;

const heading = new HeadingTracker();
const pace = new PaceTracker();
let refreshing = false;
let lastRefreshAttemptAt = 0;

export function resetExplore() {
  heading.reset();
  pace.reset();
  refreshing = false;
  lastRefreshAttemptAt = 0;
}

/** Finds the phone, downloads the stories around it, and saves them. */
export async function prepareExplore(
  apiBase: string,
  language: StoryLanguage = 'en',
): Promise<{ ok: boolean; message: string }> {
  await markStep('Asking for location permission');
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    return { ok: false, message: 'Location permission (while using the app) was denied.' };
  }

  await markStep('Finding where you are');
  const fix =
    (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  const center = { lng: fix.coords.longitude, lat: fix.coords.latitude };

  await markStep('Downloading stories near you');
  const result = await fetchNearbyStories(
    apiBase,
    center,
    DOWNLOAD_RADIUS_METERS,
    FIRST_DOWNLOAD_TIMEOUT_MS,
    language,
  );
  await markStep(`Nearby stories downloaded, ${result.stories.length} stories`);
  if (!result.stories.length) {
    return {
      ok: false,
      message: `No stories within ${DOWNLOAD_RADIUS_METERS / 1000} km of you yet.`,
    };
  }

  // Stories told in earlier explore sessions stay marked as played.
  const playedIds = await readExplorePlayed();
  const fresh = result.stories.filter(story => !playedIds.includes(story.id)).length;
  if (!fresh) {
    return {
      ok: false,
      message: `You have already heard all ${result.stories.length} stories near you. Tap "Forget played stories" to hear them again.`,
    };
  }

  resetExplore();
  resetJourneyState(EXPLORE_JOURNEY_ID, result.stories, { apiBase, center, playedIds, language });
  return { ok: true, message: `${fresh} new stories saved.` };
}

/**
 * Downloads the stories around the phone for the preview screen. It does not
 * start a drive and does not touch the saved journey.
 */
export async function fetchNearbyForPreview(apiBase: string, language: StoryLanguage) {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Location permission (while using the app) was denied.');
  }
  const fix =
    (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  const center = { lng: fix.coords.longitude, lat: fix.coords.latitude };
  return fetchNearbyStories(
    apiBase,
    center,
    DOWNLOAD_RADIUS_METERS,
    FIRST_DOWNLOAD_TIMEOUT_MS,
    language,
  );
}

/** Downloads a fresh set of stories once the traveller has moved far enough. */
function refreshIfNeeded(position: Position) {
  const { apiBase, center, storyLanguage } = getState();
  if (!apiBase || !center || refreshing) return;
  const moved = haversineMeters([center.lng, center.lat], [position.lng, position.lat]);
  if (moved < REFRESH_AFTER_METERS) return;
  if (Date.now() - lastRefreshAttemptAt < REFRESH_RETRY_MS) return;

  refreshing = true;
  lastRefreshAttemptAt = Date.now();
  const newCenter = { lng: position.lng, lat: position.lat };
  fetchNearbyStories(apiBase, newCenter, DOWNLOAD_RADIUS_METERS, REFRESH_TIMEOUT_MS, storyLanguage)
    .then(result => {
      // Ignore the result if driving stopped or a new journey started meanwhile.
      const now = getState();
      if (!now.isDriving || now.mode !== 'explore' || now.center !== center) return;
      // An empty answer is kept too: it means we drove out of covered areas.
      replaceNearbyStories(result.stories, newCenter);
      markStep(`Nearby stories refreshed, ${result.stories.length} stories`);
    })
    .catch(() => {
      // No signal is normal on the highway. The saved stories keep working.
    })
    .finally(() => {
      refreshing = false;
    });
}

function kmText(meters: number): string {
  return meters < 950 ? `${Math.round(meters / 50) * 50} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** Runs on every GPS update in explore mode. */
export function exploreStep(position: Position, gpsHeadingDeg: number | null | undefined) {
  refreshIfNeeded(position);

  const headingDeg = heading.update(position, gpsHeadingDeg, position.speedKmh);
  const walkingPace = pace.update(position, Date.now(), position.speedKmh);
  const state = getState();

  if (state.isPaused) {
    setState({ statusMessage: 'Stories are paused.' });
    return;
  }

  const last = state.stories.find(item => item.id === state.currentStoryId);
  const choice = { lastWasFood: last ? isFood(last) : null, interests: getSettings().interests };

  // At walking pace, tell what is close by, in any direction. The direction
  // of travel is not reliable this slow, and in a crowded bazaar the shop
  // beside you matters more than one two kilometres ahead.
  let next = walkingPace
    ? chooseNext(
        findNearby(state.stories, state.triggeredIds, position, WALK_RADIUS_METERS),
        choice,
      )
    : null;
  const closeBy = next !== null;
  let upcoming: ReturnType<typeof findAhead>['upcoming'] = null;

  if (!next) {
    if (headingDeg === null) {
      setState({ statusMessage: 'Working out which way you are heading. Keep driving.' });
      return;
    }
    const ahead = findAhead(state.stories, state.triggeredIds, position, headingDeg);
    next = chooseNext(ahead.tellable, choice);
    upcoming = ahead.upcoming;
  }

  // Stories that are right beside the listener can follow each other sooner.
  const gapMs = closeBy ? Math.min(WALK_GAP_MS, currentGapMs()) : currentGapMs();

  try {
    // The story is picked only at the moment it can play, so it is always
    // the right one for where the listener is now, never a stale choice.
    if (next && canStartNow(gapMs)) {
      queueStory(next.story, position);
      if (playNext(position, gapMs)) return;
    } else {
      playNext(position);
    }
  } catch (err) {
    recordError('Explore step', err);
  }

  if (getState().isSpeaking) return; // keep the "Playing ..." message

  if (next) {
    const minutes = Math.ceil(gapSecondsLeft(gapMs) / 60);
    setState({
      statusMessage: closeBy
        ? `Close by: "${next.story.title}", in about ${minutes} min.`
        : `Next up: "${next.story.title}", in about ${minutes} min.`,
    });
  } else if (upcoming) {
    setState({
      statusMessage: `Next up: "${upcoming.story.title}", about ${kmText(upcoming.aheadMeters)} ahead.`,
    });
  } else {
    setState({
      statusMessage: 'No stories just ahead. Enjoy the quiet.',
    });
  }
}
