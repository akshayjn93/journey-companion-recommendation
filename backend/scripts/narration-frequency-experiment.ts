/**
 * Phase 5 — Narration Frequency Experiment
 *
 * Runs the existing journey simulator across multiple `minGapMinutes`
 * pacing settings for the SAME journey and compares story count, silent
 * stretches, interruption frequency, story quality and spoken minutes per
 * journey hour — so a comfortable narration density can be chosen.
 *
 * This does NOT change any recommendation logic, trigger logic, route
 * matching or content thresholds. It only runs the existing simulator
 * (see backend/src/modules/route/simulator.ts) repeatedly with different
 * `minGapMinutes` values and reports on the results.
 *
 * Usage:
 *   npm run narration-frequency -- <journeyId> [options]
 *
 * Options:
 *   --speed=<kmh>       assumed driving speed, default 60
 *   --gaps=<list>       comma-separated minute gaps to compare, default 8,13,20
 *                       (roughly ~8min / ~12-15min / ~20min pacing per the
 *                       handoff doc's Phase 5 spec)
 *   --radius=<meters>   candidate search radius, default engine config value
 *   --language=<code>   content language, default en
 *   --out=<path>        JSON report output path, default reports/narration-frequency-<journeyId>.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { db } from '../src/common/db.js';
import { simulateJourney } from '../src/modules/route/simulator.js';
import { RECOMMENDATION_CONFIG } from '../src/modules/recommendation/config.js';
import { buildTimelineRows, formatDuration, pad, summarize, type TimelineRow } from './lib/playback-metrics.js';

function parseArgs(argv: string[]) {
  const [journeyId, ...rest] = argv;
  const flags: Record<string, string> = {};
  for (const arg of rest) {
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (match) flags[match[1]] = match[2];
  }
  return { journeyId, flags };
}

function storyTypeMix(timeline: TimelineRow[]) {
  const counts = { verified_fact: 0, local_tradition: 0 };
  for (const row of timeline) {
    if (row.storyType === 'local_tradition') counts.local_tradition += 1;
    else counts.verified_fact += 1;
  }
  return counts;
}

function averageEditorialScore(timeline: TimelineRow[]) {
  // Note: pg returns NUMERIC columns (editorial_score) as strings at
  // runtime even though the TS type says `number | null` — coerce explicitly.
  const scored = timeline
    .map(row => (row.editorialScore === null || row.editorialScore === undefined ? null : Number(row.editorialScore)))
    .filter((v): v is number => v !== null && !Number.isNaN(v));
  if (!scored.length) return null;
  return Number((scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(2));
}

function totalNarrationMinutes(timeline: TimelineRow[]) {
  const totalSeconds = timeline.reduce((sum, row) => sum + row.estimatedNarrationSeconds, 0);
  return Number((totalSeconds / 60).toFixed(1));
}

async function main() {
  const { journeyId, flags } = parseArgs(process.argv.slice(2));

  if (!journeyId) {
    console.error('Usage: npm run narration-frequency -- <journeyId> [--speed=60] [--gaps=8,13,20] [--radius=10000] [--language=en] [--out=path.json]');
    process.exit(1);
  }

  const assumedSpeedKmh = flags.speed ? Number(flags.speed) : 60;
  const radiusMeters = flags.radius ? Number(flags.radius) : RECOMMENDATION_CONFIG.maxSearchRadiusMeters;
  const language = flags.language ?? 'en';
  const gapMinutesList = (flags.gaps ? flags.gaps.split(',') : ['8', '13', '20']).map(Number);
  const jsonPath = flags.out ?? `reports/narration-frequency-${journeyId}.json`;

  const settings: Array<{
    minGapMinutes: number;
    summary: ReturnType<typeof summarize>;
    timeline: TimelineRow[];
    spokenMinutesTotal: number;
    spokenMinutesPerHour: number;
    avgEditorialScore: number | null;
    storyTypeMix: { verified_fact: number; local_tradition: number };
  }> = [];

  for (const minGapMinutes of gapMinutesList) {
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

    const spokenMinutesTotal = totalNarrationMinutes(timeline);
    const journeyDurationHours = summary.journeyDurationMinutes / 60;

    settings.push({
      minGapMinutes,
      summary,
      timeline,
      spokenMinutesTotal,
      spokenMinutesPerHour: Number((spokenMinutesTotal / journeyDurationHours).toFixed(1)),
      avgEditorialScore: averageEditorialScore(timeline),
      storyTypeMix: storyTypeMix(timeline),
    });
  }

  console.log('');
  console.log('Narration Frequency Experiment');
  console.log('===============================');
  console.log(`Journey ID:         ${journeyId}`);
  console.log(`Route distance:     ${settings[0]?.summary.routeLengthKm ?? '-'} km`);
  console.log(`Assumed speed:      ${assumedSpeedKmh} km/h`);
  console.log(`Estimated duration: ${formatDuration(settings[0]?.summary.journeyDurationMinutes ?? 0)}`);
  console.log(`Pacing settings compared (min-gap minutes): ${gapMinutesList.join(', ')}`);
  console.log('');
  console.log(
    pad('MinGap', 9) +
    pad('Stories', 9) +
    pad('Per hr', 8) +
    pad('AvgGap', 9) +
    pad('MaxGap', 9) +
    pad('Spoken/hr', 11) +
    pad('AvgEdit', 9) +
    pad('Fact/Trad', 11) +
    pad('NeverTrig', 10),
  );
  for (const setting of settings) {
    console.log(
      pad(`${setting.minGapMinutes}m`, 9) +
      pad(setting.summary.storiesTriggered, 9) +
      pad(setting.summary.storiesPerHour, 8) +
      pad(`${setting.summary.gapKm.average}km`, 9) +
      pad(`${setting.summary.gapKm.max}km`, 9) +
      pad(`${setting.spokenMinutesPerHour}m`, 11) +
      pad(setting.avgEditorialScore ?? '-', 9) +
      pad(`${setting.storyTypeMix.verified_fact}/${setting.storyTypeMix.local_tradition}`, 11) +
      pad(setting.summary.neverTriggeredCount, 10),
    );
  }
  console.log('');
  console.log('MinGap = configured minimum minutes between stories.');
  console.log('AvgGap/MaxGap = actual achieved gap between triggered stories (km); MaxGap is the longest silent stretch.');
  console.log('Spoken/hr = estimated narration minutes spoken per hour of driving (140 wpm heuristic).');
  console.log('AvgEdit = average editorial_score among triggered stories that have one (Phase 3 metadata); "-" if none scored.');
  console.log('Fact/Trad = count of triggered stories tagged verified_fact vs local_tradition.');
  console.log('NeverTrig = candidates in range that never got triggered at this pacing.');
  console.log('');
  console.log(`Full JSON report written to: ${jsonPath}`);
  console.log('');

  const jsonReport = {
    journeyId,
    assumedSpeedKmh,
    radiusMeters,
    language,
    gapMinutesCompared: gapMinutesList,
    settings,
    generatedAt: new Date().toISOString(),
  };

  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));

  await db.end();
}

main();
