import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SESSION_DAYS = 30;
/** No look-alike characters (0/o, 1/l/i) so a coach can read a password aloud or write it down. */
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, SCRYPT_OPTIONS);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function generatePassword(length = 10): string {
  let result = '';
  for (let i = 0; i < length; i += 1) result += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return result;
}

/** Short numeric usernames such as s482913 or c105577: easy to type on a phone. */
export function generateUsername(db: DatabaseSync, prefix: 'c' | 's'): string {
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?');
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `${prefix}${randomInt(100000, 1000000)}`;
    if (!exists.get(candidate)) return candidate;
  }
  throw new Error('username space exhausted');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Only the hash of a session token is stored, so a leaked database cannot be replayed. */
export function createSession(db: DatabaseSync, userId: number, now: Date): string {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), userId, expiresAt);
  return token;
}

export function userIdForToken(db: DatabaseSync, token: string, now: Date): number | null {
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(hashToken(token));
  if (!row) return null;
  if (String(row.expires_at) <= now.toISOString()) {
    deleteSession(db, token);
    return null;
  }
  return Number(row.user_id);
}

export function deleteSession(db: DatabaseSync, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function deleteSessionsForUser(db: DatabaseSync, userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}
