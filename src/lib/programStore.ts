import { useSyncExternalStore } from 'react';
import { workoutTemplates as originalProgram } from '../data/workouts';
import type { WorkoutTemplate } from '../types';

/**
 * The programme the app is currently using. It starts as the original RAGE programme and is
 * replaced when the user saves changes in the programme editor (persistence lives in
 * `programPersistence.ts`, so this module stays free of storage code and easy to test).
 */
let activeProgram: WorkoutTemplate[] = originalProgram;
const listeners = new Set<() => void>();

/** A fresh, editable copy of the original RAGE programme. */
export const originalProgramCopy = (): WorkoutTemplate[] => structuredClone(originalProgram);

export const getActiveProgram = (): WorkoutTemplate[] => activeProgram;

export function setActiveProgram(next: WorkoutTemplate[]) {
  activeProgram = next;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Subscribes a component to programme changes so it re-renders after an edit. */
export const useProgram = (): WorkoutTemplate[] => useSyncExternalStore(subscribe, getActiveProgram, getActiveProgram);

export const getWorkoutTemplate = (id: string) => activeProgram.find((workout) => workout.id === id);

/** Days that count towards the weekly total and the "next workout" rotation. */
export const getPrimaryWorkoutTemplates = () => activeProgram.filter((workout) => !workout.optional);

/** Programme name for an exercise id, used where a session has no catalogue entry to read from. */
export const programExerciseName = (exerciseId: string) =>
  activeProgram.flatMap((workout) => workout.exercises).find((item) => item.exerciseId === exerciseId)?.name;
