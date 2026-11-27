import { Alert, Text, View } from 'react-native';
import { AppButton, Card, Chips, Choice, Gap, Label, Screen } from '../ui';
import { colors, space, type } from '../theme';
import { INTERESTS, type Diet, type InterestKey } from '../interests';
import { GAP_MINUTES, type Settings, type Talkativeness } from '../settings';
import type { StoryLanguage } from '../types';
import { useVoice } from '../useVoice';

export function SettingsScreen({
  settings,
  onLanguage,
  onTalkativeness,
  onToggleInterest,
  onDiet,
  playedCount,
  onForgetPlayed,
  onDeveloper,
  onBack,
  version,
}: {
  settings: Settings;
  onLanguage: (language: StoryLanguage) => void;
  onTalkativeness: (value: Talkativeness) => void;
  onToggleInterest: (key: InterestKey) => void;
  onDiet: (diet: Diet) => void;
  /** How many stories this phone remembers having told. */
  playedCount: number;
  onForgetPlayed: () => void;
  onDeveloper: () => void;
  onBack: () => void;
  version: string;
}) {
  const voice = useVoice(settings.storyLanguage);

  const confirmForget = () =>
    Alert.alert(
      'Hear old stories again?',
      'Safarnama will forget which stories it has already told you, so they can play again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Forget them', style: 'destructive', onPress: onForgetPlayed },
      ],
    );

  return (
    <Screen>
      <AppButton label="‹ Back" kind="ghost" onPress={onBack} />
      <Text style={type.title}>Settings</Text>

      <Gap size={space.xl} />
      <Label>Story language</Label>
      <Choice
        value={settings.storyLanguage}
        onChange={onLanguage}
        options={[
          { value: 'en', label: 'English' },
          { value: 'hi', label: 'हिंदी' },
        ]}
      />

      <Gap size={space.xl} />
      <Label>Voice</Label>
      <Card>
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
        <Gap size={space.md} />
        <Text style={type.small}>
          The voices come from your phone. More can be added in the phone's Text-to-speech settings.
        </Text>
      </Card>

      <Gap size={space.xl} />
      <Label>How often stories play</Label>
      <Choice
        value={settings.talkativeness}
        onChange={onTalkativeness}
        options={[
          { value: 'quiet', label: 'Quiet' },
          { value: 'normal', label: 'Normal' },
          { value: 'talkative', label: 'Talkative' },
        ]}
      />
      <Gap size={space.sm} />
      <Text style={type.small}>
        At least {GAP_MINUTES[settings.talkativeness]} minutes of quiet between stories.
      </Text>

      <Gap size={space.xl} />
      <Label>What you like to hear</Label>
      <Chips options={INTERESTS} values={settings.interests} onToggle={onToggleInterest} />
      <Gap size={space.sm} />
      <Text style={type.small}>
        {settings.interests.length === 0
          ? 'Nothing is picked, so Safarnama will tell every kind of story.'
          : 'These are told first. Other stories still play when none of these is close.'}
      </Text>

      <Gap size={space.xl} />
      <Label>For food stories</Label>
      <Choice
        value={settings.diet}
        onChange={onDiet}
        options={[
          { value: 'all', label: 'I eat everything' },
          { value: 'veg', label: 'Vegetarian only' },
        ]}
      />
      <Gap size={space.sm} />
      <Text style={type.small}>
        {settings.diet === 'veg'
          ? 'You will only hear about places where the story recommends vegetarian food.'
          : 'You will hear about every kind of place to eat.'}
      </Text>

      <Gap size={space.xl} />
      <Label>Stories you have heard</Label>
      <Card>
        <Text style={type.body}>
          {playedCount === 0
            ? 'Safarnama has not told you any stories yet.'
            : `Safarnama remembers ${playedCount === 1 ? '1 story' : `${playedCount} stories`} it has told you, and will not repeat ${playedCount === 1 ? 'it' : 'them'}.`}
        </Text>
        <Gap size={space.md} />
        <AppButton
          label="Hear old stories again"
          kind="secondary"
          disabled={playedCount === 0}
          onPress={confirmForget}
        />
      </Card>

      {settings.developer ? (
        <View>
          <Gap size={space.xl} />
          <AppButton label="Developer menu" kind="secondary" onPress={onDeveloper} />
        </View>
      ) : null}

      <Gap size={space.xl} />
      <Text style={[type.small, { textAlign: 'center', color: colors.textMuted }]}>
        Safarnama version {version}
      </Text>
    </Screen>
  );
}
