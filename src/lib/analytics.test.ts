import { describe, expect, it } from 'vitest';
import { workoutTemplates } from '../data/workouts';
import { exerciseById, exercises } from '../data/exercises';
import { getCompletedThisWeek, getProgressionAdvice, getRecentRecord, getSessionTotals } from './analytics';
import type { WorkoutSession } from '../types';

const sampleSession: WorkoutSession = {
  id: 'session-1', templateId: 'day-1', name: 'روز ۱: سینه و سرشانه', startedAt: '2026-10-07T08:00:00.000Z',
  completedAt: '2026-10-07T09:00:00.000Z', status: 'completed', notes: '', currentExerciseIndex: 0, currentSetIndex: 0,
  exercises: [{ exerciseId: 'barbell-bench-press', sets: [
    { setNumber: 1, weightKg: 20, reps: 8, rir: 2, doneAt: '2026-10-07T08:10:00.000Z' },
    { setNumber: 2, weightKg: 20, reps: 7, rir: 2, doneAt: '2026-10-07T08:13:00.000Z' },
  ] }],
};

describe('training data integrity', () => {
  it('gives every programmed movement a name, and links the ones the 3D library covers', () => {
    const items = workoutTemplates.flatMap((workout) => workout.exercises);
    expect(items.filter((item) => !item.name)).toEqual([]);
    const ids = new Set(exercises.map((exercise) => exercise.id));
    const linked = items.filter((item) => ids.has(item.exerciseId));
    expect(linked.length).toBeGreaterThan(0);
    expect(linked.every((item) => exerciseById(item.exerciseId))).toBe(true);
  });

  it('calculates session totals from logged sets only', () => {
    expect(getSessionTotals(sampleSession)).toMatchObject({ exerciseCount: 1, setCount: 2, repCount: 15, volumeKg: 300 });
  });

  it('counts completed sessions in the local Monday-to-Sunday week', () => {
    expect(getCompletedThisWeek([sampleSession], new Date('2026-10-07T12:00:00.000Z'))).toBe(1);
    expect(getCompletedThisWeek([{ ...sampleSession, startedAt: '2026-09-30T08:00:00.000Z' }], new Date('2026-10-07T12:00:00.000Z'))).toBe(0);
    expect(getCompletedThisWeek([{ ...sampleSession, templateId: 'retired-template' }], new Date('2026-10-07T12:00:00.000Z'))).toBe(0);
  });

  it('does not call a first logged set a personal record before a comparison exists', () => {
    expect(getRecentRecord([sampleSession])).toBeNull();
    const later = { ...sampleSession, id: 'session-2', startedAt: '2026-10-10T08:00:00.000Z', completedAt: '2026-10-10T09:00:00.000Z', exercises: [{ exerciseId: 'barbell-bench-press', sets: [{ setNumber: 1, weightKg: 21, reps: 6, rir: 2, doneAt: '2026-10-10T08:10:00.000Z' }] }] };
    expect(getRecentRecord([sampleSession, later])).toMatchObject({ exerciseId: 'barbell-bench-press', weightKg: 21, reps: 6, sessionId: 'session-2' });
  });
});

describe('double progression', () => {
  const prescription = { sets: 4, minReps: 6, maxReps: 8, targetRirLabel: '2', minimumRir: 2, restSeconds: 150 };

  it('does not recommend adding weight when all sets are not at the top of the range', () => {
    const sets = [8, 8, 7, 6].map((reps, index) => ({ setNumber: index + 1, weightKg: 20, reps, rir: 2, doneAt: '' }));
    expect(getProgressionAdvice(prescription, sets).readyToIncrease).toBe(false);
  });

  it('only suggests considering an increase after every set reaches the top range with sufficient RIR', () => {
    const sets = [8, 8, 8, 8].map((reps, index) => ({ setNumber: index + 1, weightKg: 20, reps, rir: 2, doneAt: '' }));
    expect(getProgressionAdvice(prescription, sets).readyToIncrease).toBe(true);
    expect(getProgressionAdvice(prescription, sets.slice(0, 3)).readyToIncrease).toBe(false);
  });
});
