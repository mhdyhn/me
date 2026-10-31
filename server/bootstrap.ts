import { generatePassword, hashPassword } from './auth.ts';
import type { Db } from './db.ts';
import { findUserByUsername, insertUser } from './users.ts';

/** The name of the account that is created when the environment names no admin. */
const FALLBACK_ADMIN_USERNAME = 'admin';

export type AdminState = 'created' | 'exists' | 'skipped' | 'fallback';

/**
 * Creates the single admin (the developer) from ADMIN_USERNAME and ADMIN_PASSWORD on the
 * first start. Later starts do nothing, so changing the env values never overrides an account.
 *
 * When the environment names no admin at all, a database without an admin is useless: no coach
 * and no student can be created. Then an account with a random password is created instead and
 * the password is written to the log of the server, once. The account asks for a new password
 * at the first login.
 */
export async function ensureAdmin(db: Db, username: string | undefined, password: string | undefined, now: Date): Promise<AdminState> {
  if (!username || !password) {
    if (await hasAdmin(db)) return 'exists';
    if (await findUserByUsername(db, FALLBACK_ADMIN_USERNAME)) return 'exists';
    const generated = generatePassword(18);
    await insertUser(db, { username: FALLBACK_ADMIN_USERNAME, passwordHash: hashPassword(generated), role: 'admin', displayName: 'مدیر', coachId: null, mustChangePassword: true, now });
    console.log(`No ADMIN_USERNAME in the environment, so the admin account "${FALLBACK_ADMIN_USERNAME}" was created with the password: ${generated}`);
    console.log('Sign in with it and choose a new password right away; the password is in this log only.');
    return 'fallback';
  }
  if (password.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  if (await findUserByUsername(db, username)) return 'exists';
  await insertUser(db, { username, passwordHash: hashPassword(password), role: 'admin', displayName: 'مدیر', coachId: null, mustChangePassword: false, now });
  return 'created';
}

/** True when the database already has an admin account. */
async function hasAdmin(db: Db): Promise<boolean> {
  const rows = await db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'");
  return Number(rows[0]?.count ?? 0) > 0;
}
