import { useSyncExternalStore } from 'react';
import { workoutTemplates as originalProgram } from '../data/workouts';
import { adminPersonalProgram } from '../data/adminProgram';
import { usesOwnerData } from './accountScope';
import type { WorkoutTemplate } from '../types';

/**
 * The programme the app is currently using. It starts as the original RAGE programme and is
 * replaced when the user saves changes in the programme editor (persistence lives in
 * `programPersistence.ts`, so this module stays free of storage code and easy to test).
 */
/** The developer's account starts with the original programme; every other account starts empty. */
export interface AssignedMeta {
  title: string;
  priceTomans: number;
  coachName: string | null;
  isPaid: boolean;
}

const ownerDefaultProgram = import.meta.env.MODE === 'test' ? originalProgram : adminPersonalProgram;
let activeProgram: WorkoutTemplate[] = usesOwnerData() ? ownerDefaultProgram : [];
let readOnly = false;
let assignedMeta: AssignedMeta | null = null;
const listeners = new Set<() => void>();

/** A fresh, editable copy of the original RAGE programme. */
export const originalProgramCopy = (): WorkoutTemplate[] => structuredClone(originalProgram);

export const getActiveProgram = (): WorkoutTemplate[] => activeProgram;

export const getAssignedMeta = (): AssignedMeta | null => assignedMeta;

export function setAssignedMeta(meta: AssignedMeta | null) {
  assignedMeta = meta;
  listeners.forEach((listener) => listener());
}

export const useAssignedMeta = (): AssignedMeta | null => useSyncExternalStore(subscribe, getAssignedMeta, getAssignedMeta);

/** The developer's own programme is editable. Accounts start with none until they create one. */
export function setActiveProgram(next: WorkoutTemplate[]) {
  activeProgram = next;
  readOnly = false;
  listeners.forEach((listener) => listener());
}

/** A student's programme comes from their coach: shown, never edited. */
export function setAssignedProgram(next: WorkoutTemplate[]) {
  activeProgram = next;
  readOnly = true;
  listeners.forEach((listener) => listener());
}

export const isProgramReadOnly = (): boolean => readOnly;

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
