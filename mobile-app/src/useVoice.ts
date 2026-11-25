import { useEffect, useState } from 'react';
import { testVoice } from './narration';
import type { StoryLanguage } from './types';
import {
  getVoiceFor,
  listVoices,
  loadVoiceSettings,
  setVoiceFor,
  voiceLabel,
  type PhoneVoice,
} from './voice';

const NO_HINDI_VOICE =
  'This phone has no Hindi voice. Open phone Settings, search for "Text-to-speech", open the engine settings, choose "Install voice data", and install Hindi. Then reopen Safarnama.';

/** Voice choice and voice testing for one language, shared by several screens. */
export function useVoice(language: StoryLanguage) {
  const [voices, setVoices] = useState<PhoneVoice[]>([]);
  const [voiceId, setVoiceId] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // The voices on offer depend on the chosen language.
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    (async () => {
      await loadVoiceSettings();
      const found = await listVoices(language);
      if (cancelled) return;
      setVoices(found);
      setVoiceId(getVoiceFor(language));
    })();
    return () => {
      cancelled = true;
    };
  }, [language]);

  const test = async () => {
    if (language === 'hi' && !voices.length) {
      setResult(NO_HINDI_VOICE);
      return;
    }
    setTesting(true);
    setResult('You should hear a short line now.');
    const { reason, seconds } = await testVoice(language);
    setTesting(false);
    if (reason === 'finished' && seconds < 2) {
      // The test line takes about four seconds. Ending at once means the
      // phone accepted it but had no voice that could read it.
      setResult('That ended at once, so it was probably not spoken. Try the next voice.');
    } else if (reason === 'finished') {
      setResult('Voice works. If you heard nothing, turn up the media volume.');
    } else if (reason === 'no_voice' || reason === 'error' || reason === 'timeout') {
      setResult(
        language === 'hi'
          ? "The Hindi voice did not start. Try the next voice, or install Hindi in the phone's Text-to-speech settings."
          : "The phone's voice did not start. Check Text-to-speech in the phone's settings.",
      );
    } else {
      setResult(null);
    }
  };

  // Moves to the next voice on the phone and plays a sample. After the last
  // one it goes back to the phone's own default.
  const next = async () => {
    const current = voiceId ?? (language === 'hi' ? voices[0]?.identifier : undefined);
    const index = voices.findIndex(voice => voice.identifier === current);
    const chosen = index + 1 < voices.length ? voices[index + 1] : undefined;
    await setVoiceFor(language, chosen?.identifier);
    setVoiceId(chosen?.identifier);
    await test();
  };

  const picked = voices.find(voice => voice.identifier === voiceId);
  const label = picked
    ? voiceLabel(picked)
    : language === 'hi' && voices.length
      ? `${voiceLabel(voices[0])} (picked for you)`
      : language === 'hi'
        ? 'No Hindi voice on this phone'
        : "The phone's own voice";

  return { voices, label, result, testing, test, next, hasVoice: language !== 'hi' || voices.length > 0 };
}
