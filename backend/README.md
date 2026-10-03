# Journey Companion API

## Setup

```bash
npm install
npm run build
```

TypeScript uses `@types/pg` for PostgreSQL declarations. If an existing checkout has stale `node_modules`, remove it and reinstall:

```bash
rm -rf node_modules
npm install
```

## Database / content import

Start PostgreSQL/PostGIS with the repository's Docker Compose setup, then import the curated content:

```bash
npm run import-content
```

The import is **idempotent**. Re-running the same JSON file updates the same content IDs instead of creating duplicates. Curated content is marked verified by default.

For content that still needs human review:

```bash
npm run import-content -- delhi-nainital-content-v1.json --pending
```

## Recommendation Engine V2

Run the API:

```bash
npm run dev
```

Recommendation requests should include the traveller's current position along the route:

```json
{
  "routeGeoJson": {
    "type": "LineString",
    "coordinates": [[77.209,28.6139],[79.0,28.8]]
  },
  "currentRouteFraction": 0.42,
  "radiusMeters": 5000,
  "language": "en",
  "interests": ["history", "culture"],
  "alreadyPlayed": [],
  "previousCategories": [],
  "minutesSinceLastInteraction": 12
}
```

V2 searches a wider corridor but prefers stories roughly 800 m–3 km ahead, rejects stories more than 5 km ahead, applies an 8-minute narration gap, and returns alternatives plus rejection reasons for debugging.

## Simulator

The journey simulator uses the same engine as the API and evaluates the route in small time steps so that recommendations are triggered before the traveller reaches the POI.


## Recommendation Engine V2.1 migration

Run the one-time content identity migration against an existing database before importing the curated content again:

```bash
docker compose exec -T db psql -U journey -d journey < db/migrations/003_content_key_and_dedupe.sql
```

The migration adds `content_key`, removes duplicate imported stories, and adds a unique index so future imports remain idempotent.

For a fresh database, `db/init.sql` creates the base schema; run the V2.1 migration before the first content import as well.
