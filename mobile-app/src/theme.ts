/**
 * One dark look for the whole app. Dark is easier on the eyes while driving,
 * most of all at night, and it matches the navy and orange of the app icon.
 */
export const colors = {
  background: '#0F1A33',
  surface: '#1B2A4E',
  surfaceRaised: '#26386A',
  border: '#34467A',
  text: '#F4F6FB',
  textMuted: '#A9B4D0',
  accent: '#F77F00',
  accentText: '#1A1200',
  good: '#4CC38A',
  danger: '#FF6B6B',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { md: 12, lg: 18 };

export const type = {
  hero: { fontSize: 34, fontWeight: '800' as const, color: colors.text },
  title: { fontSize: 24, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  // The story text on the driving screen is read at a glance, so it is large.
  story: { fontSize: 19, lineHeight: 29, color: colors.text },
  small: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
};
