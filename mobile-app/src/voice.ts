import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import type { StoryLanguage } from './types';

/**
 * Which phone voice to use for each language, and how fast it speaks.
 * The voices themselves come from the phone's text-to-speech engine.
 */
const VOICE_KEY = 'journey-companion:voice:v1';

/** A little slower than normal, so the words are easier to follow in a car. */
export const SPEECH_RATE = 0.9;

export type PhoneVoice = {
  identifier: string;
  name: string;
  language: string;
  enhanced: boolean;
};

let chosen: Partial<Record<StoryLanguage, string>> = {};
let loading: Promise<void> | null = null;

/** Safe to call many times. The background task calls it after a relaunch. */
export function loadVoiceSettings(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(VOICE_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        if (saved && typeof saved === 'object') chosen = saved;
      } catch {
        // No saved choice: use the phone's default voice.
      }
    })();
  }
  return loading;
}

/** The voice picked for this language, or undefined for the phone's default. */
export function getVoiceFor(language: StoryLanguage): string | undefined {
  return chosen[language];
}

export async function setVoiceFor(language: StoryLanguage, identifier: string | undefined) {
  chosen = { ...chosen };
  if (identifier) chosen[language] = identifier;
  else delete chosen[language];
  try {
    await AsyncStorage.setItem(VOICE_KEY, JSON.stringify(chosen));
  } catch {
    // The choice still applies until the app closes.
  }
}

/** Voices on this phone for a language. Indian voices first, then better quality. */
export async function listVoices(language: StoryLanguage): Promise<PhoneVoice[]> {
  let voices: Speech.Voice[] = [];
  try {
    voices = await Speech.getAvailableVoicesAsync();
  } catch {
    return [];
  }
  const indian = (voice: PhoneVoice) => (/-in\b/i.test(voice.language) ? 0 : 1);
  return voices
    .filter(voice => voice.language?.toLowerCase().startsWith(language))
    .map(voice => ({
      identifier: voice.identifier,
      name: voice.name,
      language: voice.language,
      enhanced: voice.quality === Speech.VoiceQuality.Enhanced,
    }))
    .sort(
      (a, b) =>
        indian(a) - indian(b) ||
        Number(b.enhanced) - Number(a.enhanced) ||
        a.identifier.localeCompare(b.identifier),
    );
}

/** A short label for a voice, for example "en-IN · x-ene-network (better quality)". */
export function voiceLabel(voice: PhoneVoice): string {
  const short = voice.name.replace(new RegExp(`^${voice.language}-?`, 'i'), '') || voice.name;
  return `${voice.language} · ${short}${voice.enhanced ? ' (better quality)' : ''}`;
}
