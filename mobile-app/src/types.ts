export type TriggerPoint = {
  lng: number;
  lat: number;
};

export type Story = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  cue: string;
  /** Route mode: the point on the route where the story should start. */
  triggerPoint: TriggerPoint | null;
  /** Where the facts come from. Shown in the story preview. */
  sourceName?: string;
  sourceUrl?: string;
  /** Language of the story text: 'en' or 'hi'. English when missing. */
  language?: string;
  /** Explore mode: where the place really is. */
  point?: TriggerPoint | null;
  approxKm: number | null;
};

/**
 * route: stories come from a planned journey and play at fixed trigger points.
 * explore: no route. Stories are picked from current location and heading.
 */
export type JourneyMode = 'route' | 'explore';

/** Languages stories can be told in. */
export type StoryLanguage = 'en' | 'hi';

export type NearbyStoriesResult = {
  center: TriggerPoint;
  radiusMeters: number;
  stories: Story[];
};

export type JourneySimulationResult = {
  journeyId: string;
  stories: Story[];
};
