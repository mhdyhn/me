import type { ExercisePrescription, WorkoutExercise, WorkoutSession, WorkoutTemplate } from '../types';
import { primaryWorkoutTemplates } from '../data/workouts';

export const PROGRAM_WEEKS = 8;
export const PROGRAM_DAYS = 5;

export const getProgramWeek = (sessions: WorkoutSession[]) => {
  const completed = sessions.filter(
    (session) => session.status === 'completed' && primaryWorkoutTemplates.some((item) => item.id === session.templateId),
  ).length;
  return Math.min(PROGRAM_WEEKS, Math.floor(completed / PROGRAM_DAYS) + 1);
};

/**
 * Eight-week progression stays conservative: early weeks build consistency,
 * week 5 deloads, and the final weeks return to the base volume without
 * instructing the user to train to failure.
 */
export const getWeekPrescription = (base: ExercisePrescription, week: number): ExercisePrescription => {
  const currentWeek = Math.max(1, Math.min(PROGRAM_WEEKS, Math.round(week)));
  if (currentWeek === 5) {
    return {
      ...base,
      sets: Math.max(1, Math.ceil(base.sets * 0.6)),
      targetRirLabel: '3',
      minimumRir: Math.max(2, base.minimumRir + 1),
      note: `${base.note ? `${base.note} ` : ''}هفتهٔ پنجم: کاهش حجم برای ریکاوری.`.trim(),
    };
  }
  if (currentWeek >= 6) {
    return {
      ...base,
      targetRirLabel: base.minimumRir >= 2 ? '2' : base.targetRirLabel,
      minimumRir: Math.max(base.minimumRir, 1),
    };
  }
  return { ...base };
};

export const getWeekWorkoutExercises = (template: WorkoutTemplate, week: number): WorkoutExercise[] =>
  template.exercises.map((item) => ({ ...item, prescription: getWeekPrescription(item.prescription, week) }));

export const getWeekSchedule = (date = new Date()) => {
  const day = (date.getDay() + 6) % 7; // Monday = 0
  if (day >= 5) return null;
  return primaryWorkoutTemplates[day] ?? null;
};
