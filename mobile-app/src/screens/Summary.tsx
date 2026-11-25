import { Linking, Text, View } from 'react-native';
import { AppButton, Card, Gap, Screen } from '../ui';
import { colors, space, type } from '../theme';
import type { TripSummary } from '../trip';

/** Shown after a drive: the stories that were told, to read again later. */
export function Summary({ trip, onDone }: { trip: TripSummary; onDone: () => void }) {
  const count = trip.stories.length;
  return (
    <Screen>
      <Text style={type.title}>Your drive</Text>
      <Gap size={space.sm} />
      <Text style={[type.body, { color: colors.textMuted }]}>
        {count === 0
          ? 'No stories played on this drive.'
          : `${count === 1 ? '1 story' : `${count} stories`} in about ${trip.minutes} minutes.`}
      </Text>
      {count === 0 ? (
        <View>
          <Gap size={space.md} />
          <Text style={type.small}>
            That can happen on a short drive, or on a road where we have no stories yet.
          </Text>
        </View>
      ) : null}

      {trip.stories.map(item => (
        <View key={item.story.id}>
          <Gap />
          <Card>
            <Text style={[type.small, { color: colors.accent }]}>
              {item.story.category.toUpperCase()}
              {item.finished ? '' : ' · not heard to the end'}
              {item.rating === 'up' ? ' · you liked it' : ''}
              {item.rating === 'down' ? ' · not for you' : ''}
            </Text>
            <Gap size={space.sm} />
            <Text style={type.heading}>{item.story.title}</Text>
            <Gap size={space.sm} />
            <Text style={type.body}>{item.story.summary}</Text>
            {item.story.sourceName ? (
              <View>
                <Gap size={space.md} />
                <Text style={type.small}>Source: {item.story.sourceName}</Text>
              </View>
            ) : null}
            {item.story.sourceUrl ? (
              <View>
                <Gap size={space.sm} />
                <AppButton
                  label="Read more"
                  kind="secondary"
                  onPress={() => {
                    Linking.openURL(item.story.sourceUrl!).catch(() => {});
                  }}
                />
              </View>
            ) : null}
          </Card>
        </View>
      ))}

      <Gap size={space.xl} />
      <AppButton label="Done" big onPress={onDone} />
    </Screen>
  );
}
