import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgres://journey:journey@localhost:5432/journey';

// Local docker-compose Postgres doesn't speak SSL; hosted providers (e.g.
// Supabase) require it. Skip SSL only for local connections.
const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

export const db = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
