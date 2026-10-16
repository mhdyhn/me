import type { Db } from './db.ts';
import { HttpError, requireObject, requireText } from './http.ts';

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

export interface Programme {
  title: string;
  days: ProgramDay[];
  priceTomans?: number;
  updatedAt: string;
}

const MAX_DAYS = 7;
const MAX_EXERCISES_PER_DAY = 15;
const EXERCISE_ID = /^[a-z0-9-]{1,64}$/;
const REPS = /^\d{1,2}(-\d{1,2})?$/;
const DAY_NAME_MAX = 80;

/** Normalizes Persian/Arabic digits, various dash types, and surrounding spaces to standard format (e.g. "8-12"). */
export function normalizeReps(value: string): string {
  let result = String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  result = result.replace(/[\u2013\u2014\u2212]/g, '-');
  result = result.replace(/\s*-\s*/g, '-').trim();
  return result;
}

/** Checks the coach's programme. Anything the app could not display safely is rejected here. */
export function validateProgramme(input: unknown): Omit<Programme, 'updatedAt'> {
  const body = requireObject(input);
  const title = requireText(body, 'title', 2, 80, 'عنوان برنامه');
  const rawPrice = body.priceTomans;
  const priceTomans = typeof rawPrice === 'number' && Number.isInteger(rawPrice) && rawPrice >= 0 ? rawPrice : 0;
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
      if (!REPS.test(reps)) throw new HttpError(400, 'تکرار باید مثل ۸ یا ۸-۱۲ باشد.');
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

export async function saveProgramme(db: Db, studentId: number, coachId: number, programme: Omit<Programme, 'updatedAt'>, now: Date): Promise<Programme> {
  const updatedAt = now.toISOString();
  const priceTomans = programme.priceTomans ?? 0;
  await db.query(
    `INSERT INTO student_programs (student_id, coach_id, body, price_tomans, updated_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(student_id) DO UPDATE SET coach_id = excluded.coach_id, body = excluded.body, price_tomans = excluded.price_tomans, updated_at = excluded.updated_at`,
    [studentId, coachId, JSON.stringify({ title: programme.title, days: programme.days }), priceTomans, updatedAt],
  );
  return { ...programme, priceTomans, updatedAt };
}

export async function loadProgramme(db: Db, studentId: number): Promise<Programme | null> {
  const row = (await db.query<{ body: string; price_tomans: number | null; updated_at: string }>(
    'SELECT body, price_tomans, updated_at FROM student_programs WHERE student_id = $1',
    [studentId]
  ))[0];
  if (!row) return null;
  const parsed = JSON.parse(row.body) as Omit<Programme, 'updatedAt'>;
  return { ...parsed, priceTomans: row.price_tomans ?? 0, updatedAt: row.updated_at };
}

export async function deleteProgramme(db: Db, studentId: number): Promise<void> {
  await db.query('DELETE FROM student_programs WHERE student_id = $1', [studentId]);
}

export async function savePersonalProgramme(db: Db, userId: number, program: unknown[], now: Date): Promise<void> {
  const updatedAt = now.toISOString();
  await db.query(
    `INSERT INTO user_personal_programs (user_id, body, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT(user_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
    [userId, JSON.stringify(program), updatedAt],
  );
}

export async function loadPersonalProgramme(db: Db, userId: number): Promise<{ program: unknown[]; updatedAt: string } | null> {
  const row = (await db.query<{ body: string; updated_at: string }>(
    'SELECT body, updated_at FROM user_personal_programs WHERE user_id = $1',
    [userId],
  ))[0];
  if (!row) return null;
  return { program: JSON.parse(row.body), updatedAt: row.updated_at };
}

export async function deletePersonalProgramme(db: Db, userId: number): Promise<void> {
  await db.query('DELETE FROM user_personal_programs WHERE user_id = $1', [userId]);
}

