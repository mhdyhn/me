import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { migrateChat } from './chat.ts';
import { migrateNutrition } from './nutrition.ts';
import { migrateSessions } from './sessions.ts';
import { migratePayments } from './payments.ts';

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
  // The hosted database closes idle connections (free tier pauses after inactivity). Without this listener
  // Node treats the error as fatal and the whole server stops. The pool opens a new connection on the next request.
  pool.on('error', (error) => {
    console.error('Database connection dropped; a new one opens on the next request.', error.message);
  });
  return {
    async query<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
      try {
        const result = await pool.query(sql, params as unknown[]);
        return result.rows as T[];
      } catch (error: any) {
        const msg = String(error?.message ?? '');
        const code = String(error?.code ?? '');
        const isTransient = code === '57P01' || code === 'ECONNRESET' || msg.includes('Connection terminated') || msg.includes('connection closed');
        if (isTransient) {
          console.warn('Retrying query after transient connection drop:', msg);
          const result = await pool.query(sql, params as unknown[]);
          return result.rows as T[];
        }
        throw error;
      }
    },
    async exec(sql: string): Promise<void> {
      try {
        await pool.query(sql);
      } catch (error: any) {
        const msg = String(error?.message ?? '');
        const code = String(error?.code ?? '');
        const isTransient = code === '57P01' || code === 'ECONNRESET' || msg.includes('Connection terminated') || msg.includes('connection closed');
        if (isTransient) {
          console.warn('Retrying exec after transient connection drop:', msg);
          await pool.query(sql);
          return;
        }
        throw error;
      }
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

    -- Personal workout programme synced across devices for any signed-in user (admin, coach, etc.)
    CREATE TABLE IF NOT EXISTS user_personal_programs (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_coach_id ON users(coach_id);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_student_programs_coach_id ON student_programs(coach_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);
  await migrateChat(db);
  await migrateNutrition(db);
  await migrateSessions(db);
  await migratePayments(db);
  await db.exec('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_enc TEXT;');
}
