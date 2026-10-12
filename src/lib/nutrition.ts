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

export interface Totals {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

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

const ZERO: Totals = { kcal: 0, protein: 0, fat: 0, carbs: 0 };

/** Nutrients of one item: the food's values per 100 g, scaled to the grams in the plan. */
export function itemTotals(item: PlanItem): Totals {
  const food = FOODS_BY_ID.get(item.foodId);
  if (!food) return ZERO;
  const factor = item.grams / 100;
  return {
    kcal: food.kcal * factor,
    protein: food.protein * factor,
    fat: food.fat * factor,
    carbs: food.carbs * factor,
  };
}

export function sumTotals(list: Totals[]): Totals {
  return list.reduce<Totals>((sum, part) => ({
    kcal: sum.kcal + part.kcal,
    protein: sum.protein + part.protein,
    fat: sum.fat + part.fat,
    carbs: sum.carbs + part.carbs,
  }), { ...ZERO });
}

export function mealTotals(meal: PlanMeal): Totals {
  return sumTotals(meal.items.map(itemTotals));
}

export function dayTotals(day: PlanDay): Totals {
  return sumTotals(day.meals.map(mealTotals));
}

/** Rounds for display: whole kcal, grams to one decimal. */
export function roundTotals(totals: Totals): Totals {
  return {
    kcal: Math.round(totals.kcal),
    protein: Math.round(totals.protein * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
  };
}

/** Persian week starts on Saturday. Returns 0 for Saturday ... 6 for Friday. */
export function todayDayIndex(now: Date = new Date()): number {
  return (now.getDay() + 1) % 7;
}

export function emptyTargets(): Targets {
  return { kcal: null, proteinG: null, carbsG: null, fatG: null };
}

export function searchFoods(query: string, limit = 8): Food[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return FOODS.filter((food) => food.name.includes(q) || food.nameEn.toLowerCase().includes(q)).slice(0, limit);
}
