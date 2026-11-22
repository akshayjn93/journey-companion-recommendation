import * as Speech from 'expo-speech';

/** Why a narration ended. */
export type EndReason =
  | 'finished'
  | 'skipped'
  | 'paused'
  | 'stopped'
  | 'error'
  | 'timeout'
  | 'no_voice'; // the phone never started speaking

/** If the phone has not started speaking after this long, the voice is not working. */
const START_TIMEOUT_MS = 8000;

type OnEnd = (reason: EndReason, listenedSeconds: number) => void;

type Utterance = {
  token: number;
  startedAt: number;
  /** True once the phone reports that it has begun to speak. */
  voiceStarted: boolean;
  startTimer: ReturnType<typeof setTimeout> | null;
  maxMs: number;
  onEnd: OnEnd;
};

let current: Utterance | null = null;
let nextToken = 0;

function end(token: number, reason: EndReason) {
  if (!current || current.token !== token) return;
  const finished = current;
  current = null;
  if (finished.startTimer) clearTimeout(finished.startTimer);
  finished.onEnd(reason, Math.round((Date.now() - finished.startedAt) / 1000));
}

/**
 * Speaks one story. `onEnd` is called exactly once, with the reason it ended
 * and how many seconds were heard.
 */
export function speakStory(text: string, onEnd: OnEnd, language: string = 'en') {
  // Cut off anything still playing. Nothing to stop on a quiet phone.
  if (current) stopSpeaking('stopped');
  const token = ++nextToken;
  current = {
    token,
    startedAt: Date.now(),
    voiceStarted: false,
    startTimer: setTimeout(() => {
      if (current?.token === token && !current.voiceStarted) end(token, 'no_voice');
    }, START_TIMEOUT_MS),
    // Safety net in case the phone never reports that speech ended:
    // allow about 3 words per second at the slowest, and at least 30 seconds.
    maxMs: Math.max(30000, text.length * 150),
    onEnd,
  };
  Speech.speak(text, {
    language,
    onStart: () => {
      if (current?.token === token) current.voiceStarted = true;
    },
    onDone: () => end(token, 'finished'),
    onStopped: () => end(token, 'stopped'),
    onError: () => end(token, 'error'),
  });
}

/** True while a story is being spoken. */
export function isSpeaking(): boolean {
  if (!current) return false;
  const elapsed = Date.now() - current.startedAt;
  // Timers can be late in the background, so check here as well.
  if (!current.voiceStarted && elapsed > START_TIMEOUT_MS) {
    end(current.token, 'no_voice');
    return false;
  }
  if (elapsed > current.maxMs) {
    end(current.token, 'timeout');
    return false;
  }
  return true;
}

export function stopSpeaking(reason: EndReason = 'stopped') {
  if (current) end(current.token, reason);
  Speech.stop();
}

/** Speaks one short line and reports whether the phone's voice works. */
export function testVoice(): Promise<EndReason> {
  return new Promise(resolve => {
    speakStory('This is Safarnama. Your voice is working.', reason => resolve(reason));
  });
}
