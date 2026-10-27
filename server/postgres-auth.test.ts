// @vitest-environment node
// Optional integration tests. Use only a disposable PostgreSQL database with CREATE SCHEMA permission.
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { changeOwnPassword, createSession, hashPassword, userForToken, verifyPassword } from './auth.ts';
import { openDatabase, type Db } from './db.ts';
import { getPersonalRecord } from './personalData.ts';
import { findUserByUsername, setUserActive } from './users.ts';

const url = process.env.TEST_POSTGRES_URL;
const clock = new Date('2026-10-13T08:00:00Z');
const legacyToken = 'legacy-session';
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const schema = `meety_test_${randomBytes(10).toString('hex')}`;
let root: pg.Client | undefined;
let sql: pg.Client | undefined;
let db: Db | undefined;
let scopedUrl: string;
let schemaCreated = false;

// Each run owns a randomly named schema; it never touches tables outside that schema.
describe.skipIf(!url)('PostgreSQL session migration and concurrency', () => {
  beforeAll(async () => {
    root = new pg.Client({ connectionString: url });
    await root.connect();
    await root.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    const target = new URL(url!);
    target.searchParams.set('options', `-c search_path=${schema}`);
    scopedUrl = target.toString();
    sql = new pg.Client({ connectionString: scopedUrl });
    await sql.connect();
    await sql.query(`
      CREATE TABLE users (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL,
        display_name TEXT NOT NULL, coach_id INTEGER REFERENCES users(id),
        must_change_password INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
        password_enc TEXT, is_active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE user_personal_programs (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
    await sql.query(`INSERT INTO users (username, password_hash, role, display_name, created_at) VALUES ($1, $2, 'admin', 'مدیر آزمایشی', $3)`,
      ['legacy', hashPassword('original-password'), clock.toISOString()]);
    await sql.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, 1, $2)',
      [tokenHash(legacyToken), '2026-11-13T08:00:00.000Z']);
    await sql.query('INSERT INTO user_personal_programs (user_id, body, updated_at) VALUES (1, $1, $2)',
      [JSON.stringify([{ id: 'saved-program' }]), clock.toISOString()]);
    db = await openDatabase(scopedUrl);
  }, 30000);

  afterAll(async () => {
    await db?.close();
    await sql?.end();
    if (root) {
      try { if (schemaCreated) await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
      finally { await root.end(); }
    }
  }, 30000);

  it('keeps an existing session and programme after migration and a second startup', async () => {
    expect(await userForToken(db!, legacyToken, clock)).toEqual({ userId: 1 });
    expect((await getPersonalRecord(db!, 1, 'program', 'main'))?.value).toEqual([{ id: 'saved-program' }]);
    await db!.close();
    db = await openDatabase(scopedUrl);
    expect(await userForToken(db, legacyToken, clock)).toEqual({ userId: 1 });
    expect((await getPersonalRecord(db, 1, 'program', 'main'))?.value).toEqual([{ id: 'saved-program' }]);
  });

  it('allows only one concurrent password change and rolls back if revocation fails', async () => {
    const original = (await findUserByUsername(db!, 'legacy'))!;
    const other = (await createSession(db!, original.id, original.authVersion, clock))!;
    const first = hashPassword('new-password-A');
    const second = hashPassword('new-password-B');
    const outcomes = await Promise.all([
      changeOwnPassword(db!, original.id, original.passwordHash, original.authVersion, legacyToken, first, clock),
      changeOwnPassword(db!, original.id, original.passwordHash, original.authVersion, legacyToken, second, clock),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(await userForToken(db!, legacyToken, clock)).toEqual({ userId: original.id });
    expect(await userForToken(db!, other, clock)).toBeNull();
    const current = (await findUserByUsername(db!, 'legacy'))!;
    expect(Number(verifyPassword('new-password-A', current.passwordHash)) + Number(verifyPassword('new-password-B', current.passwordHash))).toBe(1);

    const remaining = (await createSession(db!, current.id, current.authVersion, clock))!;
    await sql!.query(`CREATE FUNCTION reject_test_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected delete failure'; END $$`);
    await sql!.query('CREATE TRIGGER reject_session_delete BEFORE DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION reject_test_delete()');
    try {
      await expect(changeOwnPassword(db!, current.id, current.passwordHash, current.authVersion, legacyToken, hashPassword('must-not-stick'), clock)).rejects.toThrow('injected delete failure');
      const afterFailure = (await findUserByUsername(db!, 'legacy'))!;
      expect(afterFailure.passwordHash).toBe(current.passwordHash);
      expect(afterFailure.authVersion).toBe(current.authVersion);
      expect(await userForToken(db!, legacyToken, clock)).toEqual({ userId: current.id });
      expect(await userForToken(db!, remaining, clock)).toEqual({ userId: current.id });
    } finally {
      await sql!.query('DROP TRIGGER IF EXISTS reject_session_delete ON sessions');
      await sql!.query('DROP FUNCTION IF EXISTS reject_test_delete()');
    }
  }, 30000);

  it('invalidates an in-flight old-credential login after deactivate/reactivate', async () => {
    const current = (await findUserByUsername(db!, 'legacy'))!;
    const stale = new pg.Client({ connectionString: scopedUrl });
    await stale.connect();
    try {
      await stale.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      const snapshot = await stale.query('SELECT id, auth_version FROM users WHERE id = $1', [current.id]);
      await setUserActive(db!, current.id, false);
      await setUserActive(db!, current.id, true);
      try {
        await stale.query(`INSERT INTO sessions (token_hash, user_id, expires_at, auth_version)
          SELECT $1, id, $2, auth_version FROM users WHERE id = $3 AND auth_version = $4`,
          [tokenHash('late-concurrent-token'), '2026-11-13T08:00:00.000Z', current.id, snapshot.rows[0].auth_version]);
        await stale.query('COMMIT');
      } catch (error) {
        await stale.query('ROLLBACK');
        expect((error as { code?: string }).code).toBe('40001');
      }
      expect(await userForToken(db!, legacyToken, clock)).toBeNull();
      expect(await userForToken(db!, 'late-concurrent-token', clock)).toBeNull();
      expect(await createSession(db!, current.id, current.authVersion, clock)).toBeNull();
      const fresh = (await findUserByUsername(db!, 'legacy'))!;
      const token = (await createSession(db!, fresh.id, fresh.authVersion, clock))!;
      expect(await userForToken(db!, token, clock)).toEqual({ userId: current.id });
    } finally {
      await stale.end();
    }
  }, 30000);
});
