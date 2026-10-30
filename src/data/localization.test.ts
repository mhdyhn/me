import { describe, expect, it } from 'vitest';
import { blankProfile, localizeKnownProfileCopy } from './profile';
import { exercises } from './exercises';
import { categoryLabels, difficultyLabels } from '../lib/labels';
import { workoutTemplates } from './workouts';

const hasPersian = (value: string) => /[\u0600-\u06FF]/.test(value);

describe('Persian training content', () => {
  it('provides Persian descriptions and labels for every exercise', () => {
    expect(exercises).toHaveLength(191); // 33 core library movements + 36 programme movements + 122 Lyfta gym movements
    for (const exercise of exercises) {
      const visibleCopy = [
        exercise.name,
        ...exercise.primaryMuscles,
        ...exercise.secondaryMuscles,
        ...exercise.equipment,
        exercise.setup,
        exercise.startPosition,
        ...exercise.execution,
        exercise.finishPosition,
        exercise.breathing,
        exercise.tempo,
        ...(exercise.referenceNote ? [exercise.referenceNote] : []),
        ...exercise.commonMistakes,
        ...exercise.safetyCues,
        ...exercise.movementPhases.flatMap((phase) => [phase.label, phase.instruction]),
        ...(exercise.machineSetup ? [exercise.machineSetup.title, ...exercise.machineSetup.points] : []),
      ];
      expect(visibleCopy.every(hasPersian), exercise.id).toBe(true);
    }
  });

  it('provides standard English names for every exercise in the catalogue', () => {
    expect(exercises).toHaveLength(191);
    for (const exercise of exercises) {
      expect(exercise.englishName).toBeDefined();
      expect(typeof exercise.englishName).toBe('string');
      expect(exercise.englishName!.trim().length).toBeGreaterThan(0);
      expect(hasPersian(exercise.englishName!)).toBe(false);
    }
  });

  it('uses Persian labels for exercise categories and difficulty levels', () => {
    expect(Object.values(categoryLabels).every(hasPersian)).toBe(true);
    expect(Object.values(difficultyLabels).every(hasPersian)).toBe(true);
  });

  it('uses Persian names and descriptions for all programmed workouts', () => {
    for (const workout of workoutTemplates) {
      expect([workout.name, workout.dayLabel, workout.focus, workout.description].every(hasPersian), workout.id).toBe(true);
      expect(workout.exercises.every(({ prescription }) =>
        !prescription.note || hasPersian(prescription.note),
      ), workout.id).toBe(true);
    }
    expect(workoutTemplates.flatMap((workout) => workout.exercises).every((item) => hasPersian(item.name))).toBe(true);
  });

  it('localizes generic legacy gender labels without replacing personal text or references', () => {
    const saved = {
      ...blankProfile,
      sex: 'Female',
      primaryGoal: 'هدف شخصی کاربر',
      workingWeightReferences: [{ label: 'حرکت آزمایشی', weightKg: 12, note: 'یادداشت شخصی' }],
    };
    const localized = localizeKnownProfileCopy(saved);
    expect(localized.sex).toBe('زن');
    expect(localized.primaryGoal).toBe(saved.primaryGoal);
    expect(localized.workingWeightReferences).toEqual(saved.workingWeightReferences);
    expect(localizeKnownProfileCopy({ ...saved, sex: '' }).sex).toBe('');
  });
});
