import { randomUUID } from 'node:crypto';
import type { Db } from './db.ts';
import { paidTransactionCondition } from './payments.ts';
import { HttpError, requireObject, requireText } from './http.ts';
import { isValidReps, normalizeReps } from '../shared/repetitions.ts';
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
  if (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 0 || (expectedVersion as number) > 2147483646) {
    throw new HttpError(400, 'نسخهٔ برنامه نامعتبر است.');
  }
  if (mode === 'edit' && expectedId === null) throw new HttpError(409, 'ابتدا برنامهٔ فعلی را دوباره بارگذاری کنید.');
  return { mode, expectedId: expectedId as string | null, expectedVersion: expectedVersion as number };
}

/** Save the active row and its offer atomically; a stale coach cannot overwrite a newer offer. */
export async function saveProgramme(db: Db, studentId: number, coachId: number, programme: ProgrammeInput, options: ProgrammeSave, now: Date): Promise<Programme> {
  const updatedAt = now.toISOString();
  const priceTomans = programme.priceTomans ?? 0;
  const id = options.mode === 'edit' ? options.expectedId! : randomUUID();
  const rows = await db.query<{ id: string; version: number }>(`
    WITH updated AS (
      UPDATE student_programs SET coach_id = $2, body = $3, price_tomans = $4, updated_at = $5,
        programme_id = $6, version = version + 1
      WHERE student_id = $1 AND programme_id = $7 AND version = $8 RETURNING *
    ), inserted AS (
      INSERT INTO student_programs (student_id, coach_id, body, price_tomans, updated_at, programme_id, version)
      SELECT $1, $2, $3, $4, $5, $6, 1 WHERE $7::text IS NULL
      ON CONFLICT (student_id) DO NOTHING RETURNING *
    ), saved AS (
      SELECT * FROM updated UNION ALL SELECT * FROM inserted
    ), offered AS (
      INSERT INTO programme_offers (id, student_id, coach_id, body, price_tomans, created_at, updated_at)
      SELECT programme_id, student_id, coach_id, body, price_tomans, updated_at, updated_at FROM saved
      ON CONFLICT (id) DO UPDATE SET coach_id = excluded.coach_id, body = excluded.body,
        price_tomans = excluded.price_tomans, updated_at = excluded.updated_at
      WHERE programme_offers.student_id = excluded.student_id
      RETURNING id
    )
    SELECT saved.programme_id AS id, saved.version FROM saved JOIN offered ON offered.id = saved.programme_id
  `, [studentId, coachId, JSON.stringify({ title: programme.title, days: programme.days }), priceTomans, updatedAt, id, options.expectedId, options.expectedVersion]);
  if (!rows[0]) throw new HttpError(409, 'برنامه تغییر کرده است؛ صفحه را دوباره بارگذاری و نوع ذخیره را انتخاب کنید.');
  return { ...programme, id: rows[0].id, version: rows[0].version, priceTomans, updatedAt };
}

export async function loadProgramme(db: Db, studentId: number): Promise<Programme | null> {
  const row = (await db.query<{ body: string; price_tomans: number | null; updated_at: string; programme_id: string; version: number }>(
    'SELECT body, price_tomans, updated_at, programme_id, version FROM student_programs WHERE student_id = $1',
    [studentId]
  ))[0];
  if (!row) return null;
  const parsed = JSON.parse(row.body) as ProgrammeInput;
  return { ...parsed, id: row.programme_id, version: row.version, priceTomans: row.price_tomans ?? 0, updatedAt: row.updated_at };
}

/** Archive is read-only: never expose exercises from another student or an unpaid offer. */
export async function listPurchasedProgrammes(db: Db, studentId: number, cursor: string | null): Promise<{ programs: Programme[]; nextCursor: string | null }> {
  const rows = await db.query<{ id: string; body: string; price_tomans: number; updated_at: string }>(`
    SELECT o.id, o.body, o.price_tomans, o.updated_at FROM programme_offers o
    WHERE o.student_id = $1 AND NOT EXISTS (
      SELECT 1 FROM student_programs sp WHERE sp.student_id = o.student_id AND sp.programme_id = o.id
    ) AND (o.price_tomans = 0 OR EXISTS (
      SELECT 1 FROM payment_transactions t WHERE t.student_id = o.student_id AND t.programme_id = o.id
        AND ${paidTransactionCondition('t', '$2')}
    )) AND ($3::text IS NULL OR (o.updated_at, o.id) < (
      SELECT marker.updated_at, marker.id FROM programme_offers marker WHERE marker.student_id = $1 AND marker.id = $3
    )) ORDER BY o.updated_at DESC, o.id DESC LIMIT 21
  `, [studentId, process.env.NODE_ENV === 'production' ? 1 : 0, cursor]);
  const page = rows.slice(0, 20);
  return {
    programs: page.map((row) => ({ ...(JSON.parse(row.body) as ProgrammeInput), id: row.id, version: 0, priceTomans: row.price_tomans, updatedAt: row.updated_at })),
    nextCursor: rows.length > 20 ? page[page.length - 1]!.id : null,
  };
}

export async function deleteProgramme(db: Db, studentId: number, expectedId: string | null, expectedVersion: number): Promise<void> {
  if (!expectedId) throw new HttpError(409, 'ابتدا برنامهٔ فعلی را دوباره بارگذاری کنید.');
  const rows = await db.query<{ student_id: number }>(
    'DELETE FROM student_programs WHERE student_id = $1 AND programme_id = $2 AND version = $3 RETURNING student_id',
    [studentId, expectedId, expectedVersion]
  );
  if (!rows[0]) throw new HttpError(409, 'برنامه تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.');
}
