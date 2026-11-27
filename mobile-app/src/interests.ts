import type { Story } from './types';

/**
 * The six kinds of story a listener can say they like, and the "must hear"
 * mark. This file has no phone-specific code, so it is easy to test.
 */

export type InterestKey = 'history' | 'food' | 'nature' | 'faith' | 'engineering' | 'culture';

export const INTERESTS: { key: InterestKey; label: string }[] = [
  { key: 'history', label: 'History and monuments' },
  { key: 'food', label: 'Food and places to eat' },
  { key: 'nature', label: 'Nature and wildlife' },
  { key: 'faith', label: 'Faith and legends' },
  { key: 'engineering', label: 'Roads, bridges and industry' },
  { key: 'culture', label: 'Culture, crafts and people' },
];

export const ALL_INTERESTS: InterestKey[] = INTERESTS.map(item => item.key);

// Stories carry many category names. Each one belongs to one of the six kinds.
const CATEGORY_TO_INTEREST: Record<string, InterestKey> = {
  history: 'history',
  archaeology: 'history',
  architecture: 'history',
  heritage: 'history',
  food: 'food',
  nature: 'nature',
  geography: 'nature',
  agriculture: 'nature',
  landscape: 'nature',
  religion: 'faith',
  'local-story': 'faith',
  infrastructure: 'engineering',
  industry: 'engineering',
  transport: 'engineering',
  science: 'engineering',
  road: 'engineering',
  'road-safety': 'engineering',
  local_economy: 'engineering',
  commerce: 'engineering',
  culture: 'culture',
  craft: 'culture',
  sport: 'culture',
  art: 'culture',
  education: 'culture',
  museum: 'culture',
  urban: 'culture',
  places: 'culture',
  interesting: 'culture',
};

/** Which of the six kinds a story belongs to. Unknown categories count as culture. */
export function interestOf(story: Story): InterestKey {
  return CATEGORY_TO_INTEREST[story.category?.toLowerCase()] ?? 'culture';
}

/**
 * True when the listener asked for this kind of story. Choosing nothing, or
 * everything, means every story is wanted.
 */
export function isWanted(story: Story, interests: readonly InterestKey[]): boolean {
  if (!interests.length || interests.length >= ALL_INTERESTS.length) return true;
  return interests.includes(interestOf(story));
}

/** Editors mark a few stories as too good to miss by giving them this tag. */
export const MUST_HEAR_TAG = 'must-hear';

export function isMustHear(story: Story): boolean {
  return Array.isArray(story.tags) && story.tags.includes(MUST_HEAR_TAG);
}

// ---- Vegetarian or not ----------------------------------------------------

/** What the listener eats. */
export type Diet = 'all' | 'veg';

/** Editors tag each food story: "veg" when it only recommends vegetarian things. */
export const VEG_TAG = 'veg';
export const NON_VEG_TAG = 'non-veg';

/**
 * True when a story may be told to this listener. Unlike the interest
 * choices, this is a real filter: a vegetarian should never be told to order
 * a kebab. Only food stories are affected. A food story with no "veg" tag is
 * left out for vegetarians, so a story nobody has labelled yet is never told
 * to them by mistake.
 */
export function fitsDiet(story: Story, diet: Diet): boolean {
  if (diet === 'all' || story.category !== 'food') return true;
  return Array.isArray(story.tags) && story.tags.includes(VEG_TAG);
}
