/**
 * Update an existing journey's route_geometry with a real road-following
 * polyline (e.g. fetched from OSRM), instead of a coarse straight-line guess.
 *
 * Usage:
 *   npm run update-journey-route -- <journeyId> <path/to/route.geojson.json>
 */

import { readFileSync } from 'node:fs';
import { db } from '../src/common/db.js';

async function main() {
  const [journeyId, routeFile] = process.argv.slice(2);

  if (!journeyId || !routeFile) {
    console.error('Usage: npm run update-journey-route -- <journeyId> <path/to/route.geojson.json>');
    process.exit(1);
  }

  const routeGeoJson = JSON.parse(readFileSync(routeFile, 'utf-8'));

  if (routeGeoJson.type !== 'LineString' || !Array.isArray(routeGeoJson.coordinates)) {
    console.error('Route file must be a GeoJSON LineString with a coordinates array.');
    process.exit(1);
  }

  const result = await db.query(
    `UPDATE journeys
        SET route_geometry = ST_SetSRID(ST_GeomFromGeoJSON($2),4326)
      WHERE id = $1
      RETURNING id, ST_Length(route_geometry::geography) / 1000 AS route_length_km`,
    [journeyId, JSON.stringify(routeGeoJson)],
  );

  if (result.rowCount === 0) {
    console.error(`No journey found with id ${journeyId}`);
    process.exit(1);
  }

  console.log(`Updated journey ${journeyId}`);
  console.log(`New route length: ${Number(result.rows[0].route_length_km).toFixed(1)} km`);
  await db.end();
}

main();
