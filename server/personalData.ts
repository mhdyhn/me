import type { Db } from './db.ts';
import { HttpError, requireObject } from './http.ts';
import { PERSONAL_KINDS, type PersonalChange, type PersonalChangeResult, type PersonalKind, type PersonalRecord } from '../shared/personalData.ts';

const collectionKinds = new Set<PersonalKind>(['session', 'bodyweight', 'nutritionDay']);
const keyPattern = /^[a-zA-Z0-9._-]{1,120}$/;
const operationPattern = /^[a-zA-Z0-9._-]{8,120}$/;
const limitBytes = 200 * 1024;
const text = (value: unknown, max = 1000): value is string => typeof value === 'string' && value.length <= max;
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const date = (value: unknown): boolean => text(value, 50) && !Number.isNaN(Date.parse(value));
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export async function migratePersonalData(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS personal_data_records (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      item_key TEXT NOT NULL,
      version BIGINT NOT NULL,
      body TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      last_operation_id TEXT NOT NULL,
      PRIMARY KEY (user_id, kind, item_key)
    );
    INSERT INTO personal_data_records (user_id, kind, item_key, version, body, deleted, updated_at, last_operation_id)
      SELECT user_id, 'program', 'main', 1, body, 0, updated_at, 'legacy-program-migration' FROM user_personal_programs
      ON CONFLICT (user_id, kind, item_key) DO NOTHING;
    INSERT INTO personal_data_records (user_id, kind, item_key, version, body, deleted, updated_at, last_operation_id)
      SELECT student_id, 'profile', 'main', 1, body, 0, updated_at, 'legacy-profile-migration' FROM student_profiles
      ON CONFLICT (user_id, kind, item_key) DO NOTHING;
  `);
}

function validProgram(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 40 && value.every((day) => object(day) && text(day.id, 120) && text(day.name, 200) && text(day.focus, 300) && text(day.dayLabel, 200) && number(day.durationMinutes) && text(day.description, 2000) && Array.isArray(day.exercises) && day.exercises.length <= 100 && day.exercises.every((ex: unknown) => object(ex) && text(ex.exerciseId, 120) && text(ex.name, 200) && object(ex.prescription) && number(ex.prescription.sets) && number(ex.prescription.minReps) && number(ex.prescription.maxReps) && number(ex.prescription.restSeconds)));
}

function validateValue(kind: PersonalKind, key: string, value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8') > limitBytes) throw new HttpError(413, 'اطلاعات این مورد بیش از حد بزرگ است.');
  if (kind === 'program') {
    if (!validProgram(value)) throw new HttpError(400, 'ساختار برنامهٔ شخصی نامعتبر است.');
    return;
  }
  if (kind === 'jointConcerns') {
    if (!Array.isArray(value) || value.length > 20 || value.some((entry) => !['knees', 'shoulders', 'lowerBack', 'neck', 'wristsElbows'].includes(entry))) throw new HttpError(400, 'اطلاعات مفاصل نامعتبر است.');
    return;
  }
  if (kind === 'mindfulLogs') {
    if (!Array.isArray(value) || value.length > 100 || value.some((entry) => !object(entry) || !text(entry.id, 120) || !text(entry.foodName, 500) || !date(entry.timestamp) || !['physical_hunger', 'stress_anxiety', 'boredom_habit', 'social_celebration'].includes(String(entry.trigger)) || !['green', 'yellow', 'red'].includes(String(entry.category)))) throw new HttpError(400, 'یادداشت‌های تغذیه نامعتبرند.');
    return;
  }
  if (!object(value)) throw new HttpError(400, 'ساختار دادهٔ شخصی نامعتبر است.');
  if (kind === 'session') {
    if (value.templateSnapshot !== undefined && (!object(value.templateSnapshot) || value.templateSnapshot.id !== value.templateId || !validProgram([value.templateSnapshot]))) throw new HttpError(400, 'نسخهٔ برنامهٔ جلسه نامعتبر است.');
    if (value.templateReference !== undefined && (!object(value.templateReference) || !text(value.templateReference.programmeId, 80) || !value.templateReference.programmeId || !number(value.templateReference.version) || !Number.isSafeInteger(value.templateReference.version) || value.templateReference.version < 0)) throw new HttpError(400, 'شناسهٔ برنامهٔ جلسه نامعتبر است.');
    if (value.id !== key || !text(value.templateId, 120) || !text(value.name, 200) || !date(value.startedAt) || !['active', 'completed', 'abandoned'].includes(String(value.status)) || !text(value.notes, 5000) || !number(value.currentExerciseIndex) || !number(value.currentSetIndex) || !Array.isArray(value.exercises) || value.exercises.length > 200 || value.exercises.some((ex: unknown) => !object(ex) || !text(ex.exerciseId, 120) || !Array.isArray(ex.sets) || ex.sets.length > 100 || ex.sets.some((set: unknown) => !object(set) || !number(set.setNumber) || !number(set.weightKg) || !number(set.reps) || !number(set.rir) || !date(set.doneAt)))) throw new HttpError(400, 'جلسهٔ تمرین نامعتبر است.');
  } else if (kind === 'bodyweight') {
    if (value.id !== key || !date(value.date) || !number(value.weightKg) || value.weightKg < 30 || value.weightKg > 300 || (value.notes !== undefined && !text(value.notes, 5000))) throw new HttpError(400, 'ثبت وزن نامعتبر است.');
  } else if (kind === 'nutritionDay') {
    if (value.id !== key || !date(value.date) || !text(value.notes, 5000) || ['calories', 'proteinG', 'carbsG', 'fatsG'].some((field) => value[field] !== undefined && !number(value[field]))) throw new HttpError(400, 'یادداشت تغذیه نامعتبر است.');
  } else if (kind === 'profile') {
    if (!number(value.age) || !number(value.heightCm) || !number(value.weightKg) || !number(value.trainingDays) || !number(value.sessionMinutes) || !number(value.stressLevel) || !['sex', 'primaryGoal', 'secondaryGoal', 'trainingExperience', 'dailyActivity', 'sleepHours', 'injuries', 'equipment'].every((field) => text(value[field], 5000)) || !Array.isArray(value.workingWeightReferences) || value.workingWeightReferences.length > 100 || value.workingWeightReferences.some((entry: unknown) => !object(entry) || !text(entry.label, 200) || !number(entry.weightKg) || !text(entry.note, 1000))) throw new HttpError(400, 'پروفایل نامعتبر است.');
  } else if (kind === 'nutritionGoals') {
    if (!number(value.proteinG) || ['dailyCalories', 'carbsG', 'fatsG'].some((field) => value[field] !== undefined && !number(value[field]))) throw new HttpError(400, 'هدف‌های تغذیه نامعتبرند.');
  } else if (kind === 'healthMetrics') {
    if (!number(value.sleepHours) || !number(value.sleepQualityScore) || !number(value.restingHeartRate) || !number(value.heartRateVariability) || !['manual', 'whoop', 'oura', 'apple_health'].includes(String(value.source)) || !date(value.lastSyncedAt)) throw new HttpError(400, 'اطلاعات سلامت نامعتبر است.');
  }
}

export function validateChange(input: unknown): PersonalChange {
  const change = requireObject(input);
  const kind = PERSONAL_KINDS.find((item) => item === change.kind);
  if (!kind || typeof change.key !== 'string' || !keyPattern.test(change.key) || (!collectionKinds.has(kind) && change.key !== 'main')) throw new HttpError(400, 'نوع یا شناسهٔ دادهٔ شخصی نامعتبر است.');
  if (!Number.isSafeInteger(change.baseVersion) || (change.baseVersion as number) < 0 || typeof change.operationId !== 'string' || !operationPattern.test(change.operationId) || typeof change.deleted !== 'boolean') throw new HttpError(400, 'نسخهٔ همگام‌سازی نامعتبر است.');
  if (!change.deleted) validateValue(kind, change.key, change.value);
  return { kind, key: change.key, baseVersion: change.baseVersion as number, operationId: change.operationId, deleted: change.deleted, value: change.deleted ? null : change.value };
}

interface RecordRow { kind: PersonalKind; item_key: string; version: string | number; deleted: number; body: string | null; updated_at: string; last_operation_id: string }
const fromRow = (row: RecordRow): PersonalRecord => ({ kind: row.kind, key: row.item_key, version: Number(row.version), deleted: Number(row.deleted) === 1, value: row.deleted ? null : JSON.parse(row.body!), updatedAt: row.updated_at });

const PROFILE_TEXT_FIELDS = ['sex', 'primaryGoal', 'secondaryGoal', 'trainingExperience', 'dailyActivity', 'sleepHours', 'injuries', 'equipment'] as const;
const PROFILE_NUMBER_FIELDS = ['age', 'heightCm', 'weightKg', 'trainingDays', 'sessionMinutes', 'stressLevel'] as const;

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
const parseBody = (body: string | null | undefined): Record<string, unknown> => {
  if (!body) return {};
  try { return asRecord(JSON.parse(body)); } catch { return {}; }
};
const trimmed = (value: unknown): string => String(value ?? '').trim();
const finite = (value: unknown): number => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };

/** One comparable shape for a profile, so two records match only when their values match. */
export function profileSignature(value: unknown): string {
  const source = asRecord(value);
  const text = PROFILE_TEXT_FIELDS.map((field) => `${field}=${trimmed(source[field])}`).join('|');
  const numbers = PROFILE_NUMBER_FIELDS.map((field) => `${field}=${finite(source[field])}`).join('|');
  const references = Array.isArray(source.workingWeightReferences)
    ? source.workingWeightReferences.map((entry) => {
      const item = asRecord(entry);
      return `${trimmed(item.label)}@${finite(item.weightKg)}:${trimmed(item.note)}`;
    }).join(';')
    : '';
  return `${text}||${numbers}||${references}`;
}

/** An empty profile is nobody's data; it is never treated as a copy of the owner's profile. */
export function isMeaningfulProfile(value: unknown): boolean {
  const source = asRecord(value);
  if (PROFILE_NUMBER_FIELDS.some((field) => finite(source[field]) > 0)) return true;
  if (PROFILE_TEXT_FIELDS.some((field) => trimmed(source[field]) !== '')) return true;
  return Array.isArray(source.workingWeightReferences) && source.workingWeightReferences.length > 0;
}

export interface OwnerProfileCopy { userId: number; username: string; displayName: string; role: string }

/**
 * Accounts whose stored profile is a copy of an admin (the owner) profile. The owner's personal
 * data must never live inside somebody else's account.
 */
export async function findOwnerProfileCopies(db: Db): Promise<OwnerProfileCopy[]> {
  const owners = await db.query<{ body: string }>(
    `SELECT p.body FROM personal_data_records p JOIN users u ON u.id = p.user_id
      WHERE p.kind = 'profile' AND p.item_key = 'main' AND p.deleted = 0 AND u.role = 'admin'`, []);
  const ownerSignatures = new Set(owners.map((row) => profileSignature(parseBody(row.body))));
  if (!ownerSignatures.size) return [];
  const rows = await db.query<{ user_id: string | number; username: string; display_name: string; role: string; body: string }>(
    `SELECT p.user_id, u.username, u.display_name, u.role, p.body
       FROM personal_data_records p JOIN users u ON u.id = p.user_id
      WHERE p.kind = 'profile' AND p.item_key = 'main' AND p.deleted = 0 AND u.role <> 'admin'`, []);
  return rows
    .filter((row) => isMeaningfulProfile(parseBody(row.body)) && ownerSignatures.has(profileSignature(parseBody(row.body))))
    .map((row) => ({ userId: Number(row.user_id), username: row.username, displayName: row.display_name, role: row.role }));
}

/** Removes the owner's copy from the other account and revokes the coach's access to it. */
export async function quarantineOwnerProfileCopies(db: Db, at: string): Promise<OwnerProfileCopy[]> {
  const copies = await findOwnerProfileCopies(db);
  for (const copy of copies) {
    await db.query(
      `WITH changed AS (
         UPDATE personal_data_records SET version = version + 1, body = NULL, deleted = 1, updated_at = $2, last_operation_id = 'owner-copy-quarantine'
          WHERE user_id = $1 AND kind = 'profile' AND item_key = 'main' AND deleted = 0 RETURNING user_id
       ), removed AS (
         DELETE FROM student_profiles WHERE student_id = $1 AND EXISTS (SELECT 1 FROM changed)
       ), revoked AS (
         UPDATE users SET coach_access_version = coach_access_version + 1 WHERE id = $1 AND role = 'student' AND EXISTS (SELECT 1 FROM changed)
       ) SELECT user_id FROM changed`, [copy.userId, at]);
  }
  return copies;
}

/** The account owner deletes their own stored profile; the coach keeps no copy of it. */
export async function clearStoredProfile(db: Db, userId: number, at: string): Promise<{ version: number }> {
  const rows = await db.query<{ version: string | number }>(
    `WITH changed AS (
       UPDATE personal_data_records SET version = version + 1, body = NULL, deleted = 1, updated_at = $2, last_operation_id = 'profile-purge'
        WHERE user_id = $1 AND kind = 'profile' AND item_key = 'main' AND deleted = 0 RETURNING version
     ), removed AS (
       DELETE FROM student_profiles WHERE student_id = $1
     ), revoked AS (
       UPDATE users SET coach_access_version = coach_access_version + 1 WHERE id = $1 AND role = 'student'
     )
     SELECT COALESCE((SELECT version FROM changed), (SELECT version FROM personal_data_records WHERE user_id = $1 AND kind = 'profile' AND item_key = 'main')) AS version`,
    [userId, at]);
  return { version: Number(rows[0]?.version ?? 0) };
}

/** A profile that is a copy of the owner's data is refused before it reaches another account. */
export async function assertProfileIsNotOwnerCopy(db: Db, userId: number, value: unknown): Promise<void> {
  if (!isMeaningfulProfile(value)) return;
  const writers = await db.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
  if (writers[0]?.role === 'admin') return;
  const owners = await db.query<{ body: string }>(
    `SELECT p.body FROM personal_data_records p JOIN users u ON u.id = p.user_id
      WHERE p.kind = 'profile' AND p.item_key = 'main' AND p.deleted = 0 AND u.role = 'admin'`, []);
  const signature = profileSignature(value);
  if (owners.some((row) => profileSignature(parseBody(row.body)) === signature)) {
    throw new HttpError(409, 'این پروفایل با اطلاعات شخصی حساب مالک یکسان است؛ دادهٔ حساب دیگر در حساب تو ذخیره نمی‌شود.');
  }
}

export async function getPersonalRecord(db: Db, userId: number, kind: PersonalKind, key: string): Promise<PersonalRecord | null> {
  const rows = await db.query<RecordRow>('SELECT kind, item_key, version, body, deleted, updated_at, last_operation_id FROM personal_data_records WHERE user_id = $1 AND kind = $2 AND item_key = $3', [userId, kind, key]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function listPersonalRecords(db: Db, userId: number, cursor: string | null): Promise<{ records: PersonalRecord[]; nextCursor: string | null }> {
  let afterKind = ''; let afterKey = '';
  if (cursor) {
    const parts = cursor.split('~');
    if (parts.length !== 2 || !PERSONAL_KINDS.includes(parts[0] as PersonalKind) || !keyPattern.test(parts[1]!)) throw new HttpError(400, 'نشانگر صفحه نامعتبر است.');
    [afterKind, afterKey] = parts as [string, string];
  }
  const pageSize = 100;
  const rows = await db.query<RecordRow>(
    `SELECT kind, item_key, version, body, deleted, updated_at, last_operation_id FROM personal_data_records
     WHERE user_id = $1 AND (kind > $2 OR (kind = $2 AND item_key > $3)) ORDER BY kind, item_key LIMIT $4`,
    [userId, afterKind, afterKey, pageSize + 1],
  );
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  return { records: page.map(fromRow), nextCursor: rows.length > pageSize && last ? `${last.kind}~${last.item_key}` : null };
}

export async function applyPersonalChange(db: Db, userId: number, change: PersonalChange, at: string): Promise<PersonalChangeResult> {
  // The owner's personal data may not be stored inside another account.
  if (change.kind === 'profile' && !change.deleted) await assertProfileIsNotOwnerCopy(db, userId, change.value);
  const params = [userId, change.kind, change.key, change.deleted ? null : JSON.stringify(change.value), change.deleted ? 1 : 0, at, change.operationId, change.baseVersion];
  const select = 'kind, item_key, version, body, deleted, updated_at, last_operation_id';
  // Compare-and-swap is atomic. A stale device cannot overwrite a newer version.
  const session = change.kind === 'session';
  const profileDeletion = change.kind === 'profile' && change.deleted;
  const locksUser = session || profileDeletion;
  const write = change.baseVersion === 0
    ? `INSERT INTO personal_data_records (user_id, kind, item_key, version, body, deleted, updated_at, last_operation_id)
       ${locksUser ? 'SELECT $1, $2, $3, 1, $4, $5, $6, $7 FROM user_lock' : 'VALUES ($1, $2, $3, 1, $4, $5, $6, $7)'}
       ON CONFLICT (user_id, kind, item_key) DO NOTHING RETURNING ${select}`
    : `UPDATE personal_data_records SET version = version + 1, body = $4, deleted = $5, updated_at = $6, last_operation_id = $7
       WHERE user_id = $1 AND kind = $2 AND item_key = $3 AND version = $8 ${locksUser ? 'AND EXISTS (SELECT 1 FROM user_lock)' : ''} RETURNING ${select}`;
  const writeParams = change.baseVersion === 0 ? params.slice(0, 7) : params;
  // A relationship switch that races a session write must see a changed user row, not a stale snapshot.
  const statement = session
    ? `WITH user_lock AS MATERIALIZED (SELECT id FROM users WHERE id = $1 FOR UPDATE), written AS (${write}), bumped AS (
         UPDATE users SET session_guard_version = session_guard_version + 1 WHERE id = $1 AND EXISTS (SELECT 1 FROM written)
       ) SELECT * FROM written`
    // Deleting a shared profile also revokes consent atomically; recreating it must not silently re-share it.
    : profileDeletion
      ? `WITH user_lock AS MATERIALIZED (SELECT id FROM users WHERE id = $1 FOR UPDATE), written AS (${write}), revoked AS (
           UPDATE student_profiles SET share_with_coach = 0 WHERE student_id = $1 AND EXISTS (SELECT 1 FROM written)
         ), bumped AS (
           UPDATE users SET coach_access_version = coach_access_version + 1 WHERE id = $1 AND role = 'student' AND EXISTS (SELECT 1 FROM written)
         ) SELECT * FROM written`
      : write;
  const rows = await db.query<RecordRow>(statement, writeParams);
  if (rows[0]) return { kind: change.kind, key: change.key, status: 'saved', current: fromRow(rows[0]) };
  const currentRows = await db.query<RecordRow>('SELECT kind, item_key, version, body, deleted, updated_at, last_operation_id FROM personal_data_records WHERE user_id = $1 AND kind = $2 AND item_key = $3', [userId, change.kind, change.key]);
  const row = currentRows[0];
  return { kind: change.kind, key: change.key, status: row?.last_operation_id === change.operationId && Number(row.deleted) === (change.deleted ? 1 : 0) && row.body === (change.deleted ? null : JSON.stringify(change.value)) ? 'saved' : 'conflict', current: row ? fromRow(row) : null };
}
