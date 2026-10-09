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
    .trim();
