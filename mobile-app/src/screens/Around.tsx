import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, Choice, Gap, Screen } from '../ui';
import { colors, radius, space, type } from '../theme';
import { haversineMeters } from '../geo';
import { isMustHear } from '../interests';
import type { Story, TriggerPoint } from '../types';

/**
 * "Stories around you": every story near the phone, nearest first, for the
 * listener to pick from. This is for crowded places such as an old bazaar,
 * where many stories are close together and the automatic choice can only
 * tell a few of them. It is meant for when the car is parked, or for a
 * passenger.
 */

type Filter = 'all' | 'food' | 'places';

const MAX_SHOWN = 40;

function distanceText(meters: number): string {
  if (meters < 950) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}

export function Around({
  stories,
  position,
  heardIds,
  playingId,
  onPlay,
  onStop,
  onBack,
}: {
  stories: Story[];
  /** Where the phone is. Null when it is not known yet. */
  position: TriggerPoint | null;
  /** Stories this phone has already told. */
  heardIds: ReadonlySet<string>;
  /** The story being spoken right now, if any. */
  playingId: string | null;
  onPlay: (story: Story) => void;
  onStop: () => void;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const withDistance = stories
      .map(story => {
        const point = story.point ?? story.triggerPoint;
        const meters =
          position && point
            ? haversineMeters([position.lng, position.lat], [point.lng, point.lat])
            : null;
        return { story, meters };
      })
      .filter(item =>
        filter === 'all'
          ? true
          : filter === 'food'
            ? item.story.category === 'food'
            : item.story.category !== 'food',
      );
    withDistance.sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity));
    return withDistance.slice(0, MAX_SHOWN);
  }, [stories, position, filter]);

  const open = stories.find(story => story.id === (playingId ?? openId));

  const choose = (story: Story) => {
    setOpenId(story.id);
    onPlay(story);
  };

  return (
    <Screen>
      <AppButton label="‹ Back" kind="ghost" onPress={onBack} />
      <Text style={type.title}>Stories around you</Text>
      <Gap size={space.sm} />
      <Text style={type.small}>
        Nearest first. Tap one to hear it. Best used when you are parked, or by a passenger.
      </Text>

      <Gap />
      <Choice
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'food', label: 'Food' },
          { value: 'places', label: 'Places' },
        ]}
      />

      {open ? (
        <View>
          <Gap />
          <Card>
            <Text style={styles.chip}>
              {playingId === open.id ? 'Playing now' : 'Last played'} · {open.category}
            </Text>
            <Gap size={space.sm} />
            <Text style={type.heading}>{open.title}</Text>
            <Gap size={space.sm} />
            <Text style={type.body}>{open.summary}</Text>
            {open.sourceName ? (
              <View>
                <Gap size={space.sm} />
                <Text style={type.small}>Source: {open.sourceName}</Text>
              </View>
            ) : null}
            <Gap size={space.md} />
            {playingId === open.id ? (
              <AppButton label="Stop" onPress={onStop} />
            ) : (
              <AppButton label="Play it again" kind="secondary" onPress={() => choose(open)} />
            )}
            {open.sourceUrl ? (
              <View>
                <Gap size={space.sm} />
                <AppButton
                  label="Read more"
                  kind="secondary"
                  onPress={() => {
                    Linking.openURL(open.sourceUrl!).catch(() => {});
                  }}
                />
              </View>
            ) : null}
          </Card>
        </View>
      ) : null}

      <Gap />
      {!position ? (
        <Text style={type.small}>
          Still finding where you are, so distances are not shown yet.
        </Text>
      ) : null}
      {sorted.length === 0 ? (
        <Text style={type.body}>No stories of this kind near you yet.</Text>
      ) : null}

      {sorted.map(({ story, meters }) => {
        const playing = playingId === story.id;
        return (
          <Pressable
            key={story.id}
            accessibilityRole="button"
            accessibilityLabel={`${story.title}${meters !== null ? `, ${distanceText(meters)} away` : ''}`}
            onPress={() => choose(story)}
            style={({ pressed }) => [styles.row, playing && styles.rowPlaying, pressed && { opacity: 0.75 }]}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{story.title}</Text>
              <Text style={type.small}>
                {story.category}
                {isMustHear(story) ? ' · must hear' : ''}
                {heardIds.has(story.id) ? ' · heard' : ''}
              </Text>
            </View>
            <Text style={styles.distance}>{meters !== null ? distanceText(meters) : ''}</Text>
          </Pressable>
        );
      })}

      {stories.length > MAX_SHOWN && sorted.length === MAX_SHOWN ? (
        <View>
          <Gap size={space.md} />
          <Text style={[type.small, { textAlign: 'center' }]}>
            Showing the {MAX_SHOWN} nearest.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: { ...type.small, color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    marginTop: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowPlaying: { borderColor: colors.accent },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 },
  distance: { fontSize: 15, fontWeight: '700', color: colors.accent },
});
