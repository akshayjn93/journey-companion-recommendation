/**
 * Journey Playback Report
 *
 * Runs the existing journey simulator and produces a human-readable report
 * answering: "If I drive this journey, what exactly does Journey Companion
 * tell me, in what order, and how often?"
 *
 * This does NOT change any recommendation logic, trigger logic, route
 * matching or content thresholds. It only reports on existing simulator
 * output (see backend/src/modules/route/simulator.ts).
 *
 * Usage:
 *   npm run playback-report -- <journeyId> [options]
 *
 * Options:
 *   --speed=<kmh>       assumed driving speed, default 60
 *   --min-gap=<min>     minimum narration gap in minutes, default 8
 *   --radius=<meters>   candidate search radius, default engine config value
 *   --language=<code>   content language, default en
 *   --out=<path>        JSON report output path, default reports/playback-<journeyId>.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { db } from '../src/common/db.js';
import { simulateJourney, type SimulatorNeverTriggeredCandidate } from '../src/modules/route/simulator.js';
import { RECOMMENDATION_CONFIG } from '../src/modules/recommendation/config.js';
import { buildTimelineRows, formatDuration, pad, summarize } from './lib/playback-metrics.js';

function parseArgs(argv: string[]) {
  const [journeyId, ...rest] = argv;
  const flags: Record<string, string> = {};
  for (const arg of rest) {
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (match) flags[match[1]] = match[2];
  }
  return { journeyId, flags };
}

function printConsoleReport(
  summary: ReturnType<typeof summarize>,
  timeline: ReturnType<typeof buildTimelineRows>,
  neverTriggered: SimulatorNeverTriggeredCandidate[],
  duplicateCandidates: Array<{ title: string; count: number; ids: string[] }>,
  jsonPath: string,
) {
  console.log('');
  console.log('Journey Playback Report');
  console.log('========================');
  console.log(`Journey ID:          ${summary.journeyId}`);
  console.log(`Route distance:      ${summary.routeLengthKm} km`);
  console.log(`Assumed speed:       ${summary.assumedSpeedKmh} km/h`);
  console.log(`Estimated duration:  ${formatDuration(summary.journeyDurationMinutes)}`);
  console.log(`Stories triggered:   ${summary.storiesTriggered}`);
  console.log(`Stories per hour:    ${summary.storiesPerHour}`);
  console.log('');
  console.log('Timeline');
  console.log('--------');
  console.log(pad('#', 4) + pad('Time', 7) + pad('Km', 7) + pad('Category', 16) + pad('Score', 7) + pad('Edit', 6) + pad('Type', 6) + pad('Ahead(dec/trig)', 18) + pad('Gap(km/min)', 14) + pad('Narr~', 7) + 'Title');
  for (const row of timeline) {
    console.log(
      pad(row.index, 4) +
      pad(row.timeFromStart, 7) +
      pad(row.approxKm, 7) +
      pad(row.category, 16) +
      pad(row.score, 7) +
      pad(row.editorialScore ?? '-', 6) +
      pad(row.storyType === 'local_tradition' ? 'trad' : 'fact', 6) +
      pad(`${row.decisionAheadDistanceM}m/${row.triggerAheadDistanceM}m`, 18) +
      pad(`${row.gapSincePreviousKm}km/${row.gapSincePreviousMinutes}m`, 14) +
      pad(`${row.estimatedNarrationSeconds}s`, 7) +
      row.title,
    );
  }
  console.log('');
  console.log('Gaps (km)');
  console.log('---------');
  console.log(`average: ${summary.gapKm.average}   min: ${summary.gapKm.min}   max (longest silent stretch): ${summary.gapKm.max}`);
  console.log('');
  console.log('Ahead distance (m)');
  console.log('-------------------');
  console.log(`avg decision-ahead: ${summary.aheadDistanceM.avgDecision}   avg trigger-ahead: ${summary.aheadDistanceM.avgTrigger}   trigger range: ${summary.aheadDistanceM.minTrigger}-${summary.aheadDistanceM.maxTrigger}`);
  console.log('');
  console.log('Category distribution');
  console.log('----------------------');
  for (const [category, count] of Object.entries(summary.categoryDistribution)) {
    console.log(`${pad(category, 20)} ${count}`);
  }
  console.log('');
  console.log('Top rejection reasons');
  console.log('----------------------');
  for (const { reason, count } of summary.topRejectionReasons) {
    console.log(`${pad(count, 6)} ${reason}`);
  }
  console.log('');
  console.log(`Never-triggered candidates (${neverTriggered.length})`);
  console.log('----------------------------------');
  console.log('By evaluation state (Handoff v2.4 §40.2A):');
  for (const [state, count] of Object.entries(summary.neverTriggeredByEvaluationState)) {
    console.log(`  ${pad(count, 4)} ${state}`);
  }
  console.log('');
  for (const candidate of neverTriggered.slice(0, 15)) {
    const topReason = candidate.topSkipReasons[0]?.reason ?? 'unknown';
    console.log(`${pad(candidate.routeKm + 'km', 9)} ${pad(candidate.category, 16)} ${pad(candidate.evaluationState, 28)} considered=${pad(candidate.timesConsidered, 5)} eligible=${pad(candidate.timesEligible, 5)} top reason: ${topReason}  — ${candidate.title}`);
  }
  if (neverTriggered.length > 15) console.log(`  ...and ${neverTriggered.length - 15} more (see JSON report)`);
  console.log('');
  console.log(`Duplicate candidates (${duplicateCandidates.length})`);
  console.log('----------------------------');
  if (duplicateCandidates.length === 0) {
    console.log('  none');
  } else {
    for (const dup of duplicateCandidates) console.log(`  "${dup.title}" x${dup.count}`);
  }
  console.log('');
  console.log(`Full JSON report written to: ${jsonPath}`);
  console.log('');
}

async function main() {
  const { journeyId, flags } = parseArgs(process.argv.slice(2));

  if (!journeyId) {
    console.error('Usage: npm run playback-report -- <journeyId> [--speed=60] [--min-gap=8] [--radius=10000] [--language=en] [--out=path.json]');
    process.exit(1);
  }

  const assumedSpeedKmh = flags.speed ? Number(flags.speed) : 60;
  const minGapMinutes = flags['min-gap'] ? Number(flags['min-gap']) : RECOMMENDATION_CONFIG.defaultMinGapMinutes;
  const radiusMeters = flags.radius ? Number(flags.radius) : RECOMMENDATION_CONFIG.maxSearchRadiusMeters;
  const language = flags.language ?? 'en';
  const jsonPath = flags.out ?? `reports/playback-${journeyId}.json`;

  const result = await simulateJourney(journeyId, {
    assumedSpeedKmh,
    minGapMinutes,
    radiusMeters,
    language,
    includeStepDiagnostics: false,
  });

  if (result === null) {
    console.error(`No journey found with id ${journeyId}`);
    await db.end();
    process.exit(1);
  }

  const { routeLengthKm, events, diagnostics } = result;
  const timeline = buildTimelineRows(events, assumedSpeedKmh);
  const summary = summarize(
    journeyId,
    routeLengthKm,
    assumedSpeedKmh,
    timeline,
    diagnostics.neverTriggeredCandidates,
    diagnostics.categoryDistribution,
    diagnostics.rejectionReasonCounts,
    diagnostics.duplicateCandidates,
  );

  const jsonReport = {
    summary,
    timeline,
    neverTriggeredCandidates: diagnostics.neverTriggeredCandidates,
    duplicateCandidates: diagnostics.duplicateCandidates,
    generatedAt: new Date().toISOString(),
  };

  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));

  printConsoleReport(summary, timeline, diagnostics.neverTriggeredCandidates, diagnostics.duplicateCandidates, jsonPath);

  await db.end();
}

main();
