import { Pool } from 'pg';

export const db = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://journey:journey@localhost:5432/journey',
});
