import type { Db } from './db.ts';
import { HttpError, requireObject } from './http.ts';

export interface StudentProfile {
  age: number;
  sex: string;
  heightCm: number;
  weightKg: number;
  primaryGoal: string;
  secondaryGoal: string;
  trainingExperience: string;
  trainingDays: number;
  sessionMinutes: number;
  dailyActivity: string;
  sleepHours: string;
  stressLevel: number;
  injuries: string;
  equipment: string;
  workingWeightReferences: { label: string; weightKg: number; note: string }[];
}

export interface StoredStudentProfile {
  profile: StudentProfile;
  shareWithCoach: boolean;
  updatedAt: string;
}

const stringValue = (value: unknown, max: number): string => {
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, 'متن پروفایل معتبر نیست.');
  return value;
};
const optionalNumber = (value: unknown, min: number, max: number): number => value === 0 ? 0 : numberValue(value, min, max);
const numberValue = (value: unknown, min: number, max: number): number => {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new HttpError(400, 'اطلاعات پروفایل معتبر نیست.');
  return parsed;
};

export async function migrateStudentProfiles(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS student_profiles (
      student_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      share_with_coach INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
}

export function validateStudentProfile(raw: unknown): StudentProfile {
  const input = requireObject(raw);
  const profile = (input.profile && typeof input.profile === 'object' ? input.profile : null) as Record<string, unknown> | null;
  if (!profile) throw new HttpError(400, 'پروفایل ارسال نشده است.');
  const references = profile.workingWeightReferences === undefined ? [] : profile.workingWeightReferences;
  if (!Array.isArray(references) || references.length > 100) throw new HttpError(400, 'فهرست وزنه‌های کاری نامعتبر است.');
  return {
    age: optionalNumber(profile.age, 13, 100),
    sex: stringValue(profile.sex, 5000),
    heightCm: optionalNumber(profile.heightCm, 100, 250),
    weightKg: optionalNumber(profile.weightKg, 30, 300),
    primaryGoal: stringValue(profile.primaryGoal, 5000),
    secondaryGoal: stringValue(profile.secondaryGoal, 5000),
    trainingExperience: stringValue(profile.trainingExperience, 5000),
    trainingDays: numberValue(profile.trainingDays, 0, 7),
    sessionMinutes: optionalNumber(profile.sessionMinutes, 15, 240),
    dailyActivity: stringValue(profile.dailyActivity, 5000),
    sleepHours: stringValue(profile.sleepHours, 5000),
    stressLevel: numberValue(profile.stressLevel, 0, 10),
    injuries: stringValue(profile.injuries, 5000),
    equipment: stringValue(profile.equipment, 5000),
    workingWeightReferences: references.map((rawReference) => {
      const reference = rawReference && typeof rawReference === 'object' ? rawReference as Record<string, unknown> : {};
      return {
        label: stringValue(reference.label, 200),
        weightKg: numberValue(reference.weightKg, 0, 1000),
        note: stringValue(reference.note, 1000),
      };
    }),
  };
}

/** Enable sharing only after the exact local profile has reached the versioned account store. */
export async function saveStudentProfile(db: Db, studentId: number, profile: StudentProfile, shareWithCoach: boolean, at: string, coachAccessVersion: number, expectedSyncedProfile?: unknown, authVersion?: number): Promise<StoredStudentProfile & { sharingVersion: number }> {
  const expected = expectedSyncedProfile === undefined ? null : JSON.stringify(expectedSyncedProfile);
  const rows = shareWithCoach
    ? await db.query<{ student_id: number; sharing_version: number }>(`WITH allowed AS (
        SELECT id FROM users WHERE id = $1 AND coach_id IS NOT NULL AND coach_access = 1 AND coach_access_version = $5
          AND ($7::integer IS NULL OR auth_version = $7) FOR UPDATE
      ), matching_profile AS (
        SELECT p.user_id FROM allowed a JOIN personal_data_records p ON p.user_id = a.id
        WHERE p.kind = 'profile' AND p.item_key = 'main' AND p.deleted = 0 AND p.body::jsonb = $6::jsonb FOR UPDATE OF p
      ), saved AS (
        INSERT INTO student_profiles (student_id, body, share_with_coach, updated_at)
        SELECT id, $2, $3, $4 FROM allowed WHERE $6::text IS NULL OR EXISTS (SELECT 1 FROM matching_profile)
        ON CONFLICT (student_id) DO UPDATE SET body = excluded.body, share_with_coach = excluded.share_with_coach, updated_at = excluded.updated_at
        RETURNING student_id
      ) SELECT student_id, $5::integer AS sharing_version FROM saved`, [studentId, JSON.stringify(profile), 1, at, coachAccessVersion, expected, authVersion ?? null])
    : await db.query<{ student_id: number; sharing_version: number }>(`WITH changed AS (
        UPDATE users SET coach_access_version = coach_access_version + 1
        WHERE id = $1 AND role = 'student' AND coach_access_version = $5
          AND ($6::integer IS NULL OR auth_version = $6) RETURNING id, coach_access_version
      ), saved AS (
        INSERT INTO student_profiles (student_id, body, share_with_coach, updated_at)
        SELECT id, $2, $3, $4 FROM changed
        ON CONFLICT (student_id) DO UPDATE SET body = excluded.body, share_with_coach = excluded.share_with_coach, updated_at = excluded.updated_at
        RETURNING student_id
      ) SELECT saved.student_id, changed.coach_access_version AS sharing_version FROM saved JOIN changed ON saved.student_id = changed.id`,
      [studentId, JSON.stringify(profile), 0, at, coachAccessVersion, authVersion ?? null]);
  if (!rows.length) {
    const current = (await db.query<{ coach_access_version: number; coach_access: number; coach_id: number | null }>('SELECT coach_access_version, coach_access, coach_id FROM users WHERE id = $1', [studentId]))[0];
    if (!current || Number(current.coach_access_version) !== coachAccessVersion || Number(current.coach_access) !== 1 || current.coach_id === null) {
      throw new HttpError(409, 'دسترسی مربی تغییر کرده است؛ صفحه را دوباره باز کنید.');
    }
    throw new HttpError(409, 'همگام‌سازی پروفایل کامل نشده است؛ ابتدا تعارض‌ها را بررسی و دوباره تلاش کنید.');
  }
  return { profile, shareWithCoach, updatedAt: at, sharingVersion: Number(rows[0]!.sharing_version) };
}

/** Every revocation advances the access generation, so an old tab cannot turn sharing back on. */
export async function revokeStudentProfileSharing(db: Db, studentId: number, authVersion: number, at: string): Promise<number> {
  const rows = await db.query<{ coach_access_version: string | number }>(`WITH changed AS (
      UPDATE users SET coach_access_version = coach_access_version + 1
      WHERE id = $1 AND role = 'student' AND is_active = 1 AND auth_version = $2 RETURNING coach_access_version
    ), revoked AS (
      UPDATE student_profiles SET share_with_coach = 0, updated_at = $3
      WHERE student_id = $1 AND EXISTS (SELECT 1 FROM changed)
    ) SELECT coach_access_version FROM changed`, [studentId, authVersion, at]);
  if (!rows.length) throw new HttpError(409, 'وضعیت حساب تغییر کرده است؛ صفحه را دوباره باز کنید.');
  return Number(rows[0]!.coach_access_version);
}

export async function setStudentProfileSharing(db: Db, studentId: number, shareWithCoach: boolean, at: string, coachAccessVersion: number, authVersion?: number): Promise<boolean> {
  const rows = shareWithCoach
    ? await db.query<{ student_id: number }>(`WITH allowed AS (
        SELECT id FROM users WHERE id = $3 AND is_active = 1 AND coach_id IS NOT NULL AND coach_access = 1 AND coach_access_version = $4
          AND ($5::integer IS NULL OR auth_version = $5) FOR UPDATE
      ), saved AS (
        UPDATE student_profiles SET share_with_coach = $1, updated_at = $2
        WHERE student_id = $3 AND EXISTS (SELECT 1 FROM allowed)
          AND NOT EXISTS (SELECT 1 FROM personal_data_records p WHERE p.user_id = $3 AND p.kind = 'profile' AND p.item_key = 'main'
            AND (p.deleted = 1 OR p.body::jsonb <> student_profiles.body::jsonb))
        RETURNING student_id
      ) SELECT student_id FROM saved`, [1, at, studentId, coachAccessVersion, authVersion ?? null])
    : await db.query<{ student_id: number }>(
      `UPDATE student_profiles SET share_with_coach = $1, updated_at = $2 WHERE student_id = $3
       AND EXISTS (SELECT 1 FROM users WHERE id = $3 AND is_active = 1 AND ($4::integer IS NULL OR auth_version = $4)) RETURNING student_id`, [0, at, studentId, authVersion ?? null]);
  if (shareWithCoach && rows.length === 0) {
    const current = (await db.query<{ coach_access_version: number; coach_access: number; auth_version: number; is_active: number }>('SELECT coach_access_version, coach_access, auth_version, is_active FROM users WHERE id = $1', [studentId]))[0];
    if (!current || Number(current.coach_access_version) !== coachAccessVersion || Number(current.coach_access) !== 1 || Number(current.is_active) !== 1 || (authVersion !== undefined && Number(current.auth_version) !== authVersion)) throw new HttpError(409, 'دسترسی مربی یا وضعیت حساب تغییر کرده است؛ صفحه را دوباره باز کنید.');
    throw new HttpError(400, 'پروفایلی برای همگام‌سازی ثبت نشده است.');
  }
  return rows.length > 0;
}

export async function loadStudentProfile(db: Db, studentId: number): Promise<StoredStudentProfile | null> {
  const row = (await db.query<{ body: string; share_with_coach: number; updated_at: string }>(
    `SELECT CASE WHEN p.deleted = 0 THEN p.body ELSE s.body END AS body, s.share_with_coach,
            CASE WHEN p.deleted = 0 THEN p.updated_at ELSE s.updated_at END AS updated_at
       FROM student_profiles s LEFT JOIN personal_data_records p ON p.user_id = s.student_id AND p.kind = 'profile' AND p.item_key = 'main'
       WHERE s.student_id = $1 AND (p.user_id IS NULL OR p.deleted = 0)`, [studentId],
  ))[0];
  if (!row) return null;
  return { profile: JSON.parse(row.body) as StudentProfile, shareWithCoach: row.share_with_coach === 1, updatedAt: row.updated_at };
}

/** A single snapshot checks relationship and consent before returning only the shared fields. */
export async function loadStudentProfileForCoach(db: Db, studentId: number, coachId: number): Promise<{ studentName: string; profile: StudentProfile | null; shared: boolean; updatedAt: string | null } | null> {
  const row = (await db.query<{ display_name: string; body: string | null; shared: number; updated_at: string | null }>(
    `SELECT u.display_name,
            CASE WHEN s.share_with_coach = 1 AND COALESCE(p.deleted, 0) = 0 THEN s.body ELSE NULL END AS body,
            CASE WHEN s.share_with_coach = 1 AND COALESCE(p.deleted, 0) = 0 THEN 1 ELSE 0 END AS shared,
            CASE WHEN s.share_with_coach = 1 AND COALESCE(p.deleted, 0) = 0 THEN s.updated_at ELSE NULL END AS updated_at
       FROM users u
       LEFT JOIN student_profiles s ON s.student_id = u.id
       LEFT JOIN personal_data_records p ON p.user_id = u.id AND p.kind = 'profile' AND p.item_key = 'main'
       WHERE u.id = $1 AND u.role = 'student' AND u.coach_id = $2 AND u.coach_access = 1`, [studentId, coachId],
  ))[0];
  if (!row) return null;
  let profile: StudentProfile | null = null;
  if (row.body !== null) {
    const value = JSON.parse(row.body) as Record<string, unknown>;
    const fields = ['age', 'sex', 'heightCm', 'weightKg', 'primaryGoal', 'secondaryGoal', 'trainingExperience', 'trainingDays', 'sessionMinutes', 'dailyActivity', 'sleepHours', 'stressLevel', 'injuries', 'equipment'] as const;
    const projected: Record<string, unknown> = Object.fromEntries(fields.map((key) => [key, value[key]]));
    projected.workingWeightReferences = Array.isArray(value.workingWeightReferences)
      ? value.workingWeightReferences.map((reference: Record<string, unknown>) => ({ label: reference.label, weightKg: reference.weightKg, note: reference.note }))
      : [];
    profile = projected as unknown as StudentProfile;
  }
  return { studentName: row.display_name, profile, shared: Number(row.shared) === 1, updatedAt: row.updated_at };
}
