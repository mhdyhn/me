import { describe, expect, it } from 'vitest';
import { originalProgramCopy } from './programStore';
import { getExerciseGuide } from './exerciseGuide';
import { normalizeAdminProgramNames } from './programPersistence';

describe('legacy exercise-name normalization', () => {
  it('updates a legacy alias without changing its saved prescription', () => {
    const savedProgram = originalProgramCopy();
    const firstDay = savedProgram[0]!;
    firstDay.exercises[0] = { ...firstDay.exercises[0]!, exerciseId: 'admin-pec-deck', name: 'نام قدیمی',
      prescription: { ...firstDay.exercises[0]!.prescription, sets: 5 } };
    const result = normalizeAdminProgramNames(savedProgram, true);
    expect(result.changed).toBe(true);
    expect(result.program[0]!.exercises[0]!.name).toBe(getExerciseGuide('admin-pec-deck')!.name);
    expect(result.program[0]!.exercises[0]!.prescription.sets).toBe(5);
    expect(result.program[0]!.exercises.slice(1)).toEqual(firstDay.exercises.slice(1));
  });
});
