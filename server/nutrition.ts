import type { Db } from './db.ts';
import { FOODS_BY_ID } from '../shared/foods.ts';
import { HttpError } from './http.ts';

/** A coach's weekly nutrition plan for one student. Seven fixed days; no content is created by default. */
export const DAY_NAMES = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'] as const;
const MAX_MEALS = 8;
const MAX_ITEMS = 25;
const MAX_GRAMS = 2000;
const MAX_MEAL_NAME = 40;

export interface PlanItem {
  foodId: string;
  grams: number;
}

export interface PlanMeal {
  name: string;
  items: PlanItem[];
}

export interface PlanDay {
  name: string;
  meals: PlanMeal[];
}

export interface Targets {
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

export interface NutritionPlan {
  targets: Targets;
  days: PlanDay[];
  updatedAt: string | null;
}

export async function migrateNutrition(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS nutrition_plans (
      student_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      coach_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_nutrition_plans_coach_id ON nutrition_plans(coach_id);
    -- Keep each coach's plan separate; the legacy table remains a current-plan projection.
    CREATE TABLE IF NOT EXISTS nutrition_coach_plans (
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coach_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (student_id, coach_id)
    );
    INSERT INTO nutrition_coach_plans (student_id, coach_id, body, updated_at)
      SELECT student_id, coach_id, body, updated_at FROM nutrition_plans
      ON CONFLICT (student_id, coach_id) DO NOTHING;
    CREATE TABLE IF NOT EXISTS nutrition_diary (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, day)
    );
  `);
}

export function emptyPlan(): NutritionPlan {
  return {
    targets: { kcal: null, proteinG: null, carbsG: null, fatG: null },
    days: DAY_NAMES.map((name) => ({ name, meals: [] })),
    updatedAt: null,
  };
}

export async function loadPlan(db: Db, studentId: number, coachId: number): Promise<NutritionPlan | null> {
  const row = (await db.query<{ body: string; updated_at: string }>(
    'SELECT body, updated_at FROM nutrition_coach_plans WHERE student_id = $1 AND coach_id = $2', [studentId, coachId],
  ))[0];
  if (!row) return null;
  return { ...(JSON.parse(row.body) as Omit<NutritionPlan, 'updatedAt'>), updatedAt: row.updated_at };
}

export async function listFormerCoachPlans(db: Db, studentId: number, currentCoachId: number | null, after: number): Promise<{ plans: { coachId: number; coachName: string; plan: NutritionPlan }[]; nextCursor: number | null }> {
  const rows = await db.query<{ coach_id: number; display_name: string; body: string; updated_at: string }>(`
    SELECT p.coach_id, c.display_name, p.body, p.updated_at FROM nutrition_coach_plans p
    JOIN users c ON c.id = p.coach_id
    WHERE p.student_id = $1 AND p.coach_id > $2 AND p.coach_id IS DISTINCT FROM $3::integer
    ORDER BY p.coach_id LIMIT 21`, [studentId, after, currentCoachId]);
  const page = rows.slice(0, 20);
  return {
    plans: page.map((row) => ({ coachId: Number(row.coach_id), coachName: row.display_name,
      plan: { ...(JSON.parse(row.body) as Omit<NutritionPlan, 'updatedAt'>), updatedAt: row.updated_at } })),
    nextCursor: rows.length > 20 ? Number(page[page.length - 1]!.coach_id) : null,
  };
}

export async function savePlan(db: Db, studentId: number, coachId: number, plan: Omit<NutritionPlan, 'updatedAt'>, at: string, relationshipVersion = 0, expected?: Omit<NutritionPlan, 'updatedAt'>): Promise<NutritionPlan> {
  const empty = emptyPlan();
  const emptyBody = { targets: empty.targets, days: empty.days };
  const rows = await db.query(`
    WITH relationship AS MATERIALIZED (
      SELECT id FROM users WHERE id = $1 AND role = 'student' AND is_active = 1 AND coach_id = $2
        AND coach_access = 1 AND coach_access_version = $5 FOR UPDATE
    ), saved AS (
      INSERT INTO nutrition_coach_plans (student_id, coach_id, body, updated_at)
      SELECT $1, $2, $3, $4 FROM relationship
      WHERE NOT $6::boolean OR COALESCE((SELECT body::jsonb FROM nutrition_coach_plans WHERE student_id = $1 AND coach_id = $2), $8::jsonb) = $7::jsonb
      ON CONFLICT(student_id, coach_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at
        WHERE NOT $6::boolean OR nutrition_coach_plans.body::jsonb = $7::jsonb
      RETURNING *
    ), legacy_projection AS (
      INSERT INTO nutrition_plans (student_id, coach_id, body, updated_at)
      SELECT student_id, coach_id, body, updated_at FROM saved
      ON CONFLICT(student_id) DO UPDATE SET coach_id = excluded.coach_id, body = excluded.body, updated_at = excluded.updated_at
    ) SELECT student_id FROM saved`,
    [studentId, coachId, JSON.stringify(plan), at, relationshipVersion, expected !== undefined, JSON.stringify(expected ?? emptyBody), JSON.stringify(emptyBody)],
  );
  if (!rows.length) throw new HttpError(409, 'برنامهٔ غذایی یا دسترسی مربی تغییر کرده است؛ نسخهٔ تازه را بررسی کنید.');
  return { ...plan, updatedAt: at };
}

/** Checks a plan from the coach. Anything the app could not calculate or display safely is rejected here. */
export function validatePlan(input: unknown): Omit<NutritionPlan, 'updatedAt'> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'برنامهٔ غذایی نامعتبر است.');
  const body = input as Record<string, unknown>;

  const targetsInput = body.targets ?? {};
  if (typeof targetsInput !== 'object' || targetsInput === null || Array.isArray(targetsInput)) throw new HttpError(400, 'هدف‌ها نامعتبر است.');
  const t = targetsInput as Record<string, unknown>;
  const targets: Targets = {
    kcal: optionalNumber(t.kcal, 0, 10000, 'هدف کالری'),
    proteinG: optionalNumber(t.proteinG, 0, 1000, 'هدف پروتئین'),
    carbsG: optionalNumber(t.carbsG, 0, 1000, 'هدف کربوهیدرات'),
    fatG: optionalNumber(t.fatG, 0, 1000, 'هدف چربی'),
  };

  if (!Array.isArray(body.days) || body.days.length !== DAY_NAMES.length) throw new HttpError(400, 'برنامهٔ هفته باید هفت روز داشته باشد.');
  const days: PlanDay[] = body.days.map((rawDay, dayIndex) => {
    const day = (rawDay ?? {}) as Record<string, unknown>;
    const meals = validateMealList(day.meals, 'وعده‌های روز نامعتبر است.');
    return { name: DAY_NAMES[dayIndex]!, meals };
  });

  return { targets, days };
}

/** Checks a list of meals (a coach's plan day or a personal diary day). Shared rules: food ids, grams, names and limits. */
export function validateMealList(input: unknown, notListMessage: string): PlanMeal[] {
  if (!Array.isArray(input)) throw new HttpError(400, notListMessage);
  if (input.length > MAX_MEALS) throw new HttpError(400, `هر روز حداکثر ${MAX_MEALS} وعده دارد.`);
  return input.map((rawMeal) => {
    const meal = (rawMeal ?? {}) as Record<string, unknown>;
    const name = typeof meal.name === 'string' ? meal.name.trim() : '';
    if (name.length < 1 || name.length > MAX_MEAL_NAME) throw new HttpError(400, `نام وعده باید بین ۱ تا ${MAX_MEAL_NAME} نویسه باشد.`);
    if (!Array.isArray(meal.items)) throw new HttpError(400, 'مواد وعده نامعتبر است.');
    if (meal.items.length > MAX_ITEMS) throw new HttpError(400, `هر وعده حداکثر ${MAX_ITEMS} ماده دارد.`);
    const items = meal.items.map((rawItem): PlanItem => {
      const item = (rawItem ?? {}) as Record<string, unknown>;
      if (typeof item.foodId !== 'string' || !FOODS_BY_ID.has(item.foodId)) throw new HttpError(400, 'یکی از غذاها در فهرست نیست.');
      const grams = typeof item.grams === 'number' ? Math.round(item.grams * 10) / 10 : NaN;
      if (!Number.isFinite(grams) || grams <= 0 || grams > MAX_GRAMS) throw new HttpError(400, `مقدار هر ماده باید بین ۰٫۱ تا ${MAX_GRAMS} گرم باشد.`);
      return { foodId: item.foodId, grams };
    });
    return { name, items };
  });
}

/** A personal diary: what one signed-in user ate on one calendar day (YYYY-MM-DD). */
export interface Diary {
  day: string;
  meals: PlanMeal[];
  updatedAt: string | null;
}

export function validateDay(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, 'تاریخ نامعتبر است.');
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new HttpError(400, 'تاریخ نامعتبر است.');
  return value;
}

export function validateDiary(input: unknown): { day: string; meals: PlanMeal[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'دفترچهٔ غذایی نامعتبر است.');
  const body = input as Record<string, unknown>;
  return { day: validateDay(body.day), meals: validateMealList(body.meals, 'وعده‌های روز نامعتبر است.') };
}

export function emptyDiary(day: string): Diary {
  return { day, meals: [], updatedAt: null };
}

export async function loadDiary(db: Db, userId: number, day: string): Promise<Diary> {
  const row = (await db.query<{ body: string; updated_at: string }>('SELECT body, updated_at FROM nutrition_diary WHERE user_id = $1 AND day = $2', [userId, day]))[0];
  if (!row) return emptyDiary(day);
  return { day, meals: JSON.parse(row.body) as PlanMeal[], updatedAt: row.updated_at };
}

export async function saveDiary(db: Db, userId: number, day: string, meals: PlanMeal[], at: string, expected?: PlanMeal[]): Promise<Diary> {
  const rows = await db.query(
    `INSERT INTO nutrition_diary (user_id, day, body, updated_at)
     SELECT $1, $2, $3, $4
     WHERE NOT $5::boolean OR $6::jsonb = '[]'::jsonb
       OR EXISTS (SELECT 1 FROM nutrition_diary WHERE user_id = $1 AND day = $2 AND body::jsonb = $6::jsonb)
     ON CONFLICT(user_id, day) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at
       WHERE NOT $5::boolean OR nutrition_diary.body::jsonb = $6::jsonb
     RETURNING day`,
    [userId, day, JSON.stringify(meals), at, expected !== undefined, JSON.stringify(expected ?? [])],
  );
  if (!rows.length) throw new HttpError(409, 'دفتر خوراک این روز تغییر کرده است؛ نسخهٔ تازه را بررسی کنید.');
  return { day, meals, updatedAt: at };
}

function optionalNumber(value: unknown, min: number, max: number, label: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(400, `${label} باید عددی بین ${min} و ${max} باشد.`);
  }
  return Math.round(value * 10) / 10;
}
