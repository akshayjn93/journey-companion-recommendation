import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, Gap, Screen } from '../ui';
import { colors, radius, space, type } from '../theme';
import type { Rating } from '../ratings';
import type { DrivingState } from '../store';
import type { Story } from '../types';

/** What the driver sees during a drive. Large text and large buttons. */
export function Driving({
  state,
  story,
  rating,
  onRate,
  onSkip,
  onReplay,
  onPause,
  onStop,
}: {
  state: DrivingState;
  story: Story | undefined;
  rating: Rating | undefined;
  onRate: (rating: Rating) => void;
  onSkip: () => void;
  onReplay: () => void;
  onPause: (paused: boolean) => void;
  onStop: () => void;
}) {
  const confirmStop = () =>
    Alert.alert('End this drive?', 'Stories will stop playing.', [
      { text: 'Keep driving', style: 'cancel' },
      { text: 'End drive', style: 'destructive', onPress: onStop },
    ]);

  const played = state.triggeredIds.size;

  return (
    <Screen>
      <View style={styles.topRow}>
        <View style={[styles.dot, state.isPaused && { backgroundColor: colors.textMuted }]} />
        <Text style={type.heading}>{state.isPaused ? 'Paused' : 'Driving'}</Text>
      </View>
      <Gap size={space.sm} />
      <Text style={type.small}>{state.statusMessage}</Text>

      <Gap />
      {story ? (
        <Card>
          <Text style={styles.chip}>
            {state.isSpeaking ? 'Playing now' : 'Last story'} · {story.category}
          </Text>
          <Gap size={space.sm} />
          <Text style={type.title}>{story.title}</Text>
          <Gap size={space.md} />
          <Text style={type.story}>{story.summary}</Text>
          <Gap />
          <View style={styles.row}>
            <Thumb label="Liked it" picked={rating === 'up'} onPress={() => onRate('up')} />
            <Thumb label="Not for me" picked={rating === 'down'} onPress={() => onRate('down')} />
          </View>
        </Card>
      ) : (
        <Card>
          <Text style={type.title}>Listening for stories</Text>
          <Gap size={space.md} />
          <Text style={type.body}>
            Keep driving. When a place with a story is just ahead, Safarnama will tell it. You can
            lock the phone and put it away.
          </Text>
        </Card>
      )}

      <Gap />
      {story ? (
        state.isSpeaking ? (
          <AppButton label="Skip this story" big onPress={onSkip} />
        ) : (
          <AppButton label="Play it again" big kind="secondary" onPress={onReplay} />
        )
      ) : null}
      <Gap size={space.md} />
      <AppButton
        label={state.isPaused ? 'Turn stories back on' : 'Pause stories'}
        kind="secondary"
        onPress={() => onPause(!state.isPaused)}
      />

      <Gap size={space.xl} />
      <Text style={[type.small, { textAlign: 'center' }]}>
        {played === 1 ? '1 story played' : `${played} stories played`} · {state.stories.length} saved
        for the road ahead
      </Text>
      <Gap size={space.md} />
      <AppButton label="End drive" kind="danger" onPress={confirmStop} />
    </Screen>
  );
}

function Thumb({ label, picked, onPress }: { label: string; picked: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: picked }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.thumb, picked && styles.thumbPicked]}
    >
      <Text style={[styles.thumbLabel, picked && { color: colors.accentText }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.good },
  row: { flexDirection: 'row', gap: space.sm },
  chip: { ...type.small, color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.6 },
  thumb: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPicked: { backgroundColor: colors.accent, borderColor: colors.accent },
  thumbLabel: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
});
