import { ApiError, api, type Programme, type ProgramItem } from './api';
import type { WorkoutExercise, WorkoutTemplate } from '../types';
import { setAssignedProgram } from './programStore';

/** Reads "8-12" or "8" into a range. Anything else falls back to 8–12. */
export function parseReps(reps: string): { minReps: number; maxReps: number } {
  const match = /^(\d{1,3})(?:\s*-\s*(\d{1,3}))?$/.exec(reps.trim());
  if (!match) return { minReps: 8, maxReps: 12 };
  const min = Number(match[1]);
  const max = match[2] ? Number(match[2]) : min;
  return { minReps: Math.min(min, max), maxReps: Math.max(min, max) };
}

function toExercise(item: ProgramItem): WorkoutExercise {
  const { minReps, maxReps } = parseReps(item.reps);
  return {
    exerciseId: item.exerciseId,
    name: item.name,
    prescription: {
      sets: item.sets,
      minReps,
      maxReps,
      targetRirLabel: 'طبق نظر مربی',
      minimumRir: 0,
      restSeconds: item.restSeconds,
      note: 'از برنامهٔ مربی شما',
    },
  };
}

/** Turns the coach's programme into the same shape the personal programme uses, so every screen can show it. */
export function assignedToTemplates(program: Programme): WorkoutTemplate[] {
  return program.days.map((day, index) => {
    const exercises = day.exercises.map(toExercise);
    const muscles = [...new Set(day.exercises.map((item) => item.muscle).filter(Boolean))];
    const minutes = day.exercises.reduce((sum, item) => sum + (item.sets * (40 + item.restSeconds)) / 60, 0);
    return {
      id: `assigned-day-${index + 1}`,
      name: day.name,
      dayLabel: `روز ${index + 1}`,
      focus: muscles.join(' · '),
      durationMinutes: Math.max(1, Math.round(minutes)),
      description: program.title,
      exercises,
    };
  });
}

/** Loads the programme the coach assigned to the signed-in student. Read-only for the student. */
export async function loadAssignedProgram(): Promise<void> {
  try {
    const result = await api<{ program: Programme | null }>('GET', '/me/program');
    setAssignedProgram(result.program ? assignedToTemplates(result.program) : []);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return;
    console.error('Meety could not load the coach programme.', error);
  }
}
