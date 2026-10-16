import { describe, it, expect } from 'vitest';
import {
  getSessionTotals,
  getBestSet,
  getRecentRecord,
  getCurrentStreak,
  getProgressionAdvice,
} from '../src/lib/analytics';
import {
  calculateReadinessScore,
  calculateMuscleRecovery,
  type HealthMetrics,
} from '../src/lib/aiHealthEngine';
import type { WorkoutSession, ExercisePrescription } from '../src/types';

describe('Comprehensive System Audit: Analytics & Computations', () => {
  it('correctly calculates session totals (sets, reps, volume, duration)', () => {
    const started = new Date('2026-10-16T10:00:00Z').toISOString();
    const completed = new Date('2026-10-16T10:45:00Z').toISOString(); // 45 minutes = 2700s

    const session: WorkoutSession = {
      id: 'session-audit-1',
      templateId: 'day-1',
      name: 'تمرین سینه و بازو',
      startedAt: started,
      completedAt: completed,
      status: 'completed',
      notes: 'انرژی عالی بود',
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      exercises: [
        {
          exerciseId: 'barbell-bench-press',
          sets: [
            { setNumber: 1, weightKg: 60, reps: 10, rir: 2, doneAt: started },
            { setNumber: 2, weightKg: 65, reps: 8, rir: 1, doneAt: started },
            { setNumber: 3, weightKg: 70, reps: 6, rir: 0, doneAt: started },
          ],
        },
        {
          exerciseId: 'barbell-curl',
          sets: [
            { setNumber: 1, weightKg: 25, reps: 12, rir: 2, doneAt: started },
            { setNumber: 2, weightKg: 25, reps: 10, rir: 1, doneAt: started },
          ],
        },
        {
          exerciseId: 'empty-movement',
          sets: [], // unperformed exercise
        },
      ],
    };

    const totals = getSessionTotals(session);

    // Bench press volume: 60*10 (600) + 65*8 (520) + 70*6 (420) = 1540
    // Curl volume: 25*12 (300) + 25*10 (250) = 550
    // Total volume: 1540 + 550 = 2090 kg
    expect(totals.volumeKg).toBe(2090);

    // Total reps: 10 + 8 + 6 + 12 + 10 = 46
    expect(totals.repCount).toBe(46);

    // Total sets: 5
    expect(totals.setCount).toBe(5);

    // Only 2 exercises had logged sets (empty-movement is excluded)
    expect(totals.exerciseCount).toBe(2);

    // Duration: 45 minutes = 2700 seconds
    expect(totals.durationSeconds).toBe(2700);
  });

  it('correctly determines streaks and handles gaps', () => {
    const base = new Date('2026-10-16T12:00:00Z');

    // Case 1: Trained today (Oct 16), yesterday (Oct 15), and day before (Oct 14) -> 3 day streak
    const sessionsConsecutive: WorkoutSession[] = [
      {
        id: 's-1',
        templateId: 'day-1',
        name: 'جلسه ۱',
        startedAt: new Date(base.getTime() - 2 * 24 * 3600 * 1000).toISOString(),
        status: 'completed',
        notes: '',
        exercises: [],
        currentExerciseIndex: 0,
        currentSetIndex: 0,
      },
      {
        id: 's-2',
        templateId: 'day-2',
        name: 'جلسه ۲',
        startedAt: new Date(base.getTime() - 1 * 24 * 3600 * 1000).toISOString(),
        status: 'completed',
        notes: '',
        exercises: [],
        currentExerciseIndex: 0,
        currentSetIndex: 0,
      },
      {
        id: 's-3',
        templateId: 'day-3',
        name: 'جلسه ۳',
        startedAt: base.toISOString(),
        status: 'completed',
        notes: '',
        exercises: [],
        currentExerciseIndex: 0,
        currentSetIndex: 0,
      },
    ];

    expect(getCurrentStreak(sessionsConsecutive, base)).toBe(3);

    // Case 2: Gap 3 days ago -> streak resets
    const sessionsWithGap: WorkoutSession[] = [
      {
        id: 's-old',
        templateId: 'day-1',
        name: 'جلسه قدیمی',
        startedAt: new Date(base.getTime() - 5 * 24 * 3600 * 1000).toISOString(),
        status: 'completed',
        notes: '',
        exercises: [],
        currentExerciseIndex: 0,
        currentSetIndex: 0,
      },
    ];

    expect(getCurrentStreak(sessionsWithGap, base)).toBe(0);
  });

  it('correctly provides double-progression advice for gym movements', () => {
    const prescription: ExercisePrescription = {
      sets: 3,
      minReps: 8,
      maxReps: 12,
      targetRirLabel: '۲',
      minimumRir: 1,
      restSeconds: 90,
    };

    // Scenario A: Incomplete sets -> must finish prescribed sets first
    const adviceA = getProgressionAdvice(prescription, [
      { setNumber: 1, weightKg: 50, reps: 10, rir: 2, doneAt: '' },
      { setNumber: 2, weightKg: 50, reps: 9, rir: 2, doneAt: '' },
    ]);
    expect(adviceA.readyToIncrease).toBe(false);
    expect(adviceA.title).toContain('با همین وزنه، تکرارها را بیشتر کن');

    // Scenario B: Completed 3 sets but reps didn't reach max (e.g. 10, 9, 8)
    const adviceB = getProgressionAdvice(prescription, [
      { setNumber: 1, weightKg: 50, reps: 12, rir: 2, doneAt: '' },
      { setNumber: 2, weightKg: 50, reps: 11, rir: 2, doneAt: '' },
      { setNumber: 3, weightKg: 50, reps: 10, rir: 2, doneAt: '' },
    ]);
    expect(adviceB.readyToIncrease).toBe(false);
    expect(adviceB.title).toContain('وزنه را ثابت نگه دار');

    // Scenario C: Reached max reps on all sets with acceptable RIR (12, 12, 12 @ RIR 2)
    const adviceC = getProgressionAdvice(prescription, [
      { setNumber: 1, weightKg: 50, reps: 12, rir: 2, doneAt: '' },
      { setNumber: 2, weightKg: 50, reps: 12, rir: 2, doneAt: '' },
      { setNumber: 3, weightKg: 50, reps: 12, rir: 1, doneAt: '' },
    ]);
    expect(adviceC.readyToIncrease).toBe(true);
    expect(adviceC.title).toContain('می‌توانی افزایش کوچکی را بررسی کنی');
  });

  it('finds best sets and personal records accurately', () => {
    const sessions: WorkoutSession[] = [
      {
        id: 's1',
        templateId: 'day-1',
        name: 'جلسه ۱',
        startedAt: '2026-10-01T10:00:00Z',
        status: 'completed',
        notes: '',
        currentExerciseIndex: 0,
        currentSetIndex: 0,
        exercises: [
          {
            exerciseId: 'barbell-bench-press',
            sets: [
              { setNumber: 1, weightKg: 50, reps: 10, rir: 2, doneAt: '' },
              { setNumber: 2, weightKg: 50, reps: 10, rir: 1, doneAt: '' },
            ],
          },
        ],
      },
      {
        id: 's2',
        templateId: 'day-1',
        name: 'جلسه ۲',
        startedAt: '2026-10-08T10:00:00Z',
        status: 'completed',
        notes: '',
        currentExerciseIndex: 0,
        currentSetIndex: 0,
        exercises: [
          {
            exerciseId: 'barbell-bench-press',
            sets: [
              { setNumber: 1, weightKg: 55, reps: 8, rir: 2, doneAt: '' },
              { setNumber: 2, weightKg: 60, reps: 6, rir: 0, doneAt: '' },
            ],
          },
        ],
      },
    ];

    const bestSet = getBestSet(sessions, 'barbell-bench-press');
    expect(bestSet).not.toBeNull();
    expect(bestSet?.weightKg).toBe(60);
    expect(bestSet?.reps).toBe(6);

    const record = getRecentRecord(sessions);
    expect(record).not.toBeNull();
    expect(record?.weightKg).toBe(60);
    expect(record?.sessionId).toBe('s2');
  });
});

describe('Comprehensive System Audit: AI Health Engine', () => {
  it('computes realistic Whoop/Oura readiness score based on biometrics', () => {
    const peakMetrics: HealthMetrics = {
      sleepHours: 8.5,
      sleepQualityScore: 92,
      restingHeartRate: 50,
      heartRateVariability: 85,
      source: 'whoop',
      lastSyncedAt: new Date().toISOString(),
    };

    const readinessPeak = calculateReadinessScore(peakMetrics, []);
    expect(readinessPeak.score).toBeGreaterThanOrEqual(80);
    expect(readinessPeak.level).toBe('peak');
    expect(readinessPeak.levelLabel).toContain('آمادگی');

    const fatiguedMetrics: HealthMetrics = {
      sleepHours: 4.5,
      sleepQualityScore: 45,
      restingHeartRate: 75,
      heartRateVariability: 25,
      source: 'oura',
      lastSyncedAt: new Date().toISOString(),
    };

    const readinessFatigued = calculateReadinessScore(fatiguedMetrics, []);
    expect(readinessFatigued.score).toBeLessThan(60);
    expect(['recovery', 'fatigued']).toContain(readinessFatigued.level);
  });

  it('computes muscle recovery percentages across muscle zones', () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();

    const recentSession: WorkoutSession = {
      id: 'session-chest',
      templateId: 'day-1',
      name: 'تمرین سینه',
      startedAt: twoHoursAgo,
      completedAt: twoHoursAgo,
      status: 'completed',
      notes: '',
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      exercises: [
        {
          exerciseId: 'barbell-bench-press',
          sets: [
            { setNumber: 1, weightKg: 80, reps: 8, rir: 1, doneAt: twoHoursAgo },
            { setNumber: 2, weightKg: 80, reps: 8, rir: 1, doneAt: twoHoursAgo },
            { setNumber: 3, weightKg: 80, reps: 8, rir: 1, doneAt: twoHoursAgo },
          ],
        },
      ],
    };

    const recoveryStatuses = calculateMuscleRecovery([recentSession], now);
    const chestStatus = recoveryStatuses.find((z) => z.zoneKey === 'chest');

    expect(chestStatus).toBeDefined();
    // Chest was trained only 2 hours ago with heavy sets, so recovery is in progress
    expect(chestStatus!.recoveryPercent).toBeLessThan(85);
    expect(chestStatus!.status).toBe('recovering');
    expect(chestStatus!.hoursUntilFull).toBeGreaterThan(0);
  });
});
