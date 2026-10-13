import { hashPassword } from './auth.ts';
import type { Db } from './db.ts';
import { findUserByUsername, insertUser } from './users.ts';

/**
 * Creates the single admin (the developer) from ADMIN_USERNAME and ADMIN_PASSWORD on the
 * first start. Later starts do nothing, so changing the env values never overrides an account.
 */
export async function ensureAdmin(db: Db, username: string | undefined, password: string | undefined, now: Date): Promise<'created' | 'exists' | 'skipped'> {
  if (!username || !password) return 'skipped';
  if (password.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  if (await findUserByUsername(db, username)) return 'exists';
  await insertUser(db, { username, passwordHash: hashPassword(password), role: 'admin', displayName: 'مدیر', coachId: null, mustChangePassword: false, now });
  return 'created';
}
