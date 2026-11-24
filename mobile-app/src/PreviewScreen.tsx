import { useEffect, useRef, useState } from 'react';
import { Button, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { speakStory, stopSpeaking, type EndReason } from './narration';
import type { Story, StoryLanguage } from './types';
import { getVoiceFor, listVoices, setVoiceFor, voiceLabel, type PhoneVoice } from './voice';

/**
 * Plays stories one after another with no GPS and no driving. It is for
 * checking the content and the voices: how each story sounds, in which
 * language, and whether the phone could speak it at all.
 */

type Result = { reason: EndReason; seconds: number };

/** A story that ends in under two seconds was accepted but not really spoken. */
function spokenOk(result: Result | undefined): boolean {
  return Boolean(result && result.reason === 'finished' && result.seconds >= 2);
}

function languageOf(story: Story): StoryLanguage {
  return story.language === 'hi' ? 'hi' : 'en';
}

export function PreviewScreen({
  title,
  stories,
  onClose,
}: {
  title: string;
  stories: Story[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [voices, setVoices] = useState<PhoneVoice[]>([]);
  const [voiceId, setVoiceId] = useState<string | undefined>(undefined);

  // Refs, so a callback from an earlier render still sees the latest values.
  const playAll = useRef(false);
  // Goes up on every play, so the ending of an older story can be told apart.
  const playToken = useRef(0);
  const mounted = useRef(true);
  const nextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const story = stories[index];
  const language = story ? languageOf(story) : 'en';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      playAll.current = false;
      if (nextTimer.current) clearTimeout(nextTimer.current);
      stopSpeaking('stopped');
    };
  }, []);

  // The voices offered depend on the language of the story on screen.
  useEffect(() => {
    let cancelled = false;
    listVoices(language).then(found => {
      if (cancelled) return;
      setVoices(found);
      setVoiceId(getVoiceFor(language));
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const play = (at: number) => {
    const target = stories[at];
    if (!target) return;
    if (nextTimer.current) clearTimeout(nextTimer.current);
    const token = ++playToken.current;
    setIndex(at);
    setPlaying(true);
    speakStory(
      target.summary,
      (reason, seconds) => {
        if (!mounted.current) return;
        setResults(previous => ({ ...previous, [target.id]: { reason, seconds } }));
        // A newer story has already started: it was the one that cut this off.
        if (token !== playToken.current) return;
        setPlaying(false);
        // "Play all" carries on after a story that ended on its own, even a
        // failed one, so one bad story does not stop the whole check.
        const endedOnItsOwn = reason !== 'stopped' && reason !== 'skipped' && reason !== 'paused';
        if (playAll.current && endedOnItsOwn && at + 1 < stories.length) {
          nextTimer.current = setTimeout(() => play(at + 1), 1200);
        } else {
          playAll.current = false;
        }
      },
      languageOf(target),
    );
  };

  const stop = () => {
    playAll.current = false;
    playToken.current += 1;
    if (nextTimer.current) clearTimeout(nextTimer.current);
    stopSpeaking('stopped');
    setPlaying(false);
  };

  const handlePlayAll = () => {
    playAll.current = true;
    play(index);
  };

  const handlePlayOne = (at: number) => {
    playAll.current = false;
    play(at);
  };

  // Moves to the next voice for this story's language, then replays the story.
  const handleNextVoice = async () => {
    const current = voiceId ?? (language === 'hi' ? voices[0]?.identifier : undefined);
    const at = voices.findIndex(voice => voice.identifier === current);
    const next = at + 1 < voices.length ? voices[at + 1] : undefined;
    await setVoiceFor(language, next?.identifier);
    setVoiceId(next?.identifier);
    handlePlayOne(index);
  };

  const okCount = stories.filter(item => spokenOk(results[item.id])).length;
  const triedCount = stories.filter(item => results[item.id]).length;
  const failedCount = triedCount - okCount;
  const hindiCount = stories.filter(item => languageOf(item) === 'hi').length;
  const currentVoice = voices.find(voice => voice.identifier === voiceId);
  const result = story ? results[story.id] : undefined;

  const statusMark = (item: Story) => {
    const itemResult = results[item.id];
    if (!itemResult) return '·';
    return spokenOk(itemResult) ? '✓' : '✗';
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Story preview</Text>
      <Text style={styles.meta}>{title}</Text>
      <Text style={styles.meta}>
        {stories.length} stories: {hindiCount} Hindi, {stories.length - hindiCount} English
      </Text>
      <Text style={styles.meta}>
        Spoken OK: {okCount} · Failed: {failedCount} · Not played yet: {stories.length - triedCount}
      </Text>

      <View style={styles.row}>
        <View style={styles.rowItem}>
          {playing ? (
            <Button title="Stop" color="#b00020" onPress={stop} />
          ) : (
            <Button title="Play all from here" onPress={handlePlayAll} />
          )}
        </View>
        <View style={styles.rowItem}>
          <Button title="Play this one" onPress={() => handlePlayOne(index)} disabled={playing} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Button title="Previous" onPress={() => handlePlayOne(index - 1)} disabled={index === 0} />
        </View>
        <View style={styles.rowItem}>
          <Button
            title="Next"
            onPress={() => handlePlayOne(index + 1)}
            disabled={index + 1 >= stories.length}
          />
        </View>
      </View>

      {story ? (
        <View style={styles.card}>
          <Text style={styles.meta}>
            Story {index + 1} of {stories.length} · {story.category} ·{' '}
            {language === 'hi' ? 'Hindi' : 'English'}
          </Text>
          <Text style={styles.title}>{story.title}</Text>
          <Text style={styles.body}>{story.summary}</Text>
          {story.sourceName ? <Text style={styles.meta}>Source: {story.sourceName}</Text> : null}
          {story.sourceUrl ? (
            <Text selectable style={styles.meta}>
              {story.sourceUrl}
            </Text>
          ) : null}
          {result ? (
            <Text style={spokenOk(result) ? styles.ok : styles.failed}>
              {spokenOk(result)
                ? `Spoken in ${result.seconds} seconds.`
                : result.reason === 'finished'
                  ? 'Ended at once, so it was probably not spoken. Try another voice.'
                  : result.reason === 'stopped'
                    ? `Stopped after ${result.seconds} seconds.`
                    : `Not spoken (${result.reason}).`}
            </Text>
          ) : null}
          <Text style={styles.meta}>
            Voice for {language === 'hi' ? 'Hindi' : 'English'}:{' '}
            {currentVoice
              ? voiceLabel(currentVoice)
              : language === 'hi' && voices.length
                ? `${voiceLabel(voices[0])}, picked automatically`
                : language === 'hi'
                  ? 'none found on this phone'
                  : "phone's default"}
          </Text>
          <View style={styles.smallSpacer}>
            <Button
              title="Try next voice on this story"
              onPress={handleNextVoice}
              disabled={!voices.length}
            />
          </View>
        </View>
      ) : null}

      <Text style={styles.label}>All stories (tap one to play it)</Text>
      {stories.map((item, at) => (
        <Pressable
          key={item.id}
          onPress={() => handlePlayOne(at)}
          style={[styles.listRow, at === index ? styles.listRowCurrent : null]}
        >
          <Text style={styles.listText}>
            {statusMark(item)} {at + 1}. {item.title}
          </Text>
        </Pressable>
      ))}

      <View style={styles.spacer}>
        <Button title="Back" color="#8a8a8a" onPress={onClose} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 72,
    paddingBottom: 64,
  },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  label: { fontSize: 13, color: '#555', marginTop: 20, marginBottom: 4 },
  meta: { fontSize: 13, color: '#555', marginTop: 4 },
  ok: { fontSize: 13, color: '#1b7f3b', marginTop: 8, fontWeight: '600' },
  failed: { fontSize: 13, color: '#b00020', marginTop: 8, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12, marginTop: 12 },
  rowItem: { flex: 1 },
  spacer: { marginTop: 20 },
  smallSpacer: { marginTop: 8 },
  card: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  title: { fontSize: 18, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22 },
  listRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  listRowCurrent: { backgroundColor: '#eef2ff' },
  listText: { fontSize: 14 },
});
