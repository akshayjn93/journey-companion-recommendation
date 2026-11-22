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
  /** Explore mode: where the place really is. */
  point?: TriggerPoint | null;
  approxKm: number | null;
};

/**
 * route: stories come from a planned journey and play at fixed trigger points.
 * explore: no route. Stories are picked from current location and heading.
 */
export type JourneyMode = 'route' | 'explore';

export type NearbyStoriesResult = {
  center: TriggerPoint;
  radiusMeters: number;
  stories: Story[];
};

export type JourneySimulationResult = {
  journeyId: string;
  stories: Story[];
};
