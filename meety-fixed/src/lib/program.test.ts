import { describe, expect, it } from 'vitest';
import { getProgramWeek, getWeekPrescription, getWeekSchedule } from './program';
import type { WorkoutSession } from '../types';

const sessions = (count: number): WorkoutSession[] => Array.from({ length: count }, (_, index) => ({
  id: `s-${index}`, templateId: ['push-a', 'pull-a', 'legs-a', 'upper-b', 'lower-b'][index % 5]!,
  name: 'session', startedAt: new Date(2026, 0, 5 + index).toISOString(), status: 'completed', notes: '',
  exercises: [], currentExerciseIndex: 0, currentSetIndex: 0,
}));

describe('eight-week program', () => {
  it('advances one week after each block of five primary sessions and caps at week eight', () => {
    expect(getProgramWeek([])).toBe(1);
    expect(getProgramWeek(sessions(5))).toBe(2);
    expect(getProgramWeek(sessions(35))).toBe(8);
  });

  it('reduces volume in the deload week instead of telling the user to add load', () => {
    const base = { sets: 4, minReps: 6, maxReps: 10, targetRirLabel: '2', minimumRir: 2, restSeconds: 120 };
    const deload = getWeekPrescription(base, 5);
    expect(deload.sets).toBe(3);
    expect(deload.minimumRir).toBe(3);
  });

  it('maps Monday through Friday to the five primary workouts and weekends to rest', () => {
    expect(getWeekSchedule(new Date(2026, 9, 5))?.id).toBe('push-a');
    expect(getWeekSchedule(new Date(2026, 9, 10))).toBeNull();
    expect(getWeekSchedule(new Date(2026, 9, 11))).toBeNull();
  });
});
