import { Buffer } from 'node:buffer';
import { crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import type { ContentCandidate } from '../content/repository.js';

export type JourneyRoute = {
  type: 'LineString';
  coordinates: ReadonlyArray<readonly [number, number]>;
};

export type JourneyPackageStory = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  narration?: {
    headline: string;
    summary: string;
    cue: string;
  };
};

export type JourneyPackageAsset = {
  kind: 'manifest' | 'route' | 'stories';
  name: string;
  path: string;
};

export type JourneyPackageManifest = {
  journeyId: string;
  generatedAt: string;
  expiresAt: string;
  contentVersion: string;
  language: string;
  route: JourneyRoute;
  interests: string[];
  storyCount: number;
  stories: JourneyPackageStory[];
  assets: JourneyPackageAsset[];
};

export type JourneyPackageDownload = {
  packageVersion: 'journey-package-v1';
  journeyId: string;
  generatedAt: string;
  expiresAt: string;
  contentVersion: string;
  language: string;
  interests: string[];
  manifest: JourneyPackageManifest;
  files: Array<{ name: string; path: string; kind: 'route' | 'stories' | 'manifest' }>;
};

export function buildJourneyPackageManifest({
  journeyId,
  route,
  language,
  interests,
  content,
}: {
  journeyId: string;
  route: JourneyRoute;
  language: string;
  interests: string[];
  content: ContentCandidate[];
}): JourneyPackageManifest {
  const stories: JourneyPackageStory[] = content.map(candidate => {
    const cue = candidate.narration_hint?.trim() || `Short ${candidate.category} note along the route.`;
    // Cue is also surfaced separately (e.g. a UI "Cue:" line) — don't embed it
    // in the narrated summary too, otherwise the same sentence gets said/shown twice.
    const summary = [candidate.title, candidate.long_description ?? candidate.short_description].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    return {
      id: candidate.id,
      title: candidate.title,
      category: candidate.category,
      tags: candidate.tags ?? [],
      narration: {
        headline: candidate.title,
        cue,
        summary,
      },
    };
  });

  // Deterministic version identifier for this exact set of stories, so a
  // mobile client can tell whether its downloaded package is stale without
  // re-fetching the full content each time.
  const contentVersion = createHash('sha1')
    .update(content.map(c => c.content_key ?? c.id).sort().join('|'))
    .digest('hex')
    .slice(0, 16);

  const generatedAt = new Date();
  const expiresAt = new Date(generatedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    journeyId,
    generatedAt: generatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    contentVersion,
    language,
    route,
    interests,
    storyCount: stories.length,
    stories,
    assets: [
      { kind: 'route', name: 'route.geojson', path: 'route.geojson' },
      { kind: 'stories', name: 'stories.json', path: 'stories.json' },
      { kind: 'manifest', name: 'manifest.json', path: 'manifest.json' },
    ],
  };
}

export function buildJourneyPackageDownload({
  journeyId,
  route,
  language,
  interests,
  content,
}: {
  journeyId: string;
  route: JourneyRoute;
  language: string;
  interests: string[];
  content: ContentCandidate[];
}): JourneyPackageDownload {
  const manifest = buildJourneyPackageManifest({ journeyId, route, language, interests, content });

  return {
    packageVersion: 'journey-package-v1',
    journeyId,
    generatedAt: manifest.generatedAt,
    expiresAt: manifest.expiresAt,
    contentVersion: manifest.contentVersion,
    language,
    interests,
    manifest,
    files: [
      { name: 'route.geojson', path: 'route.geojson', kind: 'route' },
      { name: 'stories.json', path: 'stories.json', kind: 'stories' },
      { name: 'manifest.json', path: 'manifest.json', kind: 'manifest' },
    ],
  };
}

export function buildJourneyPackageArchive({
  journeyId,
  route,
  language,
  interests,
  content,
}: {
  journeyId: string;
  route: JourneyRoute;
  language: string;
  interests: string[];
  content: ContentCandidate[];
}): Buffer {
  const manifest = buildJourneyPackageManifest({ journeyId, route, language, interests, content });
  const files = [
    { name: 'route.geojson', content: Buffer.from(JSON.stringify(route, null, 2) + '\n', 'utf8') },
    { name: 'stories.json', content: Buffer.from(JSON.stringify(manifest.stories, null, 2) + '\n', 'utf8') },
    { name: 'manifest.json', content: Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8') },
  ];

  const localFileHeader = (name: string, content: Buffer) => {
    const crc = crc32(content) >>> 0;
    const fileNameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.alloc(30 + fileNameBytes.length);
    data.writeUInt32LE(0x04034b50, 0);
    data.writeUInt16LE(20, 4);
    data.writeUInt16LE(0, 6);
    data.writeUInt16LE(0, 8);
    data.writeUInt16LE(0, 10);
    data.writeUInt32LE(crc, 14);
    data.writeUInt32LE(content.length, 18);
    data.writeUInt32LE(content.length, 22);
    data.writeUInt16LE(fileNameBytes.length, 26);
    data.writeUInt16LE(0, 28);
    fileNameBytes.copy(data, 30);
    return Buffer.concat([data, content]);
  };

  const centralDirectoryHeader = (name: string, offset: number, content: Buffer) => {
    const crc = crc32(content) >>> 0;
    const fileNameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.alloc(46 + fileNameBytes.length);
    data.writeUInt32LE(0x02014b50, 0);
    data.writeUInt16LE(20, 4);
    data.writeUInt16LE(20, 6);
    data.writeUInt16LE(0, 8);
    data.writeUInt16LE(0, 10);
    data.writeUInt16LE(0, 12);
    data.writeUInt16LE(0, 14);
    data.writeUInt32LE(crc, 16);
    data.writeUInt32LE(content.length, 20);
    data.writeUInt32LE(content.length, 24);
    data.writeUInt16LE(fileNameBytes.length, 28);
    data.writeUInt16LE(0, 30);
    data.writeUInt16LE(0, 32);
    data.writeUInt16LE(0, 34);
    data.writeUInt16LE(0, 36);
    data.writeUInt32LE(0, 38);
    data.writeUInt32LE(offset, 42);
    fileNameBytes.copy(data, 46);
    return data;
  };

  let offset = 0;
  const entries: Buffer[] = [];
  const centralEntries: Buffer[] = [];

  for (const file of files) {
    const header = localFileHeader(file.name, file.content);
    entries.push(header);
    centralEntries.push(centralDirectoryHeader(file.name, offset, file.content));
    offset += header.length;
  }

  const centralOffset = offset;
  const central = Buffer.concat(centralEntries);
  const trailer = Buffer.alloc(22);
  trailer.writeUInt32LE(0x06054b50, 0);
  trailer.writeUInt16LE(0, 4);
  trailer.writeUInt16LE(0, 6);
  trailer.writeUInt16LE(files.length, 8);
  trailer.writeUInt16LE(files.length, 10);
  trailer.writeUInt32LE(central.length, 12);
  trailer.writeUInt32LE(centralOffset, 16);
  trailer.writeUInt16LE(0, 20);

  return Buffer.concat([...entries, central, trailer]);
}
