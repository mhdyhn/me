import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Db } from './db.ts';

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
export async function generateUsername(db: Db, prefix: 'c' | 's'): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `${prefix}${randomInt(100000, 1000000)}`;
    const found = await db.query('SELECT 1 FROM users WHERE username = $1', [candidate]);
    if (found.length === 0) return candidate;
  }
  throw new Error('username space exhausted');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Only the hash of a session token is stored, so a leaked database cannot be replayed. */
export async function createSession(db: Db, userId: number, now: Date): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [hashToken(token), userId, expiresAt]);
  return token;
}

/** The signed-in user for a session token, in one query (the app makes this call on every request). */
export async function userForToken(db: Db, token: string, now: Date): Promise<{ userId: number } | null> {
  const row = (await db.query<{ user_id: number }>(
    'SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > $2',
    [hashToken(token), now.toISOString()],
  ))[0];
  return row ? { userId: Number(row.user_id) } : null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

export async function deleteSessionsForUser(db: Db, userId: number): Promise<void> {
  await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}
