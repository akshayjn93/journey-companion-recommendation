import { useState } from 'react';
import { Text, View } from 'react-native';
import * as Location from 'expo-location';
import { AppButton, Choice, Gap, Label, Screen } from '../ui';
import { colors, space, type } from '../theme';
import type { StoryLanguage } from '../types';
import { useVoice } from '../useVoice';

/** The three first-run screens: what this is, location, and language. */
export function Onboarding({
  language,
  onLanguage,
  onDone,
}: {
  language: StoryLanguage;
  onLanguage: (language: StoryLanguage) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const voice = useVoice(language);

  const askLocation = async () => {
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      if (result.status === 'granted') {
        setStep(2);
      } else {
        setLocationNote(
          'Location is off for Safarnama. You can carry on, but no story can play until you allow it in the phone settings.',
        );
      }
    } catch {
      setLocationNote('Could not ask for location just now. You can allow it later.');
    }
  };

  return (
    <Screen>
      <Text style={type.small}>Step {step + 1} of 3</Text>
      <Gap size={space.md} />

      {step === 0 ? (
        <View>
          <Text style={type.hero}>Safarnama</Text>
          <Gap size={space.md} />
          <Text style={type.title}>The road has stories. Hear them as you drive.</Text>
          <Gap />
          <Text style={type.body}>
            Safarnama tells you short stories about the places you are passing: an old fort, a
            famous dhaba, a river, a battle.
          </Text>
          <Gap size={space.md} />
          <Text style={type.body}>
            Each one takes about half a minute. You start it once and put the phone away.
          </Text>
          <Gap size={space.xxl} />
          <AppButton label="Next" big onPress={() => setStep(1)} />
        </View>
      ) : null}

      {step === 1 ? (
        <View>
          <Text style={type.title}>Safarnama needs your location</Text>
          <Gap />
          <Text style={type.body}>
            It uses your location to pick the story for the place just ahead of you. That is the
            only thing it uses it for.
          </Text>
          <Gap size={space.md} />
          <Text style={type.body}>
            Your location stays on your phone. It is used only while a drive is running.
          </Text>
          <Gap size={space.xxl} />
          <AppButton label="Allow location" big onPress={askLocation} />
          {locationNote ? (
            <View>
              <Gap size={space.md} />
              <Text style={[type.small, { color: colors.danger }]}>{locationNote}</Text>
              <Gap size={space.md} />
              <AppButton label="Carry on without it" kind="secondary" onPress={() => setStep(2)} />
            </View>
          ) : null}
        </View>
      ) : null}

      {step === 2 ? (
        <View>
          <Text style={type.title}>Pick your language</Text>
          <Gap />
          <Choice
            value={language}
            onChange={onLanguage}
            options={[
              { value: 'en', label: 'English' },
              { value: 'hi', label: 'हिंदी' },
            ]}
          />
          <Gap />
          <Label>Voice</Label>
          <Text style={type.body}>{voice.label}</Text>
          <Gap size={space.md} />
          <AppButton label="Hear the voice" kind="secondary" loading={voice.testing} onPress={voice.test} />
          <Gap size={space.sm} />
          <AppButton
            label="Try another voice"
            kind="secondary"
            disabled={!voice.voices.length || voice.testing}
            onPress={voice.next}
          />
          {voice.result ? (
            <View>
              <Gap size={space.md} />
              <Text style={type.small}>{voice.result}</Text>
            </View>
          ) : null}
          <Gap size={space.xxl} />
          <AppButton label="Done" big onPress={onDone} />
          <Gap size={space.sm} />
          <Text style={type.small}>You can change all of this later in Settings.</Text>
        </View>
      ) : null}
    </Screen>
  );
}
