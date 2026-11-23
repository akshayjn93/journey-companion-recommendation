import * as Location from 'expo-location';
import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import { haversineMeters } from './geo';
import { exploreStep, resetExplore } from './explore';
import { playNext, queueStory, resetPlayback, type Position } from './playback';
import { markStep, recordError } from './diagnostics';
import { getState, hydrate, setState } from './store';
import { loadVoiceSettings } from './voice';

export const LOCATION_TASK_NAME = 'journey-companion-location-task';

/** How close (meters) the traveller must be to a story's trigger point to fire it. */
const TRIGGER_RADIUS_METERS = 300;

// Must be registered at module scope (not inside a component) so the OS can
// re-invoke it even if the app was backgrounded/relaunched.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    setState({ statusMessage: `Location error: ${error.message}` });
    return;
  }

  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const latest = locations?.[locations.length - 1];
  if (!latest) return;

  try {
    await handleFix(latest);
  } catch (err) {
    await recordError('Location task', err);
  }
});

let firstFixMarked = false;

// Set when we fall back to tracking only while the app is open (see
// startDriving), so stopDriving knows to tear it down.
let foregroundSubscription: Location.LocationSubscription | null = null;

async function handleFix(latest: Location.LocationObject) {
  if (!firstFixMarked) {
    firstFixMarked = true;
    await markStep('GPS fix received, tracking works');
  }

  // Android may have relaunched the app with empty memory.
  await hydrate();
  await loadVoiceSettings();
  const { stories, triggeredIds, queuedIds, isPaused, mode } = getState();

  const speed = latest.coords.speed;
  const position: Position = {
    lng: latest.coords.longitude,
    lat: latest.coords.latitude,
    speedKmh: typeof speed === 'number' && speed >= 0 ? Math.round(speed * 3.6) : undefined,
    accuracyMeters: Number.isFinite(latest.coords.accuracy)
      ? Math.round(latest.coords.accuracy ?? 0)
      : undefined,
  };
  const accuracyText =
    position.accuracyMeters !== undefined ? `±${position.accuracyMeters}m` : 'unknown accuracy';

  // No route: pick stories from location and heading.
  if (mode === 'explore') {
    exploreStep(position, latest.coords.heading);
    return;
  }

  // Stories still waiting to reach their trigger point.
  const untriggered = stories.filter(
    story => story.triggerPoint && !triggeredIds.has(story.id) && !queuedIds.includes(story.id),
  );

  let nearest: (typeof stories)[number] | null = null;
  let nearestDistance = Infinity;
  for (const story of untriggered) {
    const point = story.triggerPoint!;
    const distance = haversineMeters([position.lng, position.lat], [point.lng, point.lat]);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = story;
    }
  }

  // While paused, nothing new joins the waiting line.
  if (nearest && nearestDistance <= TRIGGER_RADIUS_METERS && !isPaused) {
    queueStory(nearest, position);
  }

  // Starts a waiting story only if nothing is playing and the quiet gap has passed.
  const started = playNext(position);
  if (started) return;

  const after = getState();
  if (after.isPaused) {
    setState({ statusMessage: `Stories are paused (GPS ${accuracyText}).` });
  } else if (after.isSpeaking) {
    // Keep the "Playing ..." message.
  } else if (after.queuedIds.length) {
    setState({ statusMessage: `${after.queuedIds.length} story waiting for a quiet gap.` });
  } else if (!untriggered.length) {
    setState({ statusMessage: 'All stories on this route have been triggered.' });
  } else if (nearest) {
    setState({
      statusMessage: `GPS fix received (${accuracyText}). Next: "${nearest.title}" in ~${Math.round(nearestDistance)}m.`,
    });
  }
}

export async function startDriving(): Promise<{ ok: boolean; message: string }> {
  await markStep('Asking for location permission');
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    return { ok: false, message: 'Location permission (while using the app) was denied.' };
  }

  // Android keeps tracking with the screen locked through the foreground
  // service below, so it does not need the "Allow all the time" permission.
  // iOS tracks best with "Always", but still works without it.
  if (Platform.OS === 'ios') {
    try {
      await Location.requestBackgroundPermissionsAsync();
    } catch {
      // Not fatal: carry on with "while using" access.
    }
  }

  await markStep('Checking for an old tracking session');
  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (alreadyRunning) {
    await markStep('Stopping the old tracking session');
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }

  await markStep('Starting location tracking');
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      // High uses GPS. Balanced gave fixes up to 440 m off, with no speed or
      // heading, on the first real drive.
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 25,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Safarnama is tracking your drive',
        notificationBody: 'Listening for nearby stories along your route.',
        notificationColor: '#F77F00',
      },
    });
    await markStep('Tracking started, waiting for first GPS fix');
    setState({ isDriving: true, statusMessage: 'Waiting for GPS fix...' });
    return { ok: true, message: 'Driving started.' };
  } catch (err) {
    // Expo Go can't register background location (ERR_LOCATION_INFO_PLIST),
    // and iOS can refuse it without "Always" access. Track while the app is
    // open instead of failing. The reason is saved for the test info box.
    await recordError('Background tracking could not start', err);
  }

  await markStep('Starting tracking while the app is open');
  foregroundSubscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 25 },
    latest => {
      handleFix(latest).catch(err => recordError('Location update', err));
    },
  );

  await markStep('Tracking started (app open only), waiting for first GPS fix');
  setState({
    isDriving: true,
    statusMessage: 'Waiting for GPS fix... (keep the app open, background tracking is off)',
  });
  return {
    ok: true,
    message: 'Driving started. Stories will only play while the app is open.',
  };
}

/** True when Android/iOS is still running our location tracking. */
export async function isTrackingActive(): Promise<boolean> {
  if (foregroundSubscription) return true;
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}

export async function stopDriving(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (running) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }
  resetPlayback();
  resetExplore();
  setState({ isDriving: false, statusMessage: 'Driving stopped.' });
}
