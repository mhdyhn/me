import { FOODS, FOODS_BY_ID, type Food, type FoodGroup } from '../../shared/foods';

/** Client copy of the coach's plan shape (the server validates the same rules). */
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

/** Every nutrient the app tracks. Energy is in kcal, most others in grams, minerals and cholesterol in mg. */
export type NutrientKey =
  | 'kcal'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'sugar'
  | 'fiber'
  | 'satFat'
  | 'cholesterol'
  | 'sodium'
  | 'potassium'
  | 'calcium'
  | 'iron';

export type Totals = Record<NutrientKey, number>;

export interface NutrientInfo {
  key: NutrientKey;
  label: string;
  unit: string;
  /** Decimals shown. Energy and milligram values are whole numbers. */
  decimals: 0 | 1;
}

export const MAIN_NUTRIENTS: NutrientInfo[] = [
  { key: 'kcal', label: 'کالری', unit: 'کیلوکالری', decimals: 0 },
  { key: 'protein', label: 'پروتئین', unit: 'گرم', decimals: 1 },
  { key: 'carbs', label: 'کربوهیدرات', unit: 'گرم', decimals: 1 },
  { key: 'fat', label: 'چربی', unit: 'گرم', decimals: 1 },
];

export const DETAIL_NUTRIENTS: NutrientInfo[] = [
  { key: 'sugar', label: 'قند', unit: 'گرم', decimals: 1 },
  { key: 'fiber', label: 'فیبر', unit: 'گرم', decimals: 1 },
  { key: 'satFat', label: 'چربی اشباع', unit: 'گرم', decimals: 1 },
  { key: 'sodium', label: 'سدیم', unit: 'میلی‌گرم', decimals: 0 },
  { key: 'cholesterol', label: 'کلسترول', unit: 'میلی‌گرم', decimals: 0 },
  { key: 'potassium', label: 'پتاسیم', unit: 'میلی‌گرم', decimals: 0 },
  { key: 'calcium', label: 'کلسیم', unit: 'میلی‌گرم', decimals: 0 },
  { key: 'iron', label: 'آهن', unit: 'میلی‌گرم', decimals: 1 },
];

export const ALL_NUTRIENTS: NutrientInfo[] = [...MAIN_NUTRIENTS, ...DETAIL_NUTRIENTS];

const NUTRIENT_KEYS = ALL_NUTRIENTS.map((nutrient) => nutrient.key);

export const MAX_GRAMS = 2000;
export const MAX_MEALS = 8;
export const MAX_ITEMS = 25;
export const MAX_MEAL_NAME = 40;

export const GROUP_LABELS: Record<FoodGroup, string> = {
  protein: 'پروتئین',
  dairy: 'لبنیات',
  grain: 'غلات و نان',
  fruit: 'میوه',
  vegetable: 'سبزی',
  fat: 'چربی و آجیل',
  sweet: 'شیرینی',
  drink: 'نوشیدنی',
};

export { FOODS, FOODS_BY_ID };
export type { Food, FoodGroup };

const zeroTotals = (): Totals => Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, 0])) as Totals;

/** Nutrients of one item: the food's values per 100 g, scaled to the grams in the plan. Missing values count as 0 here; see `missingCounts`. */
export function itemTotals(item: PlanItem): Totals {
  const totals = zeroTotals();
  const food = FOODS_BY_ID.get(item.foodId);
  if (!food) return totals;
  const factor = item.grams / 100;
  for (const key of NUTRIENT_KEYS) {
    const value = food[key];
    if (value !== null) totals[key] = value * factor;
  }
  return totals;
}

export function sumTotals(list: Totals[]): Totals {
  const sum = zeroTotals();
  for (const part of list) {
    for (const key of NUTRIENT_KEYS) sum[key] += part[key];
  }
  return sum;
}

export function mealTotals(meal: PlanMeal): Totals {
  return sumTotals(meal.items.map(itemTotals));
}

export function dayTotals(day: PlanDay): Totals {
  return sumTotals(day.meals.map(mealTotals));
}

/** For each nutrient, how many of these items USDA has no value for. A food missing from the catalogue counts as missing everything. */
export function missingCounts(items: PlanItem[]): Record<NutrientKey, number> {
  const counts = Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, 0])) as Record<NutrientKey, number>;
  for (const item of items) {
    const food = FOODS_BY_ID.get(item.foodId);
    for (const key of NUTRIENT_KEYS) {
      if (!food || food[key] === null) counts[key] += 1;
    }
  }
  return counts;
}

/** Rounds one nutrient for display: whole numbers for kcal and mg, one decimal for grams. */
export function roundNutrient(key: NutrientKey, value: number): number {
  const info = ALL_NUTRIENTS.find((nutrient) => nutrient.key === key);
  if (!info || info.decimals === 0) return Math.round(value);
  return Math.round(value * 10) / 10;
}

export function roundTotals(totals: Totals): Totals {
  return Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, roundNutrient(key, totals[key])])) as Totals;
}

/** Persian week starts on Saturday. Returns 0 for Saturday ... 6 for Friday. */
export function todayDayIndex(now: Date = new Date()): number {
  return (now.getDay() + 1) % 7;
}

/** Foods whose name has the typed word first, then names that start with it, then any match. */
export function searchFoods(query: string, limit = 8): Food[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (food: Food) => {
    const name = food.name.toLowerCase();
    const words = name.split(/[\s(),/]+/);
    if (words.includes(q) || food.nameEn.toLowerCase().split(/[\s(),/]+/).includes(q)) return 0;
    if (name.startsWith(q) || food.nameEn.toLowerCase().startsWith(q)) return 1;
    return 2;
  };
  return FOODS.filter((food) => food.name.includes(q) || food.nameEn.toLowerCase().includes(q))
    .map((food, index) => ({ food, index, rank: rank(food) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.food);
}

export interface PieceUnit {
  label: string;
  grams: number;
}

/** Grams shown as a count of pieces, to two decimals (for example 100 g of egg is 2 eggs). */
export function gramsToCount(grams: number, piece: PieceUnit): number {
  return Math.round((grams / piece.grams) * 100) / 100;
}

/** A count of pieces stored as grams, to one decimal. Anything not a positive number becomes 0 and is rejected on save. */
export function countToGrams(count: number, piece: PieceUnit): number {
  if (!Number.isFinite(count)) return 0;
  return Math.round(count * piece.grams * 10) / 10;
}

/** A personal diary day, as the server returns it. */
export interface Diary {
  day: string;
  meals: PlanMeal[];
  updatedAt: string | null;
}
