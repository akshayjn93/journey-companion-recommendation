import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Share } from 'react-native';
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
import { fetchNearbyForPreview, prepareExplore } from './src/explore';
import './src/locationTask';
import { isTrackingActive, startDriving, stopDriving } from './src/locationTask';
import { speakStory, stopSpeaking } from './src/narration';
import {
  getLastPosition,
  playStoryNow,
  replayCurrentStory,
  setPaused,
  skipCurrentStory,
} from './src/playback';
import { clearPlayLog, readPlayLog, type PlayLogEntry } from './src/playLog';
import { PreviewScreen } from './src/PreviewScreen';
import { getRatings, loadRatings, rateStory, subscribeRatings, type Rating } from './src/ratings';
import { Around } from './src/screens/Around';
import { Developer } from './src/screens/Developer';
import { Driving } from './src/screens/Driving';
import { Home } from './src/screens/Home';
import { Onboarding } from './src/screens/Onboarding';
import { SettingsScreen } from './src/screens/Settings';
import { Summary } from './src/screens/Summary';
import {
  getSettings,
  loadSettings,
  subscribeSettings,
  updateSettings,
  type Settings,
} from './src/settings';
import {
  forgetExplorePlayed,
  getState,
  hydrate,
  readExplorePlayed,
  resetJourneyState,
  setState,
  subscribe,
  type DrivingState,
} from './src/store';
import { buildTripSummary, type TripSummary } from './src/trip';
import type { Story, TriggerPoint } from './src/types';
import type { InterestKey } from './src/interests';
import { Screen } from './src/ui';
import { hasVoiceFor, loadVoiceSettings } from './src/voice';

installGlobalErrorHandler();

const VERSION = `${appConfig.expo.version} (build ${appConfig.expo.android.versionCode})`;

type Page = 'home' | 'settings' | 'developer';

const NO_HINDI_VOICE =
  'This phone has no Hindi voice yet. Open Settings in Safarnama to see how to add one, or switch to English.';

/** Turns a technical error into something a driver can act on. */
function friendly(err: any, fallback: string): string {
  if (err?.name === 'AbortError') {
    return 'The stories took too long to arrive. Check your internet and try again.';
  }
  const message = String(err?.message ?? '');
  if (/network request failed|failed to fetch/i.test(message)) {
    return 'No internet right now. Connect and try again.';
  }
  return message || fallback;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>({ ...getSettings() });
  const [drivingState, setDrivingState] = useState<DrivingState>(getState());
  const [ratings, setRatings] = useState<Record<string, Rating>>(getRatings());
  const [page, setPage] = useState<Page>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trip, setTrip] = useState<TripSummary | null>(null);
  const [preview, setPreview] = useState<{ title: string; stories: Story[] } | null>(null);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [playLog, setPlayLog] = useState<PlayLogEntry[]>([]);
  const [playedCount, setPlayedCount] = useState(0);
  const versionTaps = useRef<number[]>([]);
  // "Stories around you". During a drive it uses the stories already saved;
  // from the home screen it downloads the ones near the phone.
  const [aroundOpen, setAroundOpen] = useState(false);
  const [around, setAround] = useState<{ stories: Story[]; position: TriggerPoint } | null>(null);
  const [aroundPlayingId, setAroundPlayingId] = useState<string | null>(null);
  const [heardIds, setHeardIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const stopSettings = subscribeSettings(setSettings);
    const stopDrivingState = subscribe(setDrivingState);
    const stopRatings = subscribeRatings(setRatings);

    (async () => {
      setSettings(await loadSettings());
      await loadRatings();
      setRatings(getRatings());
      // If the app was closed mid-drive and tracking is still running, go
      // straight back to the driving screen. We never restart tracking without
      // a tap, so a crash can not turn into a crash loop.
      await hydrate();
      const active = await isTrackingActive();
      if (getState().isDriving !== active) setState({ isDriving: active });
      if (!active) setLastRun(await readLastRun());
      setPlayedCount((await readExplorePlayed()).length);
      setReady(true);
    })();

    return () => {
      stopSettings();
      stopDrivingState();
      stopRatings();
    };
  }, []);

  // The phone's Back button steps back through our screens before leaving the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (getState().isDriving) {
        if (!aroundOpen) return false;
        setAroundOpen(false);
        return true;
      }
      if (around) {
        closeAround();
        return true;
      }
      if (preview) {
        setPreview(null);
        return true;
      }
      if (trip) {
        setTrip(null);
        return true;
      }
      if (page === 'developer') {
        setPage('settings');
        return true;
      }
      if (page === 'settings') {
        setPage('home');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [page, preview, trip, around, aroundOpen]);

  /** Checks the phone can speak the chosen language before a drive starts. */
  const voiceProblem = async (): Promise<string | null> => {
    await loadVoiceSettings();
    return settings.storyLanguage === 'hi' && !hasVoiceFor('hi') ? NO_HINDI_VOICE : null;
  };

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const problem = await voiceProblem();
      if (problem) {
        setError(problem);
        return;
      }
      const prepared = await prepareExplore(settings.apiBase, settings.storyLanguage);
      if (!prepared.ok) {
        setError(prepared.message);
        return;
      }
      const outcome = await startDriving();
      if (!outcome.ok) setError(outcome.message);
    } catch (err: any) {
      await recordError('Start drive', err);
      setError(friendly(err, 'Could not get the stories. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  // Starts a drive with the stories already on the phone, for when there is no internet.
  const handleUseSaved = async () => {
    setLoading(true);
    setError(null);
    try {
      const outcome = await startDriving();
      if (!outcome.ok) setError(outcome.message);
    } catch (err: any) {
      await recordError('Drive with saved stories', err);
      setError(friendly(err, 'Could not start the drive.'));
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setAroundOpen(false);
    const state = getState();
    let summary: TripSummary = { minutes: 0, stories: [] };
    try {
      summary = await buildTripSummary(state.driveStartedAt, state.stories);
    } catch (err) {
      await recordError('Trip summary', err);
    }
    await stopDriving();
    await clearLastRun();
    setLastRun(null);
    setPlayedCount((await readExplorePlayed()).length);
    setError(null);
    setPage('home');
    setTrip(summary);
  };

  // ---- "Stories around you" ----------------------------------------------

  const closeAround = () => {
    stopSpeaking('stopped');
    setAroundPlayingId(null);
    setAround(null);
  };

  // From the home screen: find the phone and get the stories near it.
  const handleAround = async () => {
    setLoading(true);
    setError(null);
    try {
      const problem = await voiceProblem();
      if (problem) {
        setError(problem);
        return;
      }
      const result = await fetchNearbyForPreview(settings.apiBase, settings.storyLanguage);
      if (!result.stories.length) {
        setError('No stories within 100 km of you yet.');
        return;
      }
      setHeardIds(new Set(await readExplorePlayed()));
      setAround({ stories: result.stories, position: result.center });
    } catch (err: any) {
      await recordError('Stories around you', err);
      setError(friendly(err, 'Could not get the stories near you. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  // Outside a drive, a picked story is simply spoken. It is not marked as heard.
  const playAround = (story: Story) => {
    setAroundPlayingId(story.id);
    speakStory(
      story.summary,
      () => setAroundPlayingId(current => (current === story.id ? null : current)),
      story.language ?? 'en',
    );
  };

  // Five quick taps on the version number unlock the developer menu.
  const handleVersionTap = () => {
    const now = Date.now();
    versionTaps.current = [...versionTaps.current.filter(at => now - at < 3000), now];
    if (versionTaps.current.length >= 5 && !settings.developer) {
      versionTaps.current = [];
      updateSettings({ developer: true });
      Alert.alert('Developer menu unlocked', 'You will find it at the bottom of Settings.');
    }
  };

  const toggleInterest = (key: InterestKey) => {
    const current = getSettings().interests;
    updateSettings({
      interests: current.includes(key) ? current.filter(item => item !== key) : [...current, key],
    });
  };

  const handleForgetPlayed = async () => {
    await forgetExplorePlayed();
    setPlayedCount(0);
  };

  // ---- Developer menu actions -------------------------------------------

  const handleStartPlanned = async () => {
    setLoading(true);
    setError(null);
    try {
      await markStep('Downloading the journey');
      const result = await fetchJourneySimulation(
        settings.apiBase,
        settings.journeyId,
        settings.storyLanguage,
      );
      await markStep(`Journey downloaded, ${result.stories.length} stories`);
      if (!result.stories.length) {
        setError('This journey returned no stories. Check the journey ID and backend address.');
        return;
      }
      resetJourneyState(result.journeyId, result.stories);
      const outcome = await startDriving();
      if (!outcome.ok) setError(outcome.message);
    } catch (err: any) {
      await recordError('Start planned journey', err);
      setError(friendly(err, 'Failed to load the journey.'));
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (source: 'journey' | 'nearby') => {
    setLoading(true);
    setError(null);
    try {
      const languageName = settings.storyLanguage === 'hi' ? 'Hindi' : 'English';
      if (source === 'journey') {
        const result = await fetchJourneySimulation(
          settings.apiBase,
          settings.journeyId,
          settings.storyLanguage,
        );
        if (!result.stories.length) {
          setError('This journey returned no stories. Check the journey ID and backend address.');
          return;
        }
        setPreview({
          title: `Planned journey, in the order they would play (${languageName})`,
          stories: result.stories,
        });
      } else {
        const result = await fetchNearbyForPreview(settings.apiBase, settings.storyLanguage);
        if (!result.stories.length) {
          setError('No stories within 100 km of you yet.');
          return;
        }
        setPreview({
          title: `Stories within 100 km of you, nearest first (${languageName})`,
          stories: result.stories,
        });
      }
    } catch (err: any) {
      await recordError('Preview stories', err);
      setError(friendly(err, 'Failed to load stories.'));
    } finally {
      setLoading(false);
    }
  };

  const handleShareLog = async () => {
    const entries = await readPlayLog();
    setPlayLog(entries);
    try {
      await Share.share({ title: 'Safarnama play log', message: JSON.stringify(entries) });
    } catch (err) {
      await recordError('Share play log', err);
    }
  };

  const handleClearLog = () => {
    Alert.alert('Clear play log?', 'This removes the saved drive log from this phone.', [
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

  const openDeveloper = async () => {
    setError(null);
    setPlayLog(await readPlayLog());
    setLastRun(await readLastRun());
    setPage('developer');
  };

  // ---- Which screen to show ---------------------------------------------

  if (!ready) return <Screen>{null}</Screen>;

  if (drivingState.isDriving && aroundOpen) {
    const here = getLastPosition();
    return (
      <Around
        stories={drivingState.stories}
        position={here ? { lng: here.lng, lat: here.lat } : null}
        heardIds={drivingState.triggeredIds}
        playingId={drivingState.isSpeaking ? drivingState.currentStoryId : null}
        onPlay={playStoryNow}
        onStop={skipCurrentStory}
        onBack={() => setAroundOpen(false)}
      />
    );
  }

  if (drivingState.isDriving) {
    const story = drivingState.stories.find(item => item.id === drivingState.currentStoryId);
    return (
      <Driving
        state={drivingState}
        story={story}
        rating={story ? ratings[story.id] : undefined}
        onRate={rating => story && rateStory(story, rating)}
        onSkip={skipCurrentStory}
        onReplay={replayCurrentStory}
        onPause={setPaused}
        onAround={() => setAroundOpen(true)}
        onStop={handleStop}
      />
    );
  }

  if (trip) return <Summary trip={trip} onDone={() => setTrip(null)} />;

  if (around) {
    return (
      <Around
        stories={around.stories}
        position={around.position}
        heardIds={heardIds}
        playingId={aroundPlayingId}
        onPlay={playAround}
        onStop={() => {
          stopSpeaking('stopped');
          setAroundPlayingId(null);
        }}
        onBack={closeAround}
      />
    );
  }

  if (preview) {
    return (
      <PreviewScreen
        title={preview.title}
        stories={preview.stories}
        onClose={() => setPreview(null)}
      />
    );
  }

  if (!settings.onboarded) {
    return (
      <Onboarding
        language={settings.storyLanguage}
        onLanguage={storyLanguage => updateSettings({ storyLanguage })}
        interests={settings.interests}
        onToggleInterest={toggleInterest}
        onDone={() => updateSettings({ onboarded: true })}
      />
    );
  }

  if (page === 'settings') {
    return (
      <SettingsScreen
        settings={settings}
        onLanguage={storyLanguage => updateSettings({ storyLanguage })}
        onTalkativeness={talkativeness => updateSettings({ talkativeness })}
        onToggleInterest={toggleInterest}
        playedCount={playedCount}
        onForgetPlayed={handleForgetPlayed}
        onDeveloper={openDeveloper}
        onBack={() => setPage('home')}
        version={VERSION}
      />
    );
  }

  if (page === 'developer') {
    return (
      <Developer
        settings={settings}
        onChange={updateSettings}
        loading={loading}
        error={error}
        onStartPlanned={handleStartPlanned}
        onPreviewJourney={() => handlePreview('journey')}
        onPreviewNearby={() => handlePreview('nearby')}
        playLog={playLog}
        onShareLog={handleShareLog}
        onClearLog={handleClearLog}
        lastRun={lastRun}
        onHide={() => {
          updateSettings({ developer: false });
          setPage('home');
        }}
        onBack={() => {
          setError(null);
          setPage('settings');
        }}
      />
    );
  }

  return (
    <Home
      language={settings.storyLanguage}
      onLanguage={storyLanguage => {
        setError(null);
        updateSettings({ storyLanguage });
      }}
      loading={loading}
      error={error}
      savedStories={drivingState.stories.length}
      onStart={handleStart}
      onUseSaved={handleUseSaved}
      onAround={handleAround}
      onSettings={() => {
        setError(null);
        setPage('settings');
      }}
      version={VERSION}
      onVersionTap={handleVersionTap}
    />
  );
}
