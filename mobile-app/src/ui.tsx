import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, space, type } from './theme';

/** The page wrapper every screen uses. */
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill]}>{children}</View>
      )}
    </View>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';

/** A large button. Big enough to hit without looking closely. */
export function AppButton({
  label,
  onPress,
  kind = 'primary',
  disabled = false,
  loading = false,
  big = false,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  loading?: boolean;
  big?: boolean;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        big && styles.buttonBig,
        kind === 'primary' && styles.primary,
        kind === 'secondary' && styles.secondary,
        kind === 'ghost' && styles.ghost,
        kind === 'danger' && styles.dangerButton,
        pressed && !off && styles.pressed,
        off && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={kind === 'primary' ? colors.accentText : colors.text} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            big && styles.buttonLabelBig,
            kind === 'primary' && { color: colors.accentText },
            kind === 'danger' && { color: colors.danger },
            kind === 'ghost' && { color: colors.textMuted },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

/** A row of choices where exactly one is picked, like English / Hindi. */
export function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.choiceRow}>
      {options.map(option => {
        const picked = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: picked }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.choice, picked && styles.choicePicked]}
          >
            <Text style={[styles.choiceLabel, picked && styles.choiceLabelPicked]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A set of choices where any number can be picked, like the kinds of story you like. */
export function Chips<T extends string>({
  options,
  values,
  onToggle,
}: {
  options: { key: T; label: string }[];
  values: readonly T[];
  onToggle: (key: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map(option => {
        const picked = values.includes(option.key);
        return (
          <Pressable
            key={option.key}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: picked }}
            accessibilityLabel={option.label}
            onPress={() => onToggle(option.key)}
            style={[styles.chipButton, picked && styles.choicePicked]}
          >
            <Text style={[styles.chipLabel, picked && styles.choiceLabelPicked]}>
              {picked ? '✓ ' : ''}
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Gap({ size = space.lg }: { size?: number }) {
  return <View style={{ height: size }} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    paddingHorizontal: space.xl,
    paddingTop: 64,
    // Room below the last button, so the phone's navigation bar does not cover it.
    paddingBottom: 56,
  },
  fill: { flex: 1 },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  buttonBig: { minHeight: 68, borderRadius: radius.lg },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  // Ghost buttons are quiet text links, so they hug their label.
  ghost: { backgroundColor: 'transparent', alignSelf: 'flex-start', paddingHorizontal: 0 },
  dangerButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
  buttonLabel: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
  buttonLabelBig: { fontSize: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  choiceRow: { flexDirection: 'row', gap: space.sm },
  choice: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  choicePicked: { backgroundColor: colors.accent, borderColor: colors.accent },
  choiceLabel: { ...type.body, fontWeight: '600', color: colors.textMuted },
  choiceLabelPicked: { color: colors.accentText },
  chips: { gap: space.sm },
  chipButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  chipLabel: { fontSize: 16, fontWeight: '600', color: colors.textMuted },
  label: { ...type.small, marginBottom: space.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
});
