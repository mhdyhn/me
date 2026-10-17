import { describe, expect, it } from 'vitest';
import { adminPersonalProgram } from '../data/adminProgram';
import { normalizeAdminProgramNames } from './programPersistence';

describe('admin programme name migration', () => {
  it('updates saved admin exercise labels without changing prescriptions', () => {
    const savedProgram = structuredClone(adminPersonalProgram);
    const firstDay = savedProgram[0]!;
    const oldExercise = firstDay.exercises[0]!;
    firstDay.exercises[0] = {
      ...oldExercise,
      name: 'پرس بالاسینه دستگاه یا دمبل',
      prescription: { ...oldExercise.prescription, sets: 5 },
    };

    const result = normalizeAdminProgramNames(savedProgram, true);
    const updatedExercise = result.program[0]!.exercises[0]!;

    expect(result.changed).toBe(true);
    expect(updatedExercise.name).toBe(adminPersonalProgram[0]!.exercises[0]!.name);
    expect(updatedExercise.prescription.sets).toBe(5);
    expect(result.program[0]!.exercises.slice(1)).toEqual(firstDay.exercises.slice(1));
  });
});
