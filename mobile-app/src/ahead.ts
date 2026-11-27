import { haversineMeters } from './geo';
import { isMustHear, isWanted, type InterestKey } from './interests';
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

/** True for a story about a place to eat or drink. */
export function isFood(story: Story): boolean {
  return story.category === 'food';
}

/**
 * Chooses which of the tellable stories to tell next.
 *
 * Normally that is the nearest one. But food places sit close together, and
 * with a quiet gap between stories most of them would never get a turn. So
 * when both kinds are within range, the app takes turns: after a place story
 * it tells the nearest food story, and after a food story the nearest place
 * story. If only one kind is in range, it just tells the nearest.
 */
export function pickNext(
  tellable: AheadCandidate[],
  lastWasFood: boolean | null,
): AheadCandidate | null {
  if (!tellable.length) return null;
  if (lastWasFood === null) return tellable[0];
  const otherKind = tellable.find(candidate => isFood(candidate.story) !== lastWasFood);
  return otherKind ?? tellable[0];
}

/**
 * The full choice of what to tell next, in order:
 * 1. Keep to the kinds of story the listener asked for. This is a preference,
 *    not a filter: if nothing they asked for is in range, anything may play,
 *    because silence on a road with few stories is worse.
 * 2. A story marked "must hear" goes first.
 * 3. Otherwise take turns between food and place stories, nearest first.
 */
export function chooseNext(
  tellable: AheadCandidate[],
  options: { lastWasFood: boolean | null; interests: readonly InterestKey[] },
): AheadCandidate | null {
  if (!tellable.length) return null;
  const wanted = tellable.filter(candidate => isWanted(candidate.story, options.interests));
  const pool = wanted.length ? wanted : tellable;
  const mustHear = pool.find(candidate => isMustHear(candidate.story));
  return mustHear ?? pickNext(pool, options.lastWasFood);
}

// ---- Walking pace ---------------------------------------------------------

/** At or below this speed the listener is on foot, parked, or crawling in traffic. */
export const WALK_SPEED_KMH = 8;
/** At walking pace, only stories this close are told, whatever the direction. */
export const WALK_RADIUS_METERS = 400;
/** At walking pace, stories that are this close can follow each other sooner. */
export const WALK_GAP_MS = 2 * 60 * 1000;

/** Unplayed stories within a small circle around the listener, nearest first. */
export function findNearby(
  stories: Story[],
  excludeIds: ReadonlySet<string>,
  here: LngLat,
  radiusMeters: number,
): AheadCandidate[] {
  const close: AheadCandidate[] = [];
  for (const story of stories) {
    if (excludeIds.has(story.id)) continue;
    const point = story.point ?? story.triggerPoint;
    if (!point) continue;
    const distanceMeters = haversineMeters([here.lng, here.lat], [point.lng, point.lat]);
    if (distanceMeters <= radiusMeters) {
      close.push({ story, distanceMeters, aheadMeters: distanceMeters, sideMeters: 0 });
    }
  }
  close.sort((a, b) => a.distanceMeters - b.distanceMeters || a.story.id.localeCompare(b.story.id));
  return close;
}

/**
 * Tells whether the listener is moving at walking pace. It needs two slow
 * readings in a row, so one slow moment at a traffic light does not count.
 */
export class PaceTracker {
  private last: { here: LngLat; at: number } | null = null;
  private slowCount = 0;

  update(here: LngLat, atMs: number, gpsSpeedKmh?: number): boolean {
    let speedKmh: number | null = typeof gpsSpeedKmh === 'number' ? gpsSpeedKmh : null;
    if (this.last) {
      const seconds = (atMs - this.last.at) / 1000;
      if (seconds > 120) {
        // No reading for two minutes means the phone has barely moved.
        speedKmh = 0;
      } else if (speedKmh === null && seconds >= 1) {
        const meters = haversineMeters([this.last.here.lng, this.last.here.lat], [here.lng, here.lat]);
        speedKmh = (meters / seconds) * 3.6;
      }
    }
    this.last = { here, at: atMs };
    if (speedKmh === null) return this.slowCount >= 2;
    this.slowCount = speedKmh <= WALK_SPEED_KMH ? this.slowCount + 1 : 0;
    return this.slowCount >= 2;
  }

  reset() {
    this.last = null;
    this.slowCount = 0;
  }
}
