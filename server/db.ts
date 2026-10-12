import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite storage for the server. The schema is created on open with IF NOT EXISTS so a
 * fresh file and an existing one both work. Later phases add tables here, never edit
 * the ones already shipped.
 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'coach', 'student')),
      display_name TEXT NOT NULL,
      coach_id INTEGER REFERENCES users(id),
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
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
}
