import { haversineMeters } from './geo';
import type { Story } from './types';

/**
 * Picks stories from the traveller's location and heading alone. No route is
 * needed. This file has no phone-specific code, so it is easy to test.
 */

/** A story further ahead than this is not told yet. */
export const AHEAD_MAX_METERS = 4000;
/** A story this far behind can still be told, to allow for GPS error. */
export const BEHIND_GRACE_METERS = 200;
/**
 * How far to the left or right of the direction of travel a story can be.
 * Same as the backend's search radius (preferredSearchRadiusMeters), so town
 * and area stories a few km off the highway are still told. Nearer stories
 * are always picked first.
 */
export const SIDE_MAX_METERS = 10000;
/** Below this speed the phone's heading is not reliable. */
export const MIN_HEADING_SPEED_KMH = 10;
/** Our own heading is worked out again each time the phone moves this far. */
export const HEADING_STEP_METERS = 150;

export type LngLat = { lng: number; lat: number };

export type AheadCandidate = {
  story: Story;
  distanceMeters: number;
  /** Distance along the direction of travel. Negative means behind. */
  aheadMeters: number;
  /** Distance to the side of the direction of travel. */
  sideMeters: number;
};

/** Compass bearing in degrees (0 = north, 90 = east) from one point to another. */
export function bearingDegrees(from: LngLat, to: LngLat): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Where a story sits compared to the traveller's position and heading. */
export function locate(story: Story, here: LngLat, headingDeg: number): AheadCandidate | null {
  const point = story.point ?? story.triggerPoint;
  if (!point) return null;
  const distanceMeters = haversineMeters([here.lng, here.lat], [point.lng, point.lat]);
  const angle = ((bearingDegrees(here, point) - headingDeg) * Math.PI) / 180;
  return {
    story,
    distanceMeters,
    aheadMeters: distanceMeters * Math.cos(angle),
    sideMeters: Math.abs(distanceMeters * Math.sin(angle)),
  };
}

export function isTellable(candidate: AheadCandidate): boolean {
  return (
    candidate.aheadMeters >= -BEHIND_GRACE_METERS &&
    candidate.aheadMeters <= AHEAD_MAX_METERS &&
    candidate.sideMeters <= SIDE_MAX_METERS
  );
}

/**
 * Unplayed stories in front of the traveller, nearest first. `tellable` are
 * close enough to tell now. `upcoming` is the nearest one still further ahead
 * in the same corridor, used only for the status line.
 */
export function findAhead(
  stories: Story[],
  excludeIds: ReadonlySet<string>,
  here: LngLat,
  headingDeg: number,
): { tellable: AheadCandidate[]; upcoming: AheadCandidate | null } {
  const tellable: AheadCandidate[] = [];
  let upcoming: AheadCandidate | null = null;

  for (const story of stories) {
    if (excludeIds.has(story.id)) continue;
    const candidate = locate(story, here, headingDeg);
    if (!candidate) continue;
    if (isTellable(candidate)) {
      tellable.push(candidate);
    } else if (
      candidate.aheadMeters > AHEAD_MAX_METERS &&
      // The corridor is allowed to widen with distance, because roads bend.
      candidate.sideMeters <= Math.max(SIDE_MAX_METERS, candidate.aheadMeters * 0.5) &&
      (!upcoming || candidate.distanceMeters < upcoming.distanceMeters)
    ) {
      upcoming = candidate;
    }
  }

  tellable.sort(
    (a, b) => a.distanceMeters - b.distanceMeters || a.story.id.localeCompare(b.story.id),
  );
  return { tellable, upcoming };
}

/**
 * Keeps track of the direction of travel. It trusts the phone's GPS heading
 * when the car is moving, and otherwise works it out from how the phone has
 * moved. Standing still keeps the last known heading.
 */
export class HeadingTracker {
  private anchor: LngLat | null = null;
  private heading: number | null = null;

  update(here: LngLat, gpsHeadingDeg?: number | null, speedKmh?: number): number | null {
    const gpsUsable =
      typeof gpsHeadingDeg === 'number' &&
      gpsHeadingDeg >= 0 &&
      gpsHeadingDeg <= 360 &&
      speedKmh !== undefined &&
      speedKmh >= MIN_HEADING_SPEED_KMH;

    if (!this.anchor) {
      this.anchor = here;
    } else if (
      haversineMeters([this.anchor.lng, this.anchor.lat], [here.lng, here.lat]) >=
      HEADING_STEP_METERS
    ) {
      if (!gpsUsable) this.heading = bearingDegrees(this.anchor, here);
      this.anchor = here;
    }

    if (gpsUsable) this.heading = gpsHeadingDeg as number;
    return this.heading;
  }

  reset() {
    this.anchor = null;
    this.heading = null;
  }
}
