import { randomUUID } from 'node:crypto';
import type { Db } from './db.ts';
import { paidTransactionCondition } from './payments.ts';
import { studentTestPurchasesAvailable } from './testPurchases.ts';
import { HttpError, requireObject, requireText } from './http.ts';
import { isValidReps, normalizeReps } from '../shared/repetitions.ts';
import type { StoredUser } from './users.ts';
export { normalizeReps } from '../shared/repetitions.ts';

export interface ProgramItem {
  exerciseId: string;
  name: string;
  muscle: string;
  sets: number;
  reps: string;
  restSeconds: number;
}

export interface ProgramDay {
  name: string;
  exercises: ProgramItem[];
}

export interface ProgrammeInput {
  title: string;
  days: ProgramDay[];
  priceTomans?: number;
}

export interface Programme extends ProgrammeInput {
  id: string;
  version: number;
  updatedAt: string;
  isTestPurchase?: boolean;
  testPurchaseExpiresAt?: string | null;
}

export interface ProgrammeSave {
  mode: 'new' | 'edit';
  expectedId: string | null;
  expectedVersion: number;
}

const MAX_DAYS = 7;
const MAX_EXERCISES_PER_DAY = 15;
const EXERCISE_ID = /^[a-z0-9-]{1,64}$/;
const DAY_NAME_MAX = 80;

/** Checks the coach's programme. Anything the app could not display safely is rejected here. */
export function validateProgramme(input: unknown): ProgrammeInput {
  const body = requireObject(input);
  const title = requireText(body, 'title', 2, 80, 'عنوان برنامه');
  const rawPrice = body.priceTomans;
  if (rawPrice !== undefined && rawPrice !== null &&
      (typeof rawPrice !== 'number' || !Number.isSafeInteger(rawPrice) || rawPrice < 0 || rawPrice > 2147483647)) {
    throw new HttpError(400, 'قیمت برنامه باید عدد صحیح و غیرمنفی و حداکثر ۲٬۱۴۷٬۴۸۳٬۶۴۷ تومان باشد.');
  }
  const priceTomans = typeof rawPrice === 'number' ? rawPrice : 0;
  if (!Array.isArray(body.days) || body.days.length < 1 || body.days.length > MAX_DAYS) {
    throw new HttpError(400, `برنامه باید بین ۱ تا ${MAX_DAYS} روز داشته باشد.`);
  }
  const days = body.days.map((rawDay, dayIndex) => {
    const day = requireObject(rawDay);
    const name = requireText(day, 'name', 1, DAY_NAME_MAX, `نام روز ${dayIndex + 1}`);
    if (!Array.isArray(day.exercises) || day.exercises.length < 1 || day.exercises.length > MAX_EXERCISES_PER_DAY) {
      throw new HttpError(400, `هر روز باید بین ۱ تا ${MAX_EXERCISES_PER_DAY} حرکت داشته باشد.`);
    }
    const exercises = day.exercises.map((rawItem) => {
      const item = requireObject(rawItem);
      if (typeof item.exerciseId !== 'string' || !EXERCISE_ID.test(item.exerciseId)) throw new HttpError(400, 'شناسهٔ حرکت نامعتبر است.');
      const name = requireText(item, 'name', 1, 80, 'نام حرکت');
      const rawMuscle = typeof item.muscle === 'string' && item.muscle.trim() ? item.muscle.trim() : 'عمومی';
      const muscle = rawMuscle.slice(0, 40);
      if (!Number.isInteger(item.sets) || (item.sets as number) < 1 || (item.sets as number) > 10) throw new HttpError(400, 'تعداد ست باید بین ۱ تا ۱۰ باشد.');
      const reps = normalizeReps(typeof item.reps === 'string' ? item.reps : String(item.reps ?? ''));
      if (!isValidReps(reps)) throw new HttpError(400, 'تکرار باید بین ۱ تا ۹۹ و مانند ۸ یا ۸-۱۲ باشد.');
      if (!Number.isInteger(item.restSeconds) || (item.restSeconds as number) < 0 || (item.restSeconds as number) > 600) {
        throw new HttpError(400, 'استراحت باید بین ۰ تا ۶۰۰ ثانیه باشد.');
      }
      return {
        exerciseId: item.exerciseId,
        name,
        muscle,
        sets: item.sets as number,
        reps,
        restSeconds: item.restSeconds as number,
      };
    });
    return { name, exercises };
  });
  return { title, days, priceTomans };
}

/** An unversioned old client may create the first programme, but may not overwrite one. */
export function validateProgrammeSave(input: unknown): ProgrammeSave {
  const body = requireObject(input);
  const mode = body.saveMode ?? 'new';
  const expectedId = body.expectedId ?? null;
  const expectedVersion = body.expectedVersion ?? 0;
  if (mode !== 'new' && mode !== 'edit') throw new HttpError(400, 'نوع ذخیرهٔ برنامه نامعتبر است.');
  if (expectedId !== null && (typeof expectedId !== 'string' || expectedId.length < 1 || expectedId.length > 80)) {
    throw new HttpError(400, 'شناسهٔ برنامه نامعتبر است.');
  }
  if (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 0 || (expectedVersion as number) >= Number.MAX_SAFE_INTEGER) {
    throw new HttpError(400, 'نسخهٔ برنامه نامعتبر است.');
  }
  if (mode === 'edit' && expectedId === null) throw new HttpError(409, 'ابتدا برنامهٔ فعلی را دوباره بارگذاری کنید.');
  return { mode, expectedId: expectedId as string | null, expectedVersion: expectedVersion as number };
}

/** Save the active row and its offer atomically; a stale coach cannot overwrite a newer offer. */
export async function saveProgramme(db: Db, studentId: number, coachId: number, programme: ProgrammeInput, options: ProgrammeSave, now: Date, relationshipVersion = 0, allowRevoked = false): Promise<Programme> {
  const updatedAt = now.toISOString();
  const priceTomans = programme.priceTomans ?? 0;
  const id = options.mode === 'edit' ? options.expectedId! : randomUUID();
  const rows = await db.query<{ id: string; version: number }>(`
    WITH relationship AS MATERIALIZED (
      SELECT id FROM users WHERE id = $1 AND role = 'student' AND is_active = 1 AND coach_id = $2
        AND coach_access_version = $9 AND (coach_access = 1 OR $10::boolean) FOR UPDATE
    ), updated AS (
      UPDATE student_programs SET body = $3, price_tomans = $4, updated_at = $5,
        programme_id = $6, version = version + 1
      WHERE student_id = $1 AND coach_id = $2 AND programme_id = $7 AND version = $8
        AND EXISTS (SELECT 1 FROM relationship) RETURNING *
    ), inserted AS (
      INSERT INTO student_programs (student_id, coach_id, body, price_tomans, updated_at, programme_id, version)
      SELECT $1, $2, $3, $4, $5, $6, 1 FROM relationship WHERE $7::text IS NULL
      ON CONFLICT (student_id) DO UPDATE SET coach_id = excluded.coach_id, body = excluded.body,
        price_tomans = excluded.price_tomans, updated_at = excluded.updated_at,
        programme_id = excluded.programme_id, version = excluded.version
      WHERE student_programs.coach_id <> excluded.coach_id RETURNING *
    ), saved AS (
      SELECT * FROM updated UNION ALL SELECT * FROM inserted
    ), offered AS (
      INSERT INTO programme_offers (id, student_id, coach_id, body, price_tomans, created_at, updated_at, version)
      SELECT programme_id, student_id, coach_id, body, price_tomans, updated_at, updated_at, version FROM saved
      ON CONFLICT (id) DO UPDATE SET coach_id = excluded.coach_id, body = excluded.body,
        price_tomans = excluded.price_tomans, updated_at = excluded.updated_at, version = excluded.version
      WHERE programme_offers.student_id = excluded.student_id
      RETURNING id
    )
    SELECT saved.programme_id AS id, saved.version FROM saved JOIN offered ON offered.id = saved.programme_id
  `, [studentId, coachId, JSON.stringify({ title: programme.title, days: programme.days }), priceTomans, updatedAt, id, options.expectedId, options.expectedVersion, relationshipVersion, allowRevoked]);
  if (!rows[0]) throw new HttpError(409, 'برنامه تغییر کرده است؛ صفحه را دوباره بارگذاری و نوع ذخیره را انتخاب کنید.');
  return { ...programme, id: rows[0].id, version: Number(rows[0].version), priceTomans, updatedAt };
}

export async function loadProgramme(db: Db, studentId: number, coachId?: number): Promise<Programme | null> {
  const row = (await db.query<{ body: string; price_tomans: number | null; updated_at: string; programme_id: string; version: number }>(
    'SELECT body, price_tomans, updated_at, programme_id, version FROM student_programs WHERE student_id = $1 AND ($2::integer IS NULL OR coach_id = $2)',
    [studentId, coachId ?? null]
  ))[0];
  if (!row) return null;
  const parsed = JSON.parse(row.body) as ProgrammeInput;
  return { ...parsed, id: row.programme_id, version: Number(row.version), priceTomans: row.price_tomans ?? 0, updatedAt: row.updated_at };
}

/** Read the active offer and its entitlements in one consistent database snapshot. */
export async function studentProgrammeView(db: Db, user: StoredUser, now: Date): Promise<{
  program: Programme | null;
  coachName: string | null;
  isPaid: boolean;
  isTestPurchase?: boolean;
  testPurchaseAvailable?: boolean;
  testPurchaseExpiresAt?: string | null;
}> {
  if (user.coachId === null || user.personalProgramMode) return { program: null, coachName: null, isPaid: true };
  const row = (await db.query<{
    coach_name: string | null;
    body: string | null;
    price_tomans: number | null;
    updated_at: string | null;
    programme_id: string | null;
    version: string | number | null;
    has_paid: boolean;
    test_status: 'allowed' | 'pending' | 'paid' | 'canceled' | null;
    test_expires_at: string | null;
    mode_expires_at: string | null;
  }>(`
    SELECT c.display_name AS coach_name, sp.body, sp.price_tomans, sp.updated_at, sp.programme_id, sp.version,
      EXISTS (SELECT 1 FROM payment_transactions t
        WHERE t.student_id = s.id AND t.programme_id = sp.programme_id AND ${paidTransactionCondition('t', '$3')}) AS has_paid,
      p.status AS test_status, p.expires_at AS test_expires_at,
      CASE WHEN m.token IS NOT NULL AND m.expires_at > $4 THEN m.expires_at ELSE NULL END AS mode_expires_at
    FROM users s
    LEFT JOIN users c ON c.id = s.coach_id
    LEFT JOIN student_programs sp ON sp.student_id = s.id AND sp.coach_id = s.coach_id
    LEFT JOIN payment_test_mode m ON m.id = 1 AND $5::boolean
    LEFT JOIN payment_test_purchases p ON m.id = 1 AND p.student_id = s.id
      AND p.programme_id = sp.programme_id AND p.expires_at > $4
      AND (p.mode_token IS NULL OR (p.mode_token = m.token AND m.expires_at > $4))
    WHERE s.id = $1 AND s.role = 'student' AND s.is_active = 1 AND s.coach_id = $2
      AND s.personal_program_mode = 0 AND s.auth_version = $6 AND s.coach_access_version = $7
  `, [user.id, user.coachId, process.env.NODE_ENV === 'production' ? 1 : 0, now.toISOString(), studentTestPurchasesAvailable(), user.authVersion, user.coachAccessVersion]))[0];
  if (!row) throw new HttpError(409, 'حساب یا ارتباط با مربی تغییر کرده است؛ دوباره تلاش کنید.');
  if (row.body === null) return { program: null, coachName: row.coach_name, isPaid: true };
  const parsed = JSON.parse(row.body) as ProgrammeInput;
  const program: Programme = {
    ...parsed, id: row.programme_id!, version: Number(row.version), priceTomans: row.price_tomans ?? 0, updatedAt: row.updated_at!,
  };
  const isPaid = (program.priceTomans ?? 0) === 0 || row.has_paid;
  const isTestPurchase = !isPaid && row.test_status === 'paid';
  if (!isPaid && !isTestPurchase) {
    return {
      program: { id: program.id, version: program.version, title: program.title, days: [], priceTomans: program.priceTomans, updatedAt: program.updatedAt },
      coachName: row.coach_name, isPaid: false,
      testPurchaseAvailable: row.test_status !== null || row.mode_expires_at !== null,
      testPurchaseExpiresAt: row.test_expires_at ?? row.mode_expires_at,
    };
  }
  return {
    program, coachName: row.coach_name, isPaid, isTestPurchase,
    testPurchaseExpiresAt: isTestPurchase ? row.test_expires_at : null,
  };
}

/** Archive is read-only: never expose exercises from another student or an unpaid offer. */
export async function listPurchasedProgrammes(db: Db, studentId: number, cursor: string | null, now = new Date()): Promise<{ programs: Programme[]; nextCursor: string | null }> {
  const rows = await db.query<{ id: string; body: string; price_tomans: number; updated_at: string; paid: boolean; test_expires_at: string | null }>(`
    WITH candidates AS (
      SELECT o.id, o.body, o.price_tomans, o.updated_at,
        EXISTS (SELECT 1 FROM payment_transactions t WHERE t.student_id = o.student_id AND t.programme_id = o.id
          AND ${paidTransactionCondition('t', '$2')}) AS paid,
        CASE WHEN $4::boolean AND (u.personal_program_mode = 1 OR u.coach_id IS DISTINCT FROM o.coach_id)
          AND p.programme_id = o.id AND p.status = 'paid' AND p.expires_at > $5
          AND (p.mode_token IS NULL OR (p.mode_token = m.token AND m.expires_at > $5))
          THEN p.expires_at ELSE NULL END AS test_expires_at
      FROM programme_offers o JOIN users u ON u.id = o.student_id
      LEFT JOIN payment_test_purchases p ON p.student_id = o.student_id
      LEFT JOIN payment_test_mode m ON m.id = 1
      WHERE o.student_id = $1 AND NOT EXISTS (
        SELECT 1 FROM student_programs sp WHERE sp.student_id = o.student_id AND sp.programme_id = o.id
          AND sp.coach_id = u.coach_id AND u.personal_program_mode = 0
      ) AND ($3::text IS NULL OR (o.updated_at, o.id) < (
        SELECT marker.updated_at, marker.id FROM programme_offers marker WHERE marker.student_id = $1 AND marker.id = $3
      ))
    )
    SELECT * FROM candidates WHERE price_tomans = 0 OR paid OR test_expires_at IS NOT NULL
    ORDER BY updated_at DESC, id DESC LIMIT 21
  `, [studentId, process.env.NODE_ENV === 'production' ? 1 : 0, cursor, studentTestPurchasesAvailable(), now.toISOString()]);
  const page = rows.slice(0, 20);
  return {
    programs: page.map((row) => ({
      ...(JSON.parse(row.body) as ProgrammeInput), id: row.id, version: 0, priceTomans: row.price_tomans, updatedAt: row.updated_at,
      ...(row.price_tomans > 0 && !row.paid && row.test_expires_at ? { isTestPurchase: true, testPurchaseExpiresAt: row.test_expires_at } : {}),
    })),
    nextCursor: rows.length > 20 ? page[page.length - 1]!.id : null,
  };
}

/** A coach may view only their own prior offers for this student, even after a transfer. */
export async function listCoachProgrammes(db: Db, studentId: number, coachId: number, cursor: string | null): Promise<{ programs: Programme[]; nextCursor: string | null }> {
  const rows = await db.query<{ id: string; version: number; body: string; price_tomans: number; updated_at: string }>(`
    SELECT o.id, o.version, o.body, o.price_tomans, o.updated_at FROM programme_offers o
    WHERE o.student_id = $1 AND o.coach_id = $2 AND NOT EXISTS (
      SELECT 1 FROM student_programs sp WHERE sp.student_id = o.student_id AND sp.programme_id = o.id
    ) AND ($3::text IS NULL OR (o.updated_at, o.id) < (
      SELECT marker.updated_at, marker.id FROM programme_offers marker
      WHERE marker.student_id = $1 AND marker.coach_id = $2 AND marker.id = $3
    )) ORDER BY o.updated_at DESC, o.id DESC LIMIT 21`, [studentId, coachId, cursor]);
  const page = rows.slice(0, 20);
  return {
    programs: page.map((row) => ({ ...(JSON.parse(row.body) as ProgrammeInput), id: row.id, version: Number(row.version), priceTomans: row.price_tomans, updatedAt: row.updated_at })),
    nextCursor: rows.length > 20 ? page[page.length - 1]!.id : null,
  };
}

/** Reactivating an offer retains its purchase identity and always advances its version. */
export async function restoreCoachProgramme(db: Db, studentId: number, coachId: number, offerId: string, offerVersion: number, expectedId: string | null, expectedVersion: number, now: Date, relationshipVersion: number, allowRevoked = false): Promise<Programme> {
  const rows = await db.query<{ programme_id: string; version: number; body: string; price_tomans: number; updated_at: string }>(`
    WITH relationship AS MATERIALIZED (
      SELECT id FROM users WHERE id = $1 AND role = 'student' AND is_active = 1 AND coach_id = $2
        AND coach_access_version = $8 AND (coach_access = 1 OR $9::boolean) FOR UPDATE
    ), selected AS MATERIALIZED (
      SELECT * FROM programme_offers WHERE student_id = $1 AND coach_id = $2 AND id = $3 AND version = $4
        AND id IS DISTINCT FROM $5::text FOR UPDATE
    ), restored AS (
      INSERT INTO student_programs (student_id, coach_id, body, price_tomans, updated_at, programme_id, version)
      -- Older archived offers did not record their last version. A new epoch cannot match an old 32-bit client.
      SELECT $1, $2, o.body, o.price_tomans, $7, o.id, GREATEST(o.version + 1, 2147483648::bigint) FROM selected o, relationship
      WHERE $5::text IS NULL OR EXISTS (SELECT 1 FROM student_programs sp
        WHERE sp.student_id = $1 AND sp.coach_id = $2 AND sp.programme_id = $5 AND sp.version = $6)
      ON CONFLICT (student_id) DO UPDATE SET coach_id = excluded.coach_id, body = excluded.body,
        price_tomans = excluded.price_tomans, updated_at = excluded.updated_at,
        programme_id = excluded.programme_id, version = excluded.version
      WHERE (student_programs.coach_id = $2 AND student_programs.programme_id = $5 AND student_programs.version = $6)
         OR (student_programs.coach_id <> $2 AND $5::text IS NULL)
      RETURNING *
    ), offered AS (
      UPDATE programme_offers o SET version = r.version, updated_at = r.updated_at
      FROM restored r WHERE o.id = r.programme_id AND o.student_id = r.student_id RETURNING o.id
    )
    SELECT restored.* FROM restored JOIN offered ON offered.id = restored.programme_id`,
    [studentId, coachId, offerId, offerVersion, expectedId, expectedVersion, now.toISOString(), relationshipVersion, allowRevoked]);
  const row = rows[0];
  if (!row) throw new HttpError(409, 'برنامه یا ارتباط مربی تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.');
  return { ...(JSON.parse(row.body) as ProgrammeInput), id: row.programme_id, version: Number(row.version), priceTomans: row.price_tomans, updatedAt: row.updated_at };
}

export async function deleteProgramme(db: Db, studentId: number, coachId: number, expectedId: string | null, expectedVersion: number, relationshipVersion: number, allowRevoked = false): Promise<void> {
  if (!expectedId) throw new HttpError(409, 'ابتدا برنامهٔ فعلی را دوباره بارگذاری کنید.');
  const rows = await db.query<{ student_id: number }>(`
    WITH relationship AS MATERIALIZED (
      SELECT id FROM users WHERE id = $1 AND role = 'student' AND is_active = 1 AND coach_id = $2
        AND coach_access_version = $5 AND (coach_access = 1 OR $6::boolean) FOR UPDATE
    )
    DELETE FROM student_programs WHERE student_id = $1 AND coach_id = $2 AND programme_id = $3 AND version = $4
      AND EXISTS (SELECT 1 FROM relationship) RETURNING student_id`,
    [studentId, coachId, expectedId, expectedVersion, relationshipVersion, allowRevoked]
  );
  if (!rows[0]) throw new HttpError(409, 'برنامه تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.');
}
