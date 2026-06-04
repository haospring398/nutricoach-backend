import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from './env';
import * as schema from '../models';

export const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  max: 5,
  min: 0,
  idleTimeoutMillis: 4 * 60 * 1000,
  connectionTimeoutMillis: 15_000,
  statement_timeout: 30_000,
  query_timeout: 30_000,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('⚠️ PostgreSQL pool error:', err.message);
});

export const db = drizzle(pool, {
  schema,
  logger: env.NODE_ENV === 'development',
});

/** Call once at startup to verify the connection is alive. */
export async function testDbConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const { rows } = await client.query(
      'SELECT NOW() AS now, version() AS ver',
    );
    client.release();

    console.log('✅ PostgreSQL connected');
    console.log(`   time    : ${rows[0].now}`);
    console.log(`   version : ${rows[0].ver.split(',')[0]}`);
    return true;
  } catch (err: any) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    return false;
  }
}

/** Call during graceful shutdown. */
export async function closeDbConnection(): Promise<void> {
  await pool.end();
  console.log('✅ PostgreSQL pool closed');
}

export type Database = typeof db;
