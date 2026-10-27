import { describe, expect, it } from 'vitest';
import { workoutTemplates } from '../data/workouts';
import { exerciseById, exercises } from '../data/exercises';
import { getCompletedThisWeek, getNextWorkout, getProgressionAdvice, getRecentRecord, getSessionTotals } from './analytics';
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

  it('rotates to next sequential workout day when session is completed', () => {
    // When no completed sessions exist, next workout is day-1
    expect(getNextWorkout([])?.id).toBe('day-1');

    // When day-1 is completed, next workout is day-2
    expect(getNextWorkout([sampleSession])?.id).toBe('day-2');

    // When day-2 is completed, next workout is day-3
    const day2Completed: WorkoutSession = {
      ...sampleSession,
      id: 'session-2',
      templateId: 'day-2',
      startedAt: '2026-10-08T08:00:00.000Z',
      completedAt: '2026-10-08T09:00:00.000Z',
    };
    expect(getNextWorkout([sampleSession, day2Completed])?.id).toBe('day-3');

    // Active (uncompleted) sessions do not advance the sequence prematurely
    const activeSession: WorkoutSession = {
      ...sampleSession,
      id: 'session-3',
      templateId: 'day-3',
      status: 'active',
      startedAt: '2026-10-09T08:00:00.000Z',
      completedAt: undefined,
    };
    expect(getNextWorkout([sampleSession, day2Completed, activeSession])?.id).toBe('day-3');
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

  it('compares against earlier sessions and scales to a long training history', () => {
    const data = Array.from({ length: 5000 }, (_, index) => ({
      ...sampleSession, id: `session-${index}`, startedAt: new Date(Date.UTC(2020, 0, 1 + index)).toISOString(),
      exercises: [{ exerciseId: 'barbell-bench-press', sets: [
        { setNumber: 1, weightKg: index + 20, reps: 8, rir: 2, doneAt: '' },
        { setNumber: 2, weightKg: index + 19.5, reps: 8, rir: 2, doneAt: '' },
      ] }],
    }));
    // The last qualifying set is compared to earlier sessions, not the first set in its own session.
    expect(getRecentRecord(data)).toMatchObject({ sessionId: 'session-4999', weightKg: 5018.5 });
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
