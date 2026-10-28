import { createHmac } from 'node:crypto';
import type { Db } from './db.ts';
import { hashPassword } from './auth.ts';
import { HttpError, requireObject, requireText } from './http.ts';
import { insertUser } from './users.ts';
import { requireMobile } from './phone.ts';
import type { SecretKey } from './secrets.ts';

const WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_LIMIT = 100;

/** Add independent students without changing any existing account, programme or purchase. */
export async function migrateRegistration(db: Db): Promise<void> {
  await db.exec(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS self_registered INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_approval INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_access INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_access_version INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT;
    DO $migration$
    DECLARE old_check RECORD;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'users_coach_role_check') THEN
        ALTER TABLE users ADD CONSTRAINT users_coach_role_check CHECK (role = 'student' OR coach_id IS NULL);
      END IF;
      -- The old constraint required every student to have a coach. Leave unrelated checks alone.
      FOR old_check IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'users'::regclass AND contype = 'c'
          AND regexp_replace(pg_get_constraintdef(oid), '[()[:space:]]', '', 'g') = 'CHECKrole=''student''::text=coach_idISNOTNULL'
      LOOP
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', old_check.conname);
      END LOOP;
    END $migration$;
    CREATE TABLE IF NOT EXISTS registration_attempts (
      bucket TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS registration_attempts_expiry ON registration_attempts(expires_at);
    CREATE TABLE IF NOT EXISTS coach_invitations (
      token_hash TEXT PRIMARY KEY,
      coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      consumed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS coach_invitations_coach ON coach_invitations(coach_id, expires_at);
  `);
}

/** Fixed-window limits live in PostgreSQL, so a restart or a second instance does not reset them. */
export async function limitRegistration(db: Db, key: SecretKey, address: string, now: Date, perSourceLimit = 30): Promise<void> {
  const timestamp = now.toISOString();
  const expires = new Date(now.getTime() + WINDOW_MS).toISOString();
  // Store no raw IP. Behind a proxy the socket may represent multiple visitors; it is intentionally
  // conservative until the actual proxy chain is configured and verified. Never trust client XFF.
  const source = createHmac('sha256', key).update(`registration:${address}`).digest('hex');
  await db.query('DELETE FROM registration_attempts WHERE expires_at <= $1', [timestamp]);
  for (const [bucket, limit] of [[`source:${source}`, perSourceLimit], ['global', GLOBAL_LIMIT]] as const) {
    const rows = await db.query(
      `INSERT INTO registration_attempts (bucket, attempts, expires_at) VALUES ($1, 1, $2)
       ON CONFLICT (bucket) DO UPDATE SET attempts = registration_attempts.attempts + 1
       WHERE registration_attempts.attempts < $3
       RETURNING attempts`,
      [bucket, expires, limit],
    );
    if (!rows.length) throw new HttpError(429, 'تعداد درخواست‌های ثبت‌نام زیاد است. چند دقیقه بعد دوباره تلاش کنید.');
  }
}

/** A student starts independent; a self-registered coach needs admin approval before sign-in. */
export async function registerAccount(db: Db, body: unknown, now: Date): Promise<{ username: string; pendingApproval: boolean }> {
  const input = requireObject(body);
  if (input.role !== 'student' && input.role !== 'coach') throw new HttpError(400, 'نوع حساب را انتخاب کنید.');
  if (input.dataNoticeAccepted !== true) throw new HttpError(400, 'برای ادامه، توضیح مربوط به ذخیرهٔ اطلاعات را بخوانید و تأیید کنید.');
  const displayName = requireText(input, 'displayName', 2, 60, 'نام');
  if (/[\u0000-\u001f\u007f]/.test(displayName)) throw new HttpError(400, 'نام شامل نویسهٔ نامعتبر است.');
  const phoneNumber = requireMobile(input.phoneNumber);
  const username = requireText(input, 'username', 3, 32, 'نام کاربری').toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    throw new HttpError(400, 'نام کاربری باید با حروف انگلیسی کوچک یا عدد شروع شود و فقط حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط داشته باشد.');
  }
  const password = requireText(input, 'password', 10, 128, 'رمز عبور');
  if (password.toLowerCase() === username) throw new HttpError(400, 'رمز عبور باید با نام کاربری متفاوت باشد.');
  if ((await db.query('SELECT 1 FROM users WHERE lower(username) = $1 LIMIT 1', [username])).length) {
    throw new HttpError(409, 'این نام کاربری قابل استفاده نیست. اگر قبلاً حساب ساخته‌اید، وارد شوید.');
  }
  const pendingApproval = input.role === 'coach';
  try {
    await insertUser(db, {
      username, passwordHash: hashPassword(password), role: input.role, displayName, phoneNumber,
      coachId: null, mustChangePassword: false, selfRegistered: true,
      isActive: !pendingApproval, pendingApproval, now,
    });
  } catch (error) {
    if ((error as { code?: string })?.code === '23505') {
      throw new HttpError(409, 'این نام کاربری قابل استفاده نیست. اگر قبلاً حساب ساخته‌اید، وارد شوید.');
    }
    throw error;
  }
  return { username, pendingApproval };
}
