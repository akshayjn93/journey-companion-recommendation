import { Text, TextInput, StyleSheet, View } from 'react-native';
import { AppButton, Card, Gap, Label, Screen } from '../ui';
import { colors, radius, space, type } from '../theme';
import type { LastRun } from '../diagnostics';
import type { PlayLogEntry } from '../playLog';
import type { Settings } from '../settings';

/**
 * Tools for testing, hidden from normal users. Opened from Settings after
 * tapping the version number on the home screen five times.
 */
export function Developer({
  settings,
  onChange,
  loading,
  error,
  onStartPlanned,
  onPreviewJourney,
  onPreviewNearby,
  playLog,
  onShareLog,
  onClearLog,
  lastRun,
  onHide,
  onBack,
}: {
  settings: Settings;
  onChange: (partial: Partial<Settings>) => void;
  loading: boolean;
  error: string | null;
  onStartPlanned: () => void;
  onPreviewJourney: () => void;
  onPreviewNearby: () => void;
  playLog: PlayLogEntry[];
  onShareLog: () => void;
  onClearLog: () => void;
  lastRun: LastRun | null;
  onHide: () => void;
  onBack: () => void;
}) {
  const count = (event: PlayLogEntry['event']) => playLog.filter(entry => entry.event === event).length;

  return (
    <Screen>
      <AppButton label="‹ Back" kind="ghost" onPress={onBack} />
      <Text style={type.title}>Developer menu</Text>

      <Gap size={space.xl} />
      <Label>Backend address</Label>
      <TextInput
        style={styles.input}
        value={settings.apiBase}
        onChangeText={apiBase => onChange({ apiBase })}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.textMuted}
      />

      <Gap />
      <Label>Journey ID</Label>
      <TextInput
        style={styles.input}
        value={settings.journeyId}
        onChangeText={journeyId => onChange({ journeyId })}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.textMuted}
      />
      <Gap size={space.md} />
      <AppButton label="Drive this planned journey" kind="secondary" loading={loading} onPress={onStartPlanned} />

      <Gap size={space.xl} />
      <Label>Preview stories (no driving)</Label>
      <AppButton label="Preview this journey ID" kind="secondary" disabled={loading} onPress={onPreviewJourney} />
      <Gap size={space.sm} />
      <AppButton label="Preview stories near me" kind="secondary" disabled={loading} onPress={onPreviewNearby} />
      {error ? (
        <View>
          <Gap size={space.md} />
          <Text style={[type.small, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      <Gap size={space.xl} />
      <Label>Play log</Label>
      <Card>
        <Text style={type.body}>
          {playLog.length} entries: {count('started')} played, {count('finished')} heard to the end,{' '}
          {count('skipped')} skipped, {count('liked')} liked, {count('disliked')} disliked,{' '}
          {count('no_voice')} with no voice.
        </Text>
        <Gap size={space.md} />
        <AppButton label="Share play log" kind="secondary" onPress={onShareLog} />
        <Gap size={space.sm} />
        <AppButton label="Clear play log" kind="danger" onPress={onClearLog} />
      </Card>

      {lastRun?.step || lastRun?.error ? (
        <View>
          <Gap size={space.xl} />
          <Label>Last session did not end with End drive</Label>
          <Card>
            {lastRun.step ? <Text style={type.small}>Last step: {lastRun.step}</Text> : null}
            {lastRun.error ? (
              <Text selectable style={type.small}>
                Error: {lastRun.error}
              </Text>
            ) : null}
          </Card>
        </View>
      ) : null}

      <Gap size={space.xl} />
      <AppButton label="Hide the developer menu" kind="ghost" onPress={onHide} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 15,
  },
});
