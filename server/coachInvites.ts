import { createHmac, randomBytes } from 'node:crypto';
import type { Db } from './db.ts';
import { HttpError, requireObject, requireText } from './http.ts';
import type { SecretKey } from './secrets.ts';
import { findUserById, type StoredUser } from './users.ts';

const LIFETIME_MS = 48 * 60 * 60 * 1000;
const INVITE_ERROR = 'کد دعوت نامعتبر، منقضی یا قبلاً استفاده شده است.';

function codeHash(key: SecretKey, code: string): string {
  return createHmac('sha256', key).update(`coach-invite:${code}`).digest('hex');
}

function readCode(body: unknown, studentId: number): string {
  const input = requireObject(body);
  if (input.accountId !== studentId) throw new HttpError(409, 'حساب تغییر کرده است؛ صفحه را دوباره باز کنید.');
  const code = requireText(input, 'code', 32, 32, 'کد دعوت');
  if (!/^[A-Za-z0-9_-]{32}$/.test(code)) throw new HttpError(400, INVITE_ERROR);
  return code;
}

async function throttle(db: Db, bucket: string, now: Date, maximum: number): Promise<void> {
  const at = now.toISOString();
  const expires = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  await db.query('DELETE FROM registration_attempts WHERE expires_at <= $1', [at]);
  const rows = await db.query(`INSERT INTO registration_attempts(bucket, attempts, expires_at) VALUES($1, 1, $2)
    ON CONFLICT(bucket) DO UPDATE SET attempts = registration_attempts.attempts + 1
    WHERE registration_attempts.attempts < $3 RETURNING attempts`, [bucket, expires, maximum]);
  if (!rows.length) throw new HttpError(429, 'تعداد درخواست‌های کد دعوت زیاد است. چند دقیقه بعد دوباره تلاش کنید.');
}

/** One code is a secret valid for one student and at most 48 hours; only its digest is stored. */
export async function makeCoachInvitation(db: Db, key: SecretKey, coach: StoredUser, now: Date): Promise<{ code: string; expiresAt: string }> {
  await throttle(db, `coach-invite-create:${coach.id}`, now, 20);
  await db.query('DELETE FROM coach_invitations WHERE expires_at <= $1', [now.toISOString()]);
  const code = randomBytes(24).toString('base64url');
  const expiresAt = new Date(now.getTime() + LIFETIME_MS).toISOString();
  const rows = await db.query(`INSERT INTO coach_invitations(token_hash, coach_id, created_at, expires_at)
    SELECT $1, id, $3, $4 FROM users WHERE id = $2 AND role = 'coach' AND is_active = 1 AND auth_version = $5
      AND (SELECT count(*) FROM coach_invitations WHERE coach_id = $2 AND consumed_at IS NULL AND expires_at > $3) < 20
    RETURNING coach_id`, [codeHash(key, code), coach.id, now.toISOString(), expiresAt, coach.authVersion]);
  if (!rows.length) throw new HttpError(409, 'ساخت کد انجام نشد. وضعیت حساب یا کدهای فعال را بررسی کنید.');
  return { code, expiresAt };
}

export async function revokeCoachInvitations(db: Db, coach: StoredUser): Promise<void> {
  await db.query('DELETE FROM coach_invitations WHERE coach_id = $1 AND consumed_at IS NULL', [coach.id]);
}

/** Preview reveals the coach only to someone holding the complete secret. */
export async function previewCoachInvitation(db: Db, key: SecretKey, student: StoredUser, body: unknown, now: Date): Promise<{ coachName: string; expiresAt: string }> {
  if (!student.selfRegistered) throw new HttpError(403, 'این مسیر فقط برای حسابی است که شاگرد خودش ساخته است.');
  if (student.coachId !== null && student.coachAccess) throw new HttpError(409, 'این حساب هم‌اکنون به مربی متصل است.');
  await throttle(db, `coach-invite-check:${student.id}`, now, 20);
  const code = readCode(body, student.id);
  const row = (await db.query<{ coach_id: number; display_name: string; expires_at: string }>(`
    SELECT c.id AS coach_id, c.display_name, i.expires_at FROM coach_invitations i
    JOIN users c ON c.id = i.coach_id
    WHERE i.token_hash = $1 AND i.consumed_at IS NULL AND i.expires_at > $2 AND c.role = 'coach' AND c.is_active = 1
  `, [codeHash(key, code), now.toISOString()]))[0];
  if (!row) throw new HttpError(400, INVITE_ERROR);
  return { coachName: row.display_name, expiresAt: row.expires_at };
}

/** Lock the invitation and update the student in the same statement; concurrent accepts cannot share a code. */
export async function acceptCoachInvitation(db: Db, key: SecretKey, student: StoredUser, body: unknown, now: Date): Promise<StoredUser> {
  const input = requireObject(body);
  if (input.consent !== true) throw new HttpError(400, 'برای اتصال، توضیح دسترسی مربی را بخوانید و تأیید کنید.');
  if (!student.selfRegistered) throw new HttpError(403, 'این مسیر فقط برای حسابی است که شاگرد خودش ساخته است.');
  await throttle(db, `coach-invite-accept:${student.id}`, now, 20);
  const code = readCode(body, student.id);
  const rows = await db.query<{ id: number }>(`
    WITH candidate AS MATERIALIZED (
      SELECT i.token_hash, i.coach_id FROM coach_invitations i JOIN users c ON c.id = i.coach_id
      WHERE i.token_hash = $1 AND i.consumed_at IS NULL AND i.expires_at > $4
        AND c.role = 'coach' AND c.is_active = 1
      FOR UPDATE OF i, c
    ), attached AS (
      UPDATE users s SET coach_id = candidate.coach_id, coach_access = 1, personal_program_mode = 0,
        coach_access_version = s.coach_access_version + 1 FROM candidate
      WHERE s.id = $2 AND s.role = 'student' AND s.self_registered = 1 AND s.is_active = 1 AND s.auth_version = $3
        AND s.coach_access_version = $5 AND s.session_guard_version = $6 AND (s.coach_id IS NULL OR s.coach_access = 0)
        AND NOT EXISTS (SELECT 1 FROM personal_data_records d WHERE d.user_id = s.id AND d.kind = 'session' AND d.deleted = 0 AND d.body::jsonb ->> 'status' = 'active')
      RETURNING s.id
    ), preserve_offer AS (
      INSERT INTO programme_offers (id, student_id, coach_id, body, price_tomans, created_at, updated_at)
      SELECT sp.programme_id, sp.student_id, sp.coach_id, sp.body, COALESCE(sp.price_tomans, 0), sp.updated_at, sp.updated_at
      FROM student_programs sp JOIN attached ON attached.id = sp.student_id
      WHERE sp.programme_id IS NOT NULL
      ON CONFLICT (id) DO NOTHING
    ), consumed AS (
      UPDATE coach_invitations SET consumed_at = $4, consumed_by = $2
      WHERE token_hash = $1 AND EXISTS (SELECT 1 FROM attached) RETURNING token_hash
    ) SELECT attached.id FROM attached CROSS JOIN consumed
  `, [codeHash(key, code), student.id, student.authVersion, now.toISOString(), student.coachAccessVersion, student.sessionGuardVersion]);
  if (!rows.length) {
    const active = await db.query("SELECT 1 FROM personal_data_records WHERE user_id = $1 AND kind = 'session' AND deleted = 0 AND body::jsonb ->> 'status' = 'active' LIMIT 1", [student.id]);
    if (active.length) throw new HttpError(409, 'یک تمرین فعال همگام‌شده وجود دارد. ابتدا آن را تمام و همگام کن، سپس دوباره اتصال را تأیید کن.');
    throw new HttpError(409, 'اتصال انجام نشد؛ کد یا وضعیت حساب تغییر کرده است. دوباره بررسی کنید.');
  }
  return (await findUserById(db, student.id))!;
}

/** The current paid programme and ledger remain untouched when the student withdraws access. */
export async function withdrawCoachAccess(db: Db, student: StoredUser, body: unknown): Promise<StoredUser> {
  const input = requireObject(body);
  if (input.accountId !== student.id) throw new HttpError(409, 'حساب تغییر کرده است؛ صفحه را دوباره باز کنید.');
  if (!student.selfRegistered || student.coachId === null) throw new HttpError(409, 'این حساب اتصال قابل قطع ندارد.');
  const rows = await db.query<{ id: number }>(`
    WITH withdrawn AS (
      UPDATE users SET coach_access = 0, coach_access_version = coach_access_version + 1
      WHERE id = $1 AND role = 'student' AND self_registered = 1 AND is_active = 1 AND auth_version = $2
        AND coach_id = $3 AND coach_access = 1 AND coach_access_version = $4
      RETURNING id
    ), profile AS (
      UPDATE student_profiles SET share_with_coach = 0 WHERE student_id = $1 AND EXISTS (SELECT 1 FROM withdrawn)
    ) SELECT id FROM withdrawn
  `, [student.id, student.authVersion, student.coachId, student.coachAccessVersion]);
  if (!rows.length) throw new HttpError(409, 'وضعیت حساب تغییر کرده است؛ صفحه را دوباره باز کنید.');
  return (await findUserById(db, student.id))!;
}

/** Access can be withdrawn immediately; switching programmes is a separate, workout-safe action. */
export async function returnToPersonalProgram(db: Db, student: StoredUser, body: unknown): Promise<StoredUser> {
  const input = requireObject(body);
  if (input.accountId !== student.id) throw new HttpError(409, 'حساب تغییر کرده است؛ صفحه را دوباره باز کنید.');
  if (!student.selfRegistered || student.coachId === null || student.coachAccess) {
    throw new HttpError(409, 'ابتدا دسترسی مربی را قطع کنید.');
  }
  const rows = await db.query<{ id: number }>(`
    WITH switched AS (
      UPDATE users s SET personal_program_mode = 1, coach_access_version = coach_access_version + 1
      WHERE s.id = $1 AND s.role = 'student' AND s.self_registered = 1 AND s.is_active = 1 AND s.auth_version = $2
        AND s.coach_id = $3 AND s.coach_access = 0 AND s.coach_access_version = $4 AND s.session_guard_version = $5
        AND NOT EXISTS (SELECT 1 FROM personal_data_records d WHERE d.user_id = s.id AND d.kind = 'session'
          AND d.deleted = 0 AND d.body::jsonb ->> 'status' = 'active')
      RETURNING s.id
    ), preserve_offer AS (
      INSERT INTO programme_offers (id, student_id, coach_id, body, price_tomans, created_at, updated_at)
      SELECT sp.programme_id, sp.student_id, sp.coach_id, sp.body, COALESCE(sp.price_tomans, 0), sp.updated_at, sp.updated_at
      FROM student_programs sp JOIN switched ON switched.id = sp.student_id
      WHERE sp.programme_id IS NOT NULL ON CONFLICT (id) DO NOTHING
    ) SELECT id FROM switched
  `, [student.id, student.authVersion, student.coachId, student.coachAccessVersion, student.sessionGuardVersion]);
  if (!rows.length) {
    const active = await db.query("SELECT 1 FROM personal_data_records WHERE user_id = $1 AND kind = 'session' AND deleted = 0 AND body::jsonb ->> 'status' = 'active' LIMIT 1", [student.id]);
    if (active.length) throw new HttpError(409, 'یک تمرین فعال همگام‌شده وجود دارد. ابتدا آن را تمام و همگام کن.');
    throw new HttpError(409, 'وضعیت حساب تغییر کرده است؛ صفحه را دوباره باز کنید.');
  }
  return (await findUserById(db, student.id))!;
}
