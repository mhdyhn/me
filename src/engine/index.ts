/**
 * Public interface of the exercise engine. The host app imports from here only.
 *
 *   import { openExercise, appExerciseConfigs } from '../engine';
 *   const result = openExercise('barbell-bench-press');
 *
 * See docs/engine/README.md for the integration guide.
 */
import { createRegistry, type ExerciseRegistry, type OpenResult } from './registry';
import { appExerciseConfigs, appMotionIds } from './catalog';

export * from './schema';
export * from './playback';
export * from './camera';
export * from './errors';
export * from './assets';
export * from './registry';
export * from './muscles';
export { buildConfig, appExerciseConfigs, appMotionIds } from './catalog';

let registry: ExerciseRegistry | null = null;

/** The registry of the app's exercises, validated once on first use. */
export function engineRegistry(): ExerciseRegistry {
  registry ??= createRegistry(appExerciseConfigs(), { motionIds: appMotionIds() });
  return registry;
}

/** Resolves an exercise id to its configuration, or to a reason it cannot be shown. */
export function openExercise(id: unknown): OpenResult {
  return engineRegistry().open(id);
}
export { hasWebGL, deviceProblem } from './device';
