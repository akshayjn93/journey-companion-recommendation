# Journey Companion — MVP

AI voice companion for journeys. MVP target: Delhi → Nainital.

## MVP flow

1. Create a journey with origin, destination and interests.
2. Load a route polyline.
3. Find verified content near the route using PostGIS.
4. Rank candidates based on relevance, interest and journey history.
5. Generate short narration from verified facts only.
6. Later: pre-generate/download audio for offline playback.

## Stack

- Backend: Node.js + TypeScript + Fastify
- Database: PostgreSQL + PostGIS
- Local dev: Docker Compose
- Mobile: React Native (to be added after backend simulation works)

## Start locally

```bash
docker compose up -d db
cd backend
npm install
npm run dev
```

## Current milestone

The backend currently contains the content schema, seed data, candidate retrieval/ranking interfaces, and a journey simulator. Mapping/LLM/TTS providers are deliberately abstracted behind interfaces so they can be selected after the prototype test.

## Import fix / existing database

Run the migrations in order on an existing database. For the V2.1 importer, migration 004 is required because the importer uses `ON CONFLICT (content_key)`.

```bash
docker compose exec -T db psql -U journey -d journey < db/migrations/003_content_key_and_dedupe.sql
docker compose exec -T db psql -U journey -d journey < db/migrations/004_content_key_unique.sql
```

Then:

```bash
cd backend
npm install
npm run build
npm run import-content
```

The importer is idempotent by `content_key`; repeated imports update the existing row rather than inserting another copy.
