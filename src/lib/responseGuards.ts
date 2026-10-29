import type { Diary, PlanMeal } from './nutrition';
import type { Programme } from './api';

/** Shape checks protect editors from replacing a draft with an incomplete response. */
export function isMealList(value: unknown): value is PlanMeal[] {
  return Array.isArray(value) && value.every((meal) => meal && typeof meal.name === 'string'
    && Array.isArray(meal.items) && meal.items.every((item: unknown) => {
      if (!item || typeof item !== 'object') return false;
      const part = item as { foodId?: unknown; grams?: unknown };
      return typeof part.foodId === 'string' && typeof part.grams === 'number' && Number.isFinite(part.grams);
    }));
}

export function isDiaryResponse(value: unknown, day: string): value is Diary {
  if (!value || typeof value !== 'object') return false;
  const diary = value as Diary;
  return diary.day === day && isMealList(diary.meals) && (diary.updatedAt === null || typeof diary.updatedAt === 'string');
}

export function isProgrammeResponse(value: unknown): value is Programme {
  if (!value || typeof value !== 'object') return false;
  const programme = value as Programme;
  return typeof programme.id === 'string' && !!programme.id && Number.isInteger(programme.version) && programme.version >= 0
    && typeof programme.title === 'string' && typeof programme.updatedAt === 'string'
    && (programme.priceTomans === undefined || (typeof programme.priceTomans === 'number' && Number.isFinite(programme.priceTomans)))
    && Array.isArray(programme.days) && programme.days.every((day) => day && typeof day.name === 'string'
      && Array.isArray(day.exercises) && day.exercises.every((item) => item && typeof item.exerciseId === 'string'
        && typeof item.name === 'string' && typeof item.muscle === 'string' && typeof item.sets === 'number'
        && Number.isFinite(item.sets) && typeof item.reps === 'string' && typeof item.restSeconds === 'number'
        && Number.isFinite(item.restSeconds)));
}
