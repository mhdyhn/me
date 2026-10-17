import { describe, expect, it } from 'vitest';
import { adminPersonalProgram } from '../data/adminProgram';
import { exercises } from '../data/exercises';
import { getExerciseGuide, getExerciseVisualId } from './exerciseGuide';

describe('admin personal plan exercise education', () => {
  it('provides a complete, working guide for every movement in every day', () => {
    for (const day of adminPersonalProgram) {
      for (const item of day.exercises) {
        const guide = getExerciseGuide(item.exerciseId);
        expect(guide, `${day.dayLabel} / ${item.name}`).toBeDefined();
        expect(guide?.setup).toBeTruthy();
        expect(guide?.startPosition).toBeTruthy();
        expect(guide?.execution.length).toBeGreaterThanOrEqual(3);
        expect(guide?.finishPosition).toBeTruthy();
        expect(guide?.breathing).toBeTruthy();
        expect(guide?.tempo).toBeTruthy();
        expect(guide?.commonMistakes.length).toBeGreaterThan(0);
        expect(guide?.safetyCues.length).toBeGreaterThan(0);
        expect(guide?.movementPhases.length).toBeGreaterThanOrEqual(5);
        expect(guide?.id).toBe(item.exerciseId);
        expect(exercises.some((exercise) => exercise.id === getExerciseVisualId(item.exerciseId))).toBe(true);
      }
    }
  });
});
