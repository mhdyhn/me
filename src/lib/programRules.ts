import { estimateMinutes, toPersianNumber } from '../data/workouts';
import type { WorkoutExercise, WorkoutTemplate } from '../types';

/** Pure rules for the programme editor: validation and the derived fields that are recalculated on save. */

export const MAX_SETS = 10;
export const MAX_REPS = 100;
export const MAX_REST_SECONDS = 900;

export const newId = (prefix: string) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10)}`;

export const newDay = (): WorkoutTemplate => ({
  id: newId('custom-day'),
  name: 'روز جدید',
  dayLabel: '',
  focus: '',
  durationMinutes: 0,
  description: '',
  exercises: [],
});

export const newExercise = (exerciseId: string, name: string): WorkoutExercise => ({
  exerciseId,
  name,
  prescription: {
    sets: 3,
    minReps: 8,
    maxReps: 10,
    targetRirLabel: '1–2',
    minimumRir: 1,
    restSeconds: 90,
  },
});

const isWhole = (value: number) => Number.isInteger(value);

/** Returns Persian error messages; an empty list means the programme can be saved. */
export function validateProgram(program: WorkoutTemplate[]): string[] {
  const errors: string[] = [];
  if (program.length === 0) errors.push('برنامه باید حداقل یک روز داشته باشد.');
  if (program.length > 0 && program.every((day) => day.optional)) errors.push('برنامه باید حداقل یک روز اصلی (غیر اختیاری) داشته باشد.');
  const ids = new Set<string>();
  program.forEach((day, dayIndex) => {
    const dayNumber = dayIndex + 1;
    if (ids.has(day.id)) errors.push(`شناسهٔ روز ${dayNumber} تکراری است.`);
    ids.add(day.id);
    if (!day.name.trim()) errors.push(`روز ${dayNumber} نام ندارد.`);
    if (!day.focus.trim()) errors.push(`روز ${dayNumber} بدون عضلهٔ هدف است.`);
    if (day.exercises.length === 0) errors.push(`روز ${dayNumber} هیچ حرکتی ندارد.`);
    day.exercises.forEach((exercise, exerciseIndex) => {
      const where = `حرکت ${exerciseIndex + 1} از روز ${dayNumber}`;
      const { sets, minReps, maxReps, restSeconds } = exercise.prescription;
      if (!exercise.name.trim()) errors.push(`${where} نام ندارد.`);
      if (!isWhole(sets) || sets < 1 || sets > MAX_SETS) errors.push(`${where}: تعداد ست باید بین ۱ و ${MAX_SETS} باشد.`);
      if (!isWhole(minReps) || minReps < 1 || !isWhole(maxReps) || maxReps > MAX_REPS) {
        errors.push(`${where}: تعداد تکرار باید عددی بین ۱ و ${MAX_REPS} باشد.`);
      } else if (maxReps < minReps) {
        errors.push(`${where}: حداکثر تکرار نمی‌تواند کمتر از حداقل باشد.`);
      }
      if (!isWhole(restSeconds) || restSeconds < 0 || restSeconds > MAX_REST_SECONDS) {
        errors.push(`${where}: استراحت باید بین ۰ و ${MAX_REST_SECONDS} ثانیه باشد.`);
      }
    });
  });
  return errors;
}

/** Recalculates the fields that follow from the order and contents: day labels and durations. */
export function finalizeProgram(program: WorkoutTemplate[]): WorkoutTemplate[] {
  return program.map((day, index) => ({
    ...day,
    name: day.name.trim(),
    focus: day.focus.trim(),
    dayLabel: `روز ${toPersianNumber(index + 1)}`,
    durationMinutes: estimateMinutes(day.exercises),
  }));
}
