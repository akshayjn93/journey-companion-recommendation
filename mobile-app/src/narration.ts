import * as Speech from 'expo-speech';

/** Why a narration ended. */
export type EndReason = 'finished' | 'skipped' | 'paused' | 'stopped' | 'error' | 'timeout';

type OnEnd = (reason: EndReason, listenedSeconds: number) => void;

type Utterance = {
  token: number;
  startedAt: number;
  maxMs: number;
  onEnd: OnEnd;
};

let current: Utterance | null = null;
let nextToken = 0;

function end(token: number, reason: EndReason) {
  if (!current || current.token !== token) return;
  const finished = current;
  current = null;
  finished.onEnd(reason, Math.round((Date.now() - finished.startedAt) / 1000));
}

/**
 * Speaks one story. `onEnd` is called exactly once, with the reason it ended
 * and how many seconds were heard.
 */
export function speakStory(text: string, onEnd: OnEnd, language: string = 'en') {
  stopSpeaking('stopped');
  const token = ++nextToken;
  current = {
    token,
    startedAt: Date.now(),
    // Safety net in case the phone never reports that speech ended:
    // allow about 3 words per second at the slowest, and at least 30 seconds.
    maxMs: Math.max(30000, text.length * 150),
    onEnd,
  };
  Speech.speak(text, {
    language,
    onDone: () => end(token, 'finished'),
    onStopped: () => end(token, 'stopped'),
    onError: () => end(token, 'error'),
  });
}

/** True while a story is being spoken. */
export function isSpeaking(): boolean {
  if (!current) return false;
  if (Date.now() - current.startedAt > current.maxMs) {
    end(current.token, 'timeout');
    return false;
  }
  return true;
}

export function stopSpeaking(reason: EndReason = 'stopped') {
  if (current) end(current.token, reason);
  Speech.stop();
}
