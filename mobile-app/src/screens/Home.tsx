import { Pressable, Text, View } from 'react-native';
import { AppButton, Card, Choice, Gap, Screen } from '../ui';
import { colors, space, type } from '../theme';
import type { StoryLanguage } from '../types';

/** The first screen people see: one big button to start a drive. */
export function Home({
  language,
  onLanguage,
  loading,
  error,
  savedStories,
  onStart,
  onUseSaved,
  onAround,
  onSettings,
  version,
  onVersionTap,
}: {
  language: StoryLanguage;
  onLanguage: (language: StoryLanguage) => void;
  loading: boolean;
  error: string | null;
  /** Stories already saved on the phone from the last drive. */
  savedStories: number;
  onStart: () => void;
  onUseSaved: () => void;
  onAround: () => void;
  onSettings: () => void;
  version: string;
  onVersionTap: () => void;
}) {
  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={type.hero}>Safarnama</Text>
        <AppButton label="Settings" kind="ghost" onPress={onSettings} />
      </View>
      <Gap size={space.sm} />
      <Text style={[type.body, { color: colors.textMuted }]}>
        Stories about the places you pass, told as you drive.
      </Text>

      <Gap size={space.xxl} />
      <Choice
        value={language}
        onChange={onLanguage}
        options={[
          { value: 'en', label: 'English' },
          { value: 'hi', label: 'हिंदी' },
        ]}
      />

      <Gap size={space.xl} />
      <AppButton label={loading ? 'Getting stories…' : 'Start drive'} big loading={loading} onPress={onStart} />
      <Gap size={space.md} />
      <Text style={type.small}>
        Tap Start while you have internet. Safarnama saves the stories for the road ahead, so they
        keep playing where there is no signal.
      </Text>

      <Gap size={space.xl} />
      <AppButton label="Stories around you" kind="secondary" disabled={loading} onPress={onAround} />
      <Gap size={space.sm} />
      <Text style={type.small}>Not driving? See what is near you and pick a story to hear.</Text>

      {error ? (
        <View>
          <Gap />
          <Card>
            <Text style={[type.body, { color: colors.danger }]}>{error}</Text>
            {savedStories ? (
              <View>
                <Gap size={space.md} />
                <AppButton
                  label={`Drive with ${savedStories} saved stories`}
                  kind="secondary"
                  onPress={onUseSaved}
                />
              </View>
            ) : null}
          </Card>
        </View>
      ) : null}

      <View style={{ flex: 1, minHeight: space.xxl }} />
      <Pressable onPress={onVersionTap} accessibilityLabel={`Version ${version}`}>
        <Text style={[type.small, { textAlign: 'center' }]}>Version {version}</Text>
      </Pressable>
    </Screen>
  );
}
