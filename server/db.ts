import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { migrateChat } from './chat.ts';
import { migrateNutrition } from './nutrition.ts';

/**
 * Storage for the server, PostgreSQL. Production uses a hosted database (Neon) through
 * DATABASE_URL. Tests use an in-process PostgreSQL ('memory'). Local development without a
 * DATABASE_URL keeps its data in a folder on disk. The schema is created with IF NOT EXISTS
 * so a new and an existing database both work. Later phases add tables here, never edit
 * the ones already shipped.
 */
export type Row = Record<string, any>;

export interface Db {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/** Opens the database. `target` is a postgres:// URL, 'memory', or a folder path for local use. */
export async function openDatabase(target: string): Promise<Db> {
  const db = target.startsWith('postgres') ? fromPool(target) : fromPGlite(target === 'memory' ? new PGlite() : new PGlite(target));
  await migrate(db);
  return db;
}

function fromPool(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  return {
    async query<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
      const result = await pool.query(sql, params as unknown[]);
      return result.rows as T[];
    },
    async exec(sql: string): Promise<void> {
      await pool.query(sql);
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}

function fromPGlite(pg: PGlite): Db {
  return {
    async query<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
      const result = await pg.query(sql, params as unknown[]);
      return result.rows as T[];
    },
    async exec(sql: string): Promise<void> {
      await pg.exec(sql);
    },
    async close(): Promise<void> {
      await pg.close();
    },
  };
}

async function migrate(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'coach', 'student')),
      display_name TEXT NOT NULL,
      coach_id INTEGER REFERENCES users(id),
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      password_enc TEXT,
      CHECK ((role = 'student') = (coach_id IS NOT NULL))
    );

    -- One active programme per student. The coach replaces it; the body is validated by programs.ts.
    CREATE TABLE IF NOT EXISTS student_programs (
      student_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      coach_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
  `);
  await migrateChat(db);
  await migrateNutrition(db);
  await db.exec('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_enc TEXT;');
}
