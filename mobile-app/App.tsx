import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import appConfig from './app.json';
import { fetchJourneySimulation } from './src/api';
import {
  clearLastRun,
  installGlobalErrorHandler,
  markStep,
  readLastRun,
  recordError,
  type LastRun,
} from './src/diagnostics';
import { prepareExplore } from './src/explore';
import './src/locationTask';
import { isTrackingActive, startDriving, stopDriving } from './src/locationTask';
import { testVoice } from './src/narration';
import { replayCurrentStory, setPaused, skipCurrentStory } from './src/playback';
import { clearPlayLog, readPlayLog, type PlayLogEntry } from './src/playLog';
import {
  forgetExplorePlayed,
  getState,
  hydrate,
  readExplorePlayed,
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
  const [playLog, setPlayLog] = useState<PlayLogEntry[]>([]);
  const [explorePlayed, setExplorePlayed] = useState(0);
  const [voiceResult, setVoiceResult] = useState<string | null>(null);

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
    readPlayLog().then(setPlayLog);
    readExplorePlayed().then(ids => setExplorePlayed(ids.length));
    return unsubscribe;
  }, []);

  const handleTestVoice = async () => {
    setVoiceResult('Testing... you should hear a short line now.');
    const reason = await testVoice();
    if (reason === 'finished') {
      setVoiceResult('Voice works. If you heard nothing, turn up the media volume.');
    } else if (reason === 'no_voice' || reason === 'error' || reason === 'timeout') {
      setVoiceResult(
        "The phone's voice did not start. In phone Settings, search for Text-to-speech and check that an engine and an English voice are installed.",
      );
    } else {
      setVoiceResult(null);
    }
  };

  const handleForgetPlayed = () => {
    Alert.alert(
      'Forget played stories?',
      'Explore mode will be able to tell every story again, including ones you have already heard.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            await forgetExplorePlayed();
            setExplorePlayed(0);
          },
        },
      ],
    );
  };

  const handleShareLog = async () => {
    const entries = await readPlayLog();
    setPlayLog(entries);
    try {
      await Share.share({
        title: 'Safarnama play log',
        message: JSON.stringify(entries),
      });
    } catch (err) {
      await recordError('Share play log', err);
    }
  };

  const handleClearLog = () => {
    Alert.alert('Clear play log?', 'This removes the saved test drive log from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearPlayLog();
          setPlayLog([]);
        },
      },
    ]);
  };

  const countEvents = (event: PlayLogEntry['event']) =>
    playLog.filter(entry => entry.event === event).length;

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

  const handleStartExploring = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiBase, journeyId }));
      const prepared = await prepareExplore(apiBase);
      if (!prepared.ok) {
        setLoadError(prepared.message);
        return;
      }
      const outcome = await startDriving();
      if (!outcome.ok) setLoadError(outcome.message);
    } catch (err: any) {
      await recordError('Start exploring', err);
      setLoadError(
        err?.name === 'AbortError'
          ? 'The server took too long to answer. Check your internet and try again.'
          : (err?.message ?? 'Failed to load nearby stories.'),
      );
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
    await stopDriving();
    await clearLastRun();
    setLastRun(null);
    setPlayLog(await readPlayLog());
    setExplorePlayed((await readExplorePlayed()).length);
  };

  const currentStory: Story | undefined = drivingState.stories.find(
    story => story.id === drivingState.currentStoryId,
  );

  if (!drivingState.isDriving) {
    return (
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Safarnama</Text>
        <Text style={styles.storyMeta}>
          Version {appConfig.expo.version} (build {appConfig.expo.android.versionCode})
        </Text>
        <View style={styles.smallSpacer}>
          <Button title="Test voice" onPress={handleTestVoice} />
          {voiceResult ? <Text style={styles.storyMeta}>{voiceResult}</Text> : null}
        </View>
        <Text style={styles.label}>Backend API base URL</Text>
        <TextInput
          style={styles.input}
          value={apiBase}
          onChangeText={setApiBase}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://journey-companion-recommendation.onrender.com"
        />
        {isLoading ? (
          <ActivityIndicator style={styles.spacer} />
        ) : (
          <View style={styles.spacer}>
            <Button title="Start exploring (no route needed)" onPress={handleStartExploring} />
            <Text style={styles.storyMeta}>
              Downloads the stories around you, then tells them as you drive past. Works from
              anywhere, in any direction.
            </Text>
          </View>
        )}
        <Text style={[styles.label, styles.spacer]}>Or follow a planned journey</Text>
        <Text style={styles.label}>Journey ID</Text>
        <TextInput
          style={styles.input}
          value={journeyId}
          onChangeText={setJourneyId}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="journey id"
        />
        {isLoading ? null : (
          <View style={styles.spacer}>
            <Button title="Start planned journey" onPress={handleStartDriving} />
          </View>
        )}
        {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
        {!isLoading && drivingState.stories.length ? (
          <View style={[styles.card, styles.spacer]}>
            <Text style={styles.storyBody}>
              Saved on this phone ({drivingState.mode === 'explore' ? 'explore' : 'planned journey'}
              ): {drivingState.stories.length} stories, {drivingState.triggeredIds.size} already
              played. No internet needed.
            </Text>
            <Button
              title={drivingState.mode === 'explore' ? 'Resume exploring' : 'Resume saved journey'}
              onPress={handleResumeSaved}
            />
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
        {!isLoading && explorePlayed ? (
          <View style={[styles.card, styles.spacer]}>
            <Text style={styles.storyBody}>
              Explore mode remembers {explorePlayed} stories you have heard and will not repeat
              them.
            </Text>
            <Button title="Forget played stories" color="#b00020" onPress={handleForgetPlayed} />
          </View>
        ) : null}
        {playLog.length ? (
          <View style={[styles.card, styles.spacer]}>
            <Text style={styles.storyBody}>
              Play log: {countEvents('started')} played, {countEvents('finished')} heard to the end,{' '}
              {countEvents('skipped')} skipped, {countEvents('dropped')} dropped.
            </Text>
            <Button title="Share play log" onPress={handleShareLog} />
            <View style={styles.smallSpacer}>
              <Button title="Clear play log" color="#b00020" onPress={handleClearLog} />
            </View>
          </View>
        ) : null}
        <StatusBar style="auto" />
      </ScrollView>
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
            {drivingState.isSpeaking ? (
              <Button title="Skip story" onPress={skipCurrentStory} />
            ) : (
              <Button title="Replay narration" onPress={replayCurrentStory} />
            )}
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.storyBody}>
            {drivingState.mode === 'explore'
              ? 'No story has played yet. Keep driving and the nearest story ahead of you will play automatically.'
              : 'No story has triggered yet — drive towards your route and the nearest story will play automatically.'}
          </Text>
        </View>
      )}

      <Text style={styles.label}>
        {drivingState.mode === 'explore'
          ? `${drivingState.triggeredIds.size} played, ${drivingState.stories.length} stories saved for this area`
          : `${drivingState.triggeredIds.size} of ${drivingState.stories.length} stories triggered`}
        {drivingState.queuedIds.length ? `, ${drivingState.queuedIds.length} waiting` : ''}
      </Text>

      <View style={styles.spacer}>
        <Button
          title={drivingState.isPaused ? 'Resume stories' : 'Pause stories'}
          onPress={() => setPaused(!drivingState.isPaused)}
        />
      </View>

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
    // Room below the last button, so the phone's navigation bar does not cover it.
    paddingBottom: 64,
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
  smallSpacer: {
    marginTop: 8,
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
