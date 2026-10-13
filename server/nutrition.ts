import type { DatabaseSync } from 'node:sqlite';
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

export function migrateNutrition(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nutrition_plans (
      student_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      coach_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
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

export function loadPlan(db: DatabaseSync, studentId: number): NutritionPlan | null {
  const row = db.prepare('SELECT body, updated_at FROM nutrition_plans WHERE student_id = ?').get(studentId) as
    | { body: string; updated_at: string }
    | undefined;
  if (!row) return null;
  return { ...(JSON.parse(row.body) as Omit<NutritionPlan, 'updatedAt'>), updatedAt: row.updated_at };
}

export function savePlan(db: DatabaseSync, studentId: number, coachId: number, plan: Omit<NutritionPlan, 'updatedAt'>, at: string): NutritionPlan {
  db.prepare(
    `INSERT INTO nutrition_plans (student_id, coach_id, body, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(student_id) DO UPDATE SET coach_id = excluded.coach_id, body = excluded.body, updated_at = excluded.updated_at`,
  ).run(studentId, coachId, JSON.stringify(plan), at);
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

export function loadDiary(db: DatabaseSync, userId: number, day: string): Diary {
  const row = db.prepare('SELECT body, updated_at FROM nutrition_diary WHERE user_id = ? AND day = ?').get(userId, day) as
    | { body: string; updated_at: string }
    | undefined;
  if (!row) return emptyDiary(day);
  return { day, meals: JSON.parse(row.body) as PlanMeal[], updatedAt: row.updated_at };
}

export function saveDiary(db: DatabaseSync, userId: number, day: string, meals: PlanMeal[], at: string): Diary {
  db.prepare(
    `INSERT INTO nutrition_diary (user_id, day, body, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, day) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
  ).run(userId, day, JSON.stringify(meals), at);
  return { day, meals, updatedAt: at };
}

function optionalNumber(value: unknown, min: number, max: number, label: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(400, `${label} باید عددی بین ${min} و ${max} باشد.`);
  }
  return Math.round(value * 10) / 10;
}
