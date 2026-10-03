import * as Speech from 'expo-speech';

export function speak(text: string, language: string = 'en') {
  Speech.stop();
  Speech.speak(text, { language });
}

export function stopSpeaking() {
  Speech.stop();
}
