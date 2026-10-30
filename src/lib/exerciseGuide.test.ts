import { describe, expect, it } from 'vitest';
import { adminExerciseIds } from '../data/adminExerciseGuides';
import { exercises } from '../data/exercises';
import { getExerciseGuide, getExerciseVisualId } from './exerciseGuide';

describe('legacy exercise aliases', () => {
  it('keeps complete guides for every legacy movement id without bundling a personal programme', () => {
    expect(adminExerciseIds().length).toBeGreaterThan(0);
    for (const id of adminExerciseIds()) {
      const guide = getExerciseGuide(id);
      expect(guide, id).toBeDefined();
      expect(guide?.setup).toBeTruthy();
      expect(guide?.startPosition).toBeTruthy();
      expect(guide?.execution.length).toBeGreaterThanOrEqual(3);
      expect(guide?.finishPosition).toBeTruthy();
      expect(guide?.breathing).toBeTruthy();
      expect(guide?.tempo).toBeTruthy();
      expect(guide?.commonMistakes.length).toBeGreaterThan(0);
      expect(guide?.safetyCues.length).toBeGreaterThan(0);
      expect(guide?.movementPhases.length).toBeGreaterThanOrEqual(5);
      expect(guide?.id).toBe(id);
      expect(exercises.some((exercise) => exercise.id === getExerciseVisualId(id))).toBe(true);
    }
  });
});
