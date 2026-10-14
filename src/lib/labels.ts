import type { ExerciseDefinition } from '../types';

export const categoryLabels: Record<ExerciseDefinition['category'], string> = {
  Push: 'پرس',
  Pull: 'کشش',
  Legs: 'پا',
  Core: 'میان‌تنه',
};

export const difficultyLabels: Record<ExerciseDefinition['difficulty'], string> = {
  Beginner: 'مبتدی',
  Intermediate: 'متوسط',
};

export const normalizePersianSearch = (value: string) =>
  value
    .toLocaleLowerCase('fa-IR')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/[\s\-_]+/g, ' ')
    .trim();

/** Matches query against target, tolerating Persian spaces, half-spaces (نیم‌فاصله) and compound words. */
export const matchesPersianSearch = (target: string, query: string): boolean => {
  const normQuery = normalizePersianSearch(query);
  if (!normQuery) return true;
  const normTarget = normalizePersianSearch(target);
  if (normTarget.includes(normQuery)) return true;
  const noSpaceTarget = normTarget.replace(/\s+/g, '');
  const noSpaceQuery = normQuery.replace(/\s+/g, '');
  return noSpaceTarget.includes(noSpaceQuery);
};
