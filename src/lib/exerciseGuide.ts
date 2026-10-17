import type { ExerciseDefinition } from '../types';
import { exerciseById } from '../data/exercises';
import { adminExerciseVisualId, getAdminExerciseGuide } from '../data/adminExerciseGuides';

/** Resolve normal catalogue movements and the admin programme's fully documented aliases. */
export function getExerciseGuide(id: string): ExerciseDefinition | undefined {
  return exerciseById(id) ?? getAdminExerciseGuide(id, exerciseById);
}

/** Use an existing demonstration figure when a plan-only alias points to a catalogued move. */
export function getExerciseVisualId(id: string): string {
  return adminExerciseVisualId(id) ?? id;
}
