import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { haversineMeters } from './geo';
import { speak } from './narration';
import { getState, setState } from './store';

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

  const { stories, triggeredIds } = getState();
  const untriggered = stories.filter(story => story.triggerPoint && !triggeredIds.has(story.id));

  if (!untriggered.length) {
    setState({ statusMessage: 'All stories on this route have been triggered.' });
    return;
  }

  const current: [number, number] = [latest.coords.longitude, latest.coords.latitude];
  const accuracyText = Number.isFinite(latest.coords.accuracy)
    ? `±${Math.round(latest.coords.accuracy ?? 0)}m`
    : 'unknown accuracy';

  let nearest = untriggered[0];
  let nearestDistance = Infinity;
  for (const story of untriggered) {
    const point = story.triggerPoint!;
    const distance = haversineMeters(current, [point.lng, point.lat]);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = story;
    }
  }

  if (nearestDistance <= TRIGGER_RADIUS_METERS) {
    const updatedTriggered = new Set(triggeredIds);
    updatedTriggered.add(nearest.id);
    setState({
      triggeredIds: updatedTriggered,
      currentStoryId: nearest.id,
      statusMessage: `Triggered "${nearest.title}" (${Math.round(nearestDistance)}m away, ${accuracyText}).`,
    });
    speak(nearest.summary);
  } else {
    setState({
      statusMessage: `GPS fix received (${accuracyText}). Next: "${nearest.title}" in ~${Math.round(nearestDistance)}m.`,
    });
  }
});

export async function startDriving(): Promise<{ ok: boolean; message: string }> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    return { ok: false, message: 'Location permission (while using the app) was denied.' };
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    return {
      ok: false,
      message:
        'Background location permission was denied — stories will only trigger while the app is open and in the foreground. You can still continue, or grant "Always" location access in Settings for background triggering.',
    };
  }

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (alreadyRunning) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 5000,
    distanceInterval: 25,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Journey Companion is tracking your drive',
      notificationBody: 'Listening for nearby stories along your route.',
    },
  });

  setState({ isDriving: true, statusMessage: 'Waiting for GPS fix...' });
  return { ok: true, message: 'Driving started.' };
}

export async function stopDriving(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (running) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
  setState({ isDriving: false, statusMessage: 'Driving stopped.' });
}
