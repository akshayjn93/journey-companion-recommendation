import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fetchJourneySimulation } from './src/api';
import {
  clearLastRun,
  installGlobalErrorHandler,
  markStep,
  readLastRun,
  recordError,
  type LastRun,
} from './src/diagnostics';
import './src/locationTask';
import { isTrackingActive, startDriving, stopDriving } from './src/locationTask';
import { speak, stopSpeaking } from './src/narration';
import {
  getState,
  hydrate,
  setState,
  subscribe,
  resetJourneyState,
  type DrivingState,
} from './src/store';
import type { Story } from './src/types';

// Bumped to v2 so devices with a stale LAN-IP apiBase saved under the old key
// pick up the new Render default instead of silently overriding it.
const SETTINGS_KEY = 'journey-companion:settings:v2';

installGlobalErrorHandler();

export default function App() {
  const [apiBase, setApiBase] = useState('https://journey-companion-recommendation.onrender.com');
  const [journeyId, setJourneyId] = useState('4e322cd9-43a0-4dd2-aec4-d474e0ba797f');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drivingState, setDrivingState] = useState<DrivingState>(getState());
  const [lastRun, setLastRun] = useState<LastRun | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then(raw => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (saved.apiBase) setApiBase(saved.apiBase);
        if (saved.journeyId) setJourneyId(saved.journeyId);
      } catch {
        // ignore malformed saved settings
      }
    });
    const unsubscribe = subscribe(setDrivingState);
    // If the app was closed mid-drive and tracking is still running, go straight
    // back to the driving screen. If tracking has stopped, the start screen
    // offers "Resume saved journey" instead. We never restart tracking without
    // a tap, so a crash can not turn into a crash loop.
    hydrate().then(async () => {
      const active = await isTrackingActive();
      if (getState().isDriving !== active) setState({ isDriving: active });
      if (!active) setLastRun(await readLastRun());
    });
    return unsubscribe;
  }, []);

  const handleResumeSaved = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const outcome = await startDriving();
      if (!outcome.ok) setLoadError(outcome.message);
    } catch (err: any) {
      await recordError('Resume journey', err);
      setLoadError(err?.message ?? 'Failed to resume journey.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartDriving = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiBase, journeyId }));
      await markStep('Downloading the journey');
      const result = await fetchJourneySimulation(apiBase, journeyId);
      await markStep(`Journey downloaded, ${result.stories.length} stories`);
      if (!result.stories.length) {
        setLoadError('This journey returned no stories. Check the journey ID and API base.');
        return;
      }
      resetJourneyState(result.journeyId, result.stories);
      const outcome = await startDriving();
      if (!outcome.ok) {
        setLoadError(outcome.message);
      }
    } catch (err: any) {
      await recordError('Start driving', err);
      setLoadError(err?.message ?? 'Failed to load journey.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopDriving = async () => {
    stopSpeaking();
    await stopDriving();
    await clearLastRun();
    setLastRun(null);
  };

  const currentStory: Story | undefined = drivingState.stories.find(
    story => story.id === drivingState.currentStoryId,
  );

  if (!drivingState.isDriving) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Safarnama</Text>
        <Text style={styles.label}>Backend API base URL</Text>
        <TextInput
          style={styles.input}
          value={apiBase}
          onChangeText={setApiBase}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://journey-companion-recommendation.onrender.com"
        />
        <Text style={styles.label}>Journey ID</Text>
        <TextInput
          style={styles.input}
          value={journeyId}
          onChangeText={setJourneyId}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="journey id"
        />
        {isLoading ? (
          <ActivityIndicator style={styles.spacer} />
        ) : (
          <View style={styles.spacer}>
            <Button title="Start driving" onPress={handleStartDriving} />
          </View>
        )}
        {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
        {!isLoading && drivingState.stories.length ? (
          <View style={[styles.card, styles.spacer]}>
            <Text style={styles.storyBody}>
              Saved on this phone: {drivingState.stories.length} stories,{' '}
              {drivingState.triggeredIds.size} already played. No internet needed.
            </Text>
            <Button title="Resume saved journey" onPress={handleResumeSaved} />
          </View>
        ) : null}
        {lastRun?.step || lastRun?.error ? (
          <View style={[styles.card, styles.spacer]}>
            <Text style={styles.storyMeta}>Test info: last session did not end with Stop.</Text>
            {lastRun.step ? <Text style={styles.storyMeta}>Last step: {lastRun.step}</Text> : null}
            {lastRun.error ? (
              <Text selectable style={styles.storyMeta}>
                Error: {lastRun.error}
              </Text>
            ) : null}
          </View>
        ) : null}
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Driving</Text>
      <Text style={styles.status}>{drivingState.statusMessage}</Text>

      {currentStory ? (
        <View style={styles.card}>
          <Text style={styles.tag}>{currentStory.category}</Text>
          <Text style={styles.storyTitle}>{currentStory.title}</Text>
          <Text style={styles.storyBody}>{currentStory.summary}</Text>
          <Text style={styles.storyMeta}>Cue: {currentStory.cue}</Text>
          <Text style={styles.storyMeta}>Tags: {currentStory.tags.join(', ') || 'general'}</Text>
          <View style={styles.spacer}>
            <Button title="Replay narration" onPress={() => speak(currentStory.summary)} />
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.storyBody}>
            No story has triggered yet — drive towards your route and the nearest story will play
            automatically.
          </Text>
        </View>
      )}

      <Text style={styles.label}>
        {drivingState.triggeredIds.size} of {drivingState.stories.length} stories triggered
      </Text>

      <View style={styles.spacer}>
        <Button title="Stop driving" color="#b00020" onPress={handleStopDriving} />
      </View>
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 72,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: '#555',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  spacer: {
    marginTop: 20,
  },
  error: {
    color: '#b00020',
    marginTop: 16,
  },
  status: {
    color: '#555',
    marginBottom: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
  },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: '#eef2ff',
    color: '#3949ab',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  storyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  storyBody: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  storyMeta: {
    fontSize: 13,
    color: '#555',
    marginTop: 4,
  },
});
