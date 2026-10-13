import { describe, expect, it } from 'vitest';
import { defaultProfile, localizeKnownProfileCopy } from './profile';
import { exercises } from './exercises';
import { categoryLabels, difficultyLabels } from '../lib/labels';
import { workoutTemplates } from './workouts';

const hasPersian = (value: string) => /[\u0600-\u06FF]/.test(value);

describe('Persian training content', () => {
  it('provides Persian descriptions and labels for every exercise', () => {
    expect(exercises).toHaveLength(56); // 33 library movements + 23 programme-only movements
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
    expect(exercises).toHaveLength(56);
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

  it('localizes known legacy defaults but preserves personal profile text', () => {
    const legacy = {
      ...defaultProfile,
      sex: 'Male',
      primaryGoal: 'Muscle gain · hypertrophy · strength',
      secondaryGoal: 'Balanced development',
      trainingExperience: 'About 1 year total, with interruptions',
      dailyActivity: 'Mostly sedentary desk work',
      sleepHours: '7–8 hours',
      injuries: 'No current injuries or known limitations reported',
      equipment: 'Full gym: barbells, dumbbells, cables, machines, rack, benches and leg equipment',
      workingWeightReferences: [
        { label: 'Bench press', weightKg: 20, note: 'Working-weight reference; sets and reps not confirmed.' },
        ...defaultProfile.workingWeightReferences.slice(1),
      ],
    };
    const localized = localizeKnownProfileCopy(legacy);
    expect(localized.sex).toBe('مرد');
    expect(localized.primaryGoal).toBe(defaultProfile.primaryGoal);
    expect(localized.workingWeightReferences[0]).toEqual(defaultProfile.workingWeightReferences[0]);

    const personal = localizeKnownProfileCopy({ ...defaultProfile, primaryGoal: 'ماراتن و قدرت شخصی' });
    expect(personal.primaryGoal).toBe('ماراتن و قدرت شخصی');
  });
});
