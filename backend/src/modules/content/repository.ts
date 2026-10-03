import { db } from '../../common/db.js';

export type ContentCandidate = {
  id: string;
  content_key?: string;
  title: string;
  short_description: string;
  long_description: string | null;
  narration_hint: string | null;
  category: string;
  tags: string[];
  interestingness: number;
  confidence: number;
  source_name: string;
  source_url: string | null;
  family_friendly: boolean;
  editorial_score: number | null;
  story_type: 'verified_fact' | 'local_tradition';
  distance_m: number;
  route_fraction?: number;
  route_length_m?: number;
  trigger_lng?: number;
  trigger_lat?: number;
};

const candidateSelect = `
  c.id,
  c.content_key,
  COALESCE(t.title, te.title) AS title,
  COALESCE(t.short_description, te.short_description) AS short_description,
  COALESCE(t.long_description, te.long_description) AS long_description,
  COALESCE(t.narration_hint, te.narration_hint) AS narration_hint,
  c.category, c.tags, c.interestingness, c.confidence,
  c.source_name, c.source_url, c.family_friendly,
  c.editorial_score, c.story_type
`;

export async function findNearRoute(routeGeoJson: object, radiusMeters = 5000, language = 'en') {
  const sql = `
    SELECT ${candidateSelect},
      ST_Distance(c.location::geography, route.geom::geography) AS distance_m,
      ST_LineLocatePoint(route.geom, c.location) AS route_fraction,
      ST_Length(route.geom::geography) AS route_length_m,
      ST_X(ST_LineInterpolatePoint(route.geom, ST_LineLocatePoint(route.geom, c.location))) AS trigger_lng,
      ST_Y(ST_LineInterpolatePoint(route.geom, ST_LineLocatePoint(route.geom, c.location))) AS trigger_lat
    FROM (SELECT ST_GeomFromGeoJSON($1) AS geom) route
    JOIN content c ON c.active = true AND c.verified = true
    JOIN content_translations te ON te.content_id = c.id AND te.language = 'en'
    LEFT JOIN content_translations t ON t.content_id = c.id AND t.language = $3
    WHERE ST_DWithin(c.location::geography, route.geom::geography, $2)
    ORDER BY route_fraction ASC
    LIMIT 200;
  `;
  const result = await db.query(sql, [JSON.stringify(routeGeoJson), radiusMeters, language]);
  return result.rows as ContentCandidate[];
}
