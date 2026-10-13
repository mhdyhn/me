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
  updatedAt: string;
}

const MAX_DAYS = 7;
const MAX_EXERCISES_PER_DAY = 15;
const EXERCISE_ID = /^[a-z0-9-]{1,64}$/;
const REPS = /^\d{1,2}(-\d{1,2})?$/;

/** Checks the coach's programme. Anything the app could not display safely is rejected here. */
export function validateProgramme(input: unknown): Omit<Programme, 'updatedAt'> {
  const body = requireObject(input);
  const title = requireText(body, 'title', 2, 80, 'عنوان برنامه');
  if (!Array.isArray(body.days) || body.days.length < 1 || body.days.length > MAX_DAYS) {
    throw new HttpError(400, `برنامه باید بین ۱ تا ${MAX_DAYS} روز داشته باشد.`);
  }
  const days = body.days.map((rawDay, dayIndex) => {
    const day = requireObject(rawDay);
    const name = requireText(day, 'name', 1, 40, `نام روز ${dayIndex + 1}`);
    if (!Array.isArray(day.exercises) || day.exercises.length < 1 || day.exercises.length > MAX_EXERCISES_PER_DAY) {
      throw new HttpError(400, `هر روز باید بین ۱ تا ${MAX_EXERCISES_PER_DAY} حرکت داشته باشد.`);
    }
    const exercises = day.exercises.map((rawItem) => {
      const item = requireObject(rawItem);
      if (typeof item.exerciseId !== 'string' || !EXERCISE_ID.test(item.exerciseId)) throw new HttpError(400, 'شناسهٔ حرکت نامعتبر است.');
      const name = requireText(item, 'name', 1, 80, 'نام حرکت');
      const muscle = requireText(item, 'muscle', 1, 40, 'گروه عضلانی');
      if (!Number.isInteger(item.sets) || (item.sets as number) < 1 || (item.sets as number) > 10) throw new HttpError(400, 'تعداد ست باید بین ۱ تا ۱۰ باشد.');
      if (typeof item.reps !== 'string' || !REPS.test(item.reps.trim())) throw new HttpError(400, 'تکرار باید مثل ۸ یا ۸-۱۲ باشد.');
      if (!Number.isInteger(item.restSeconds) || (item.restSeconds as number) < 0 || (item.restSeconds as number) > 600) {
        throw new HttpError(400, 'استراحت باید بین ۰ تا ۶۰۰ ثانیه باشد.');
      }
      return {
        exerciseId: item.exerciseId,
        name,
        muscle,
        sets: item.sets as number,
        reps: (item.reps as string).trim(),
        restSeconds: item.restSeconds as number,
      };
    });
    return { name, exercises };
  });
  return { title, days };
}

export async function saveProgramme(db: Db, studentId: number, coachId: number, programme: Omit<Programme, 'updatedAt'>, now: Date): Promise<Programme> {
  const updatedAt = now.toISOString();
  await db.query(
    `INSERT INTO student_programs (student_id, coach_id, body, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT(student_id) DO UPDATE SET coach_id = excluded.coach_id, body = excluded.body, updated_at = excluded.updated_at`,
    [studentId, coachId, JSON.stringify({ title: programme.title, days: programme.days }), updatedAt],
  );
  return { ...programme, updatedAt };
}

export async function loadProgramme(db: Db, studentId: number): Promise<Programme | null> {
  const row = (await db.query<{ body: string; updated_at: string }>('SELECT body, updated_at FROM student_programs WHERE student_id = $1', [studentId]))[0];
  if (!row) return null;
  const parsed = JSON.parse(row.body) as Omit<Programme, 'updatedAt'>;
  return { ...parsed, updatedAt: row.updated_at };
}
