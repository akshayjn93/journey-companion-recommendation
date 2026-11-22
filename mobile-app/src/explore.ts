import * as Location from 'expo-location';
import { findAhead, HeadingTracker } from './ahead';
import { fetchNearbyStories } from './api';
import { markStep, recordError } from './diagnostics';
import { haversineMeters } from './geo';
import { canStartNow, gapSecondsLeft, playNext, queueStory, type Position } from './playback';
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
let refreshing = false;
let lastRefreshAttemptAt = 0;

export function resetExplore() {
  heading.reset();
  refreshing = false;
  lastRefreshAttemptAt = 0;
}

/** Finds the phone, downloads the stories around it, and saves them. */
export async function prepareExplore(apiBase: string): Promise<{ ok: boolean; message: string }> {
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
  resetJourneyState(EXPLORE_JOURNEY_ID, result.stories, { apiBase, center, playedIds });
  return { ok: true, message: `${fresh} new stories saved.` };
}

/** Downloads a fresh set of stories once the traveller has moved far enough. */
function refreshIfNeeded(position: Position) {
  const { apiBase, center } = getState();
  if (!apiBase || !center || refreshing) return;
  const moved = haversineMeters([center.lng, center.lat], [position.lng, position.lat]);
  if (moved < REFRESH_AFTER_METERS) return;
  if (Date.now() - lastRefreshAttemptAt < REFRESH_RETRY_MS) return;

  refreshing = true;
  lastRefreshAttemptAt = Date.now();
  const newCenter = { lng: position.lng, lat: position.lat };
  fetchNearbyStories(apiBase, newCenter, DOWNLOAD_RADIUS_METERS, REFRESH_TIMEOUT_MS)
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
  const state = getState();

  if (state.isPaused) {
    setState({ statusMessage: 'Stories are paused.' });
    return;
  }
  if (headingDeg === null) {
    setState({ statusMessage: 'Finding your direction of travel. Keep driving...' });
    return;
  }

  const { tellable, upcoming } = findAhead(state.stories, state.triggeredIds, position, headingDeg);

  try {
    // The story is picked only at the moment it can play, so it is always
    // the nearest one ahead right now and never a stale choice.
    if (tellable.length && canStartNow()) {
      queueStory(tellable[0].story, position);
      if (playNext(position)) return;
    } else {
      playNext(position);
    }
  } catch (err) {
    recordError('Explore step', err);
  }

  if (getState().isSpeaking) return; // keep the "Playing ..." message

  if (tellable.length) {
    const minutes = Math.ceil(gapSecondsLeft() / 60);
    setState({
      statusMessage: `Next: "${tellable[0].story.title}" after a quiet gap of about ${minutes} min.`,
    });
  } else if (upcoming) {
    setState({
      statusMessage: `Next: "${upcoming.story.title}" about ${kmText(upcoming.aheadMeters)} ahead.`,
    });
  } else {
    setState({
      statusMessage: `No stories ahead right now. ${state.stories.length} stories saved for this area.`,
    });
  }
}
