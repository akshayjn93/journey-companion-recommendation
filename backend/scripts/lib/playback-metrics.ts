/**
 * Shared pure helpers for turning simulator output into human-readable
 * playback metrics. Extracted from playback-report.ts so other scripts
 * (e.g. narration-frequency-experiment.ts) can reuse the exact same
 * narration-duration heuristic and summary shape without duplicating logic
 * or re-triggering that script's main().
 *
 * This does NOT change any recommendation logic, trigger logic, route
 * matching or content thresholds.
 */

import type { SimulatedEvent, SimulatorNeverTriggeredCandidate } from '../../src/modules/route/simulator.js';

const WORDS_PER_MINUTE = 140;
const MIN_NARRATION_SECONDS = 8;

export function estimateNarrationSeconds(text: string | null | undefined) {
  const words = (text ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return MIN_NARRATION_SECONDS;
  return Math.max(MIN_NARRATION_SECONDS, Math.round((words / WORDS_PER_MINUTE) * 60));
}

export function formatDuration(minutes: number) {
  const totalMinutes = Math.round(minutes);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatMinutesFromStart(km: number, speedKmh: number) {
  const minutes = (km / speedKmh) * 60;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function pad(value: string | number, width: number) {
  return String(value).padEnd(width);
}

export function buildTimelineRows(events: SimulatedEvent[], assumedSpeedKmh: number) {
  let previousKm = 0;
  return events.map((event, index) => {
    const gapKm = Number((event.approxKm - previousKm).toFixed(1));
    const gapMinutes = Number(((gapKm / assumedSpeedKmh) * 60).toFixed(1));
    previousKm = event.approxKm;
    const narrationText = event.content.narration_hint ?? event.content.long_description ?? event.content.short_description ?? event.content.title;
    return {
      index: index + 1,
      timeFromStart: formatMinutesFromStart(event.approxKm, assumedSpeedKmh),
      approxKm: event.approxKm,
      title: event.content.title,
      category: event.content.category,
      storyType: event.content.story_type,
      editorialScore: event.content.editorial_score,
      score: Number(event.content.score.toFixed(3)),
      scoreBreakdown: event.content.scoreBreakdown,
      decisionAheadDistanceM: event.decisionAheadDistanceM,
      triggerAheadDistanceM: event.triggerAheadDistanceM,
      estimatedNarrationSeconds: estimateNarrationSeconds(narrationText),
      gapSincePreviousKm: gapKm,
      gapSincePreviousMinutes: gapMinutes,
    };
  });
}

export type TimelineRow = ReturnType<typeof buildTimelineRows>[number];

export function summarize(
  journeyId: string,
  routeLengthKm: number,
  assumedSpeedKmh: number,
  timeline: TimelineRow[],
  neverTriggered: SimulatorNeverTriggeredCandidate[],
  categoryDistribution: Record<string, number>,
  rejectionReasonCounts: Array<{ reason: string; count: number }>,
  duplicateCandidates: Array<{ title: string; count: number; ids: string[] }>,
) {
  const gaps = timeline.map(row => row.gapSincePreviousKm).concat(Number((routeLengthKm - (timeline.at(-1)?.approxKm ?? 0)).toFixed(1)));
  const journeyDurationMinutes = (routeLengthKm / assumedSpeedKmh) * 60;
  const aheadDecision = timeline.map(row => row.decisionAheadDistanceM);
  const aheadTrigger = timeline.map(row => row.triggerAheadDistanceM);
  const avg = (values: number[]) => (values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)) : 0);

  return {
    journeyId,
    routeLengthKm,
    assumedSpeedKmh,
    journeyDurationMinutes: Number(journeyDurationMinutes.toFixed(1)),
    storiesTriggered: timeline.length,
    storiesPerHour: Number((timeline.length / (journeyDurationMinutes / 60)).toFixed(2)),
    gapKm: {
      average: avg(gaps),
      min: gaps.length ? Number(Math.min(...gaps).toFixed(1)) : 0,
      max: gaps.length ? Number(Math.max(...gaps).toFixed(1)) : 0,
    },
    aheadDistanceM: {
      avgDecision: avg(aheadDecision),
      avgTrigger: avg(aheadTrigger),
      minTrigger: aheadTrigger.length ? Math.min(...aheadTrigger) : 0,
      maxTrigger: aheadTrigger.length ? Math.max(...aheadTrigger) : 0,
    },
    categoryDistribution,
    topRejectionReasons: rejectionReasonCounts.slice(0, 10),
    neverTriggeredCount: neverTriggered.length,
    // Breakdown by evaluation state (Handoff v2.4 §40.2A): distinguishes
    // candidates that were genuinely scored-and-lost (CONSIDERED_BUT_LOST)
    // from ones the simulation never got a chance to evaluate at all
    // (ELIGIBLE_BUT_NOT_EVALUATED) — previously both looked identical in this
    // report.
    neverTriggeredByEvaluationState: Object.fromEntries(
      Object.entries(
        neverTriggered.reduce<Record<string, number>>((acc, candidate) => {
          acc[candidate.evaluationState] = (acc[candidate.evaluationState] ?? 0) + 1;
          return acc;
        }, {}),
      ).sort((a, b) => b[1] - a[1]),
    ),
    duplicateCandidateCount: duplicateCandidates.length,
  };
}

export type PlaybackSummary = ReturnType<typeof summarize>;
