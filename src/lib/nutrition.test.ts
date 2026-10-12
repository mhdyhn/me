import { describe, expect, it } from 'vitest';
import { FOODS, FOODS_BY_ID } from '../../shared/foods';
import { dayTotals, itemTotals, missingCounts, mealTotals, roundNutrient, roundTotals, searchFoods, todayDayIndex } from './nutrition';

describe('nutrition calculations', () => {
  it('scales a food from 100 g to the grams in the plan', () => {
    const egg = FOODS_BY_ID.get('egg-whole')!;
    const totals = itemTotals({ foodId: 'egg-whole', grams: 50 });
    expect(totals.kcal).toBeCloseTo(egg.kcal / 2, 5);
    expect(totals.protein).toBeCloseTo(egg.protein / 2, 5);
    expect(totals.fat).toBeCloseTo(egg.fat / 2, 5);
    expect(totals.carbs).toBeCloseTo(egg.carbs / 2, 5);
  });

  it('adds meals and days together', () => {
    const day = {
      name: 'شنبه',
      meals: [
        { name: 'صبحانه', items: [{ foodId: 'egg-whole', grams: 100 }, { foodId: 'bread-white', grams: 60 }] },
        { name: 'ناهار', items: [{ foodId: 'chicken-breast', grams: 200 }] },
      ],
    };
    const breakfast = mealTotals(day.meals[0]!);
    const egg = FOODS_BY_ID.get('egg-whole')!.kcal;
    const bread = FOODS_BY_ID.get('bread-white')!.kcal;
    const chicken = FOODS_BY_ID.get('chicken-breast')!.kcal;
    expect(breakfast.kcal).toBeCloseTo(egg + bread * 0.6, 5);
    expect(roundTotals(dayTotals(day)).kcal).toBe(Math.round(egg + bread * 0.6 + chicken * 2));
  });

  it('gives an unknown food zero instead of breaking the total', () => {
    const totals = itemTotals({ foodId: 'not-a-food', grams: 100 });
    expect(Object.values(totals).every((value) => value === 0)).toBe(true);
    expect(missingCounts([{ foodId: 'not-a-food', grams: 100 }]).sugar).toBe(1);
  });

  it('scales the extra nutrients too, and keeps USDA gaps out of the sum', () => {
    const egg = FOODS_BY_ID.get('egg-whole')!;
    const half = itemTotals({ foodId: 'egg-whole', grams: 50 });
    expect(half.cholesterol).toBeCloseTo((egg.cholesterol ?? 0) / 2, 5);
    expect(half.sodium).toBeCloseTo((egg.sodium ?? 0) / 2, 5);
    // Foods without a sugar value add 0 and are counted as missing.
    const missing = FOODS.filter((food) => food.sugar === null);
    if (missing.length > 0) {
      const counts = missingCounts(missing.map((food) => ({ foodId: food.id, grams: 100 })));
      expect(counts.sugar).toBe(missing.length);
      expect(itemTotals({ foodId: missing[0]!.id, grams: 100 }).sugar).toBe(0);
    }
  });

  it('rounds energy and milligrams to whole numbers and grams to one decimal', () => {
    expect(roundNutrient('kcal', 143.6)).toBe(144);
    expect(roundNutrient('sodium', 142.4)).toBe(142);
    expect(roundNutrient('protein', 12.66)).toBe(12.7);
    expect(roundTotals(itemTotals({ foodId: 'egg-whole', grams: 100 })).kcal).toBe(143);
  });

  it('starts the Persian week on Saturday', () => {
    expect(todayDayIndex(new Date(2026, 9, 10))).toBe(0);
    expect(todayDayIndex(new Date(2026, 9, 11))).toBe(1);
    expect(todayDayIndex(new Date(2026, 9, 16))).toBe(6);
  });

  it('finds foods by Persian or English name', () => {
    expect(searchFoods('مرغ').some((food) => food.id === 'chicken-breast')).toBe(true);
    expect(searchFoods('salmon').some((food) => food.id === 'salmon')).toBe(true);
    expect(searchFoods('   ')).toEqual([]);
  });

  it('has unique ids and complete values for every food', () => {
    expect(new Set(FOODS.map((food) => food.id)).size).toBe(FOODS.length);
    for (const food of FOODS) {
      expect(food.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(food.kcal) && Number.isFinite(food.protein) && Number.isFinite(food.fat) && Number.isFinite(food.carbs)).toBe(true);
    }
  });
});

describe('food search order', () => {
  it('puts the typed word before words that only contain it', () => {
    const results = searchFoods('سیب', 3).map((food) => food.name);
    expect(results[0]).toBe('سیب (بدون پوست)');
    expect(results.indexOf('سیب‌زمینی پخته')).toBeGreaterThan(0);
  });
});
