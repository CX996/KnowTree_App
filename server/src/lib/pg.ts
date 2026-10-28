import { Pool } from 'pg';
import { loadEnv } from '../storage/database/supabase-client';

let pool: Pool | null = null;

export function getPool(): Pool {
  loadEnv();
  if (!pool) {
    if (!process.env.PGDATABASE_URL) {
      throw new Error('PGDATABASE_URL is not set');
    }
    pool = new Pool({ connectionString: process.env.PGDATABASE_URL });
  }
  return pool;
}