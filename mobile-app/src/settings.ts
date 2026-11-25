import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StoryLanguage } from './types';

/**
 * The user's choices, saved on the phone. One small store that screens can
 * subscribe to, and that the background location task can read.
 */

// v2 is kept from the test builds, so their saved settings carry over.
const SETTINGS_KEY = 'journey-companion:settings:v2';

export const DEFAULT_API_BASE = 'https://journey-companion-recommendation.onrender.com';
const DEFAULT_JOURNEY_ID = 'a9aae4bc-9c19-4c95-b1d5-b0927c848125'; // Delhi to Chandigarh

/** How often stories are told. */
export type Talkativeness = 'quiet' | 'normal' | 'talkative';

/** Quiet time between stories in explore mode, for each setting. */
export const GAP_MINUTES: Record<Talkativeness, number> = { quiet: 8, normal: 5, talkative: 3 };

export type Settings = {
  apiBase: string;
  journeyId: string;
  storyLanguage: StoryLanguage;
  talkativeness: Talkativeness;
  /** True once the first-run screens have been finished. */
  onboarded: boolean;
  /** True once the hidden developer menu has been unlocked. */
  developer: boolean;
};

const settings: Settings = {
  apiBase: DEFAULT_API_BASE,
  journeyId: DEFAULT_JOURNEY_ID,
  storyLanguage: 'en',
  talkativeness: 'normal',
  onboarded: false,
  developer: false,
};

type Listener = (next: Settings) => void;
const listeners = new Set<Listener>();
let loading: Promise<Settings> | null = null;

/** Safe to call many times. The background task calls it after a relaunch. */
export function loadSettings(): Promise<Settings> {
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        if (saved && typeof saved === 'object') {
          if (typeof saved.apiBase === 'string' && saved.apiBase) settings.apiBase = saved.apiBase;
          if (typeof saved.journeyId === 'string' && saved.journeyId) settings.journeyId = saved.journeyId;
          if (saved.storyLanguage === 'hi') settings.storyLanguage = 'hi';
          if (saved.talkativeness === 'quiet' || saved.talkativeness === 'talkative') {
            settings.talkativeness = saved.talkativeness;
          }
          settings.onboarded = Boolean(saved.onboarded);
          settings.developer = Boolean(saved.developer);
        }
      } catch {
        // Unreadable settings: carry on with the defaults.
      }
      return { ...settings };
    })();
  }
  return loading;
}

export function getSettings(): Settings {
  return settings;
}

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateSettings(partial: Partial<Settings>) {
  Object.assign(settings, partial);
  const snapshot = { ...settings };
  listeners.forEach(listener => listener(snapshot));
  AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot)).catch(() => {
    // The choice still applies until the app closes.
  });
}
