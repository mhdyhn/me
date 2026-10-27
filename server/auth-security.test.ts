// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { changeOwnPassword, createSession, hashPassword, resetUserPassword, userForToken, verifyPassword } from './auth.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase } from './db.ts';
import { getPersonalRecord } from './personalData.ts';
import { findUserByUsername, setUserActive } from './users.ts';

const now = new Date('2026-10-13T08:00:00Z');
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

async function insertStaleSession(db: Awaited<ReturnType<typeof openDatabase>>, userId: number, token: string, authVersion: number) {
  await db.query('INSERT INTO sessions (token_hash, user_id, expires_at, auth_version) VALUES ($1, $2, $3, $4)',
    [tokenHash(token), userId, '2026-11-13T08:00:00.000Z', authVersion]);
}

describe('session version security', () => {
  it('preserves existing sessions and personal programmes through repeated migration', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meety-auth-migration-'));
    let legacy: PGlite | undefined;
    let db: Awaited<ReturnType<typeof openDatabase>> | undefined;
    try {
      legacy = new PGlite(dir);
      await legacy.exec(`
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
      await legacy.query(
        `INSERT INTO users (username, password_hash, role, display_name, created_at)
         VALUES ($1, $2, 'admin', 'مدیر قدیمی', $3)`,
        ['legacy-owner', hashPassword('legacy-pass-123'), now.toISOString()],
      );
      await legacy.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, 1, $2)',
        [tokenHash('legacy-session'), '2026-11-13T08:00:00.000Z']);
      await legacy.query('INSERT INTO user_personal_programs (user_id, body, updated_at) VALUES (1, $1, $2)',
        [JSON.stringify([{ id: 'old-program' }]), now.toISOString()]);
      await legacy.close();
      legacy = undefined;

      db = await openDatabase(dir);
      expect(await userForToken(db, 'legacy-session', now)).toEqual({ userId: 1 });
      expect((await getPersonalRecord(db, 1, 'program', 'main'))?.value).toEqual([{ id: 'old-program' }]);
      expect((await findUserByUsername(db, 'legacy-owner'))?.authVersion).toBe(0);
      await db.close();
      db = await openDatabase(dir);
      expect(await userForToken(db, 'legacy-session', now)).toEqual({ userId: 1 });
      expect((await getPersonalRecord(db, 1, 'program', 'main'))?.value).toEqual([{ id: 'old-program' }]);
    } finally {
      if (db) await db.close();
      if (legacy) await legacy.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  it('rejects stale logins and stale password changes after a password is changed', async () => {
    const db = await openDatabase('memory');
    try {
      await ensureAdmin(db, 'owner', 'owner-pass-123', now);
      const original = (await findUserByUsername(db, 'owner'))!;
      const currentToken = (await createSession(db, original.id, original.authVersion, now))!;
      const otherToken = (await createSession(db, original.id, original.authVersion, now))!;
      const newHash = hashPassword('owner-new-pass-123');
      expect(await changeOwnPassword(db, original.id, original.passwordHash, original.authVersion, currentToken, newHash, now)).toBe(true);
      expect(await userForToken(db, currentToken, now)).toEqual({ userId: original.id });
      expect(await userForToken(db, otherToken, now)).toBeNull();
      expect(await createSession(db, original.id, original.authVersion, now)).toBeNull();

      // Simulate an old-credential login that inserted its row after the password update.
      await insertStaleSession(db, original.id, 'late-login', original.authVersion);
      expect(await userForToken(db, 'late-login', now)).toBeNull();
      expect(await changeOwnPassword(db, original.id, original.passwordHash, original.authVersion, currentToken, hashPassword('stale-overwrite'), now)).toBe(false);
      expect(verifyPassword('owner-new-pass-123', (await findUserByUsername(db, 'owner'))!.passwordHash)).toBe(true);
    } finally {
      await db.close();
    }
  }, 15000);

  it('invalidates late old-credential sessions after a reset or a deactivate/reactivate cycle', async () => {
    const db = await openDatabase('memory');
    try {
      await ensureAdmin(db, 'owner', 'owner-pass-123', now);
      const original = (await findUserByUsername(db, 'owner'))!;
      const originalToken = (await createSession(db, original.id, original.authVersion, now))!;
      expect(await resetUserPassword(db, original.id, hashPassword('new-temp-pass'), 'encrypted-temp')).toBe(true);
      expect(await userForToken(db, originalToken, now)).toBeNull();
      await insertStaleSession(db, original.id, 'late-reset-login', original.authVersion);
      expect(await userForToken(db, 'late-reset-login', now)).toBeNull();
      expect(await createSession(db, original.id, original.authVersion, now)).toBeNull();

      const afterReset = (await findUserByUsername(db, 'owner'))!;
      const tokenBeforeDisable = (await createSession(db, original.id, afterReset.authVersion, now))!;
      await setUserActive(db, original.id, false);
      await setUserActive(db, original.id, true);
      expect(await userForToken(db, tokenBeforeDisable, now)).toBeNull();
      await insertStaleSession(db, original.id, 'late-disable-login', afterReset.authVersion);
      expect(await userForToken(db, 'late-disable-login', now)).toBeNull();
      expect(await createSession(db, original.id, afterReset.authVersion, now)).toBeNull();
      const reactivated = (await findUserByUsername(db, 'owner'))!;
      const fresh = (await createSession(db, reactivated.id, reactivated.authVersion, now))!;
      expect(await userForToken(db, fresh, now)).toEqual({ userId: original.id });
    } finally {
      await db.close();
    }
  }, 15000);
});
