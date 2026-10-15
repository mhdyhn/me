import { describe, expect, it } from 'vitest';
import {
  calculateMuscleRecovery,
  calculateReadinessScore,
  classifyFoodCaloricDensity,
  DEFAULT_HEALTH_METRICS,
  HINGE_JOINT_ROUTINES,
  NOOM_CALORIC_CATEGORIES,
} from './aiHealthEngine';
import type { WorkoutSession } from '../types';

describe('aiHealthEngine', () => {
  describe('calculateReadinessScore (Whoop & Oura style)', () => {
    it('returns high readiness score when sleep is good and no recent fatigue', () => {
      const metrics = {
        ...DEFAULT_HEALTH_METRICS,
        sleepHours: 8.5,
        sleepQualityScore: 92,
        restingHeartRate: 52,
        heartRateVariability: 80,
      };
      const result = calculateReadinessScore(metrics, []);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.level).toBe('peak');
      expect(result.dailyStrain).toBeLessThanOrEqual(5);
      expect(result.coachRecommendation).toContain('بیش‌باری تدریجی');
    });

    it('reduces readiness score when sleep is poor and workload is high', () => {
      const now = new Date('2026-10-14T10:00:00Z');
      const heavySession: WorkoutSession = {
        id: 's1',
        templateId: 't1',
        name: 'تمرین سنگین',
        startedAt: new Date(now.getTime() - 10 * 3600 * 1000).toISOString(),
        completedAt: new Date(now.getTime() - 9 * 3600 * 1000).toISOString(),
        status: 'completed',
        notes: '',
        currentExerciseIndex: 0,
        currentSetIndex: 0,
        exercises: [
          {
            exerciseId: 'barbell-bench-press',
            sets: [
              { setNumber: 1, reps: 10, weightKg: 100, rir: 1, doneAt: now.toISOString() },
              { setNumber: 2, reps: 10, weightKg: 100, rir: 1, doneAt: now.toISOString() },
              { setNumber: 3, reps: 10, weightKg: 100, rir: 1, doneAt: now.toISOString() },
              { setNumber: 4, reps: 10, weightKg: 100, rir: 1, doneAt: now.toISOString() },
            ],
          },
          {
            exerciseId: 'barbell-squat',
            sets: [
              { setNumber: 1, reps: 10, weightKg: 140, rir: 0, doneAt: now.toISOString() },
              { setNumber: 2, reps: 10, weightKg: 140, rir: 0, doneAt: now.toISOString() },
              { setNumber: 3, reps: 10, weightKg: 140, rir: 0, doneAt: now.toISOString() },
              { setNumber: 4, reps: 10, weightKg: 140, rir: 0, doneAt: now.toISOString() },
            ],
          },
        ],
      };

      const poorMetrics = {
        ...DEFAULT_HEALTH_METRICS,
        sleepHours: 4.5,
        sleepQualityScore: 40,
        restingHeartRate: 72,
        heartRateVariability: 35,
      };

      const result = calculateReadinessScore(poorMetrics, [heavySession], now);
      expect(result.score).toBeLessThan(60);
      expect(result.dailyStrain).toBeGreaterThan(10);
    });
  });

  describe('calculateMuscleRecovery (Fitbod style)', () => {
    it('reports all muscles as fresh 100% when no recent sessions exist', () => {
      const recoveries = calculateMuscleRecovery([]);
      expect(recoveries.length).toBe(7);
      for (const rec of recoveries) {
        expect(rec.recoveryPercent).toBe(100);
        expect(rec.status).toBe('fresh');
        expect(rec.hoursUntilFull).toBe(0);
      }
    });

    it('calculates fatigue and recovery for chest after recent bench press', () => {
      const now = new Date('2026-10-14T12:00:00Z');
      const session: WorkoutSession = {
        id: 's2',
        templateId: 't1',
        name: 'سینه و پشت بازو',
        startedAt: new Date(now.getTime() - 4 * 3600 * 1000).toISOString(),
        completedAt: new Date(now.getTime() - 3 * 3600 * 1000).toISOString(),
        status: 'completed',
        notes: '',
        currentExerciseIndex: 0,
        currentSetIndex: 0,
        exercises: [
          {
            exerciseId: 'barbell-bench-press',
            sets: [
              { setNumber: 1, reps: 8, weightKg: 80, rir: 1, doneAt: now.toISOString() },
              { setNumber: 2, reps: 8, weightKg: 80, rir: 1, doneAt: now.toISOString() },
              { setNumber: 3, reps: 8, weightKg: 80, rir: 1, doneAt: now.toISOString() },
              { setNumber: 4, reps: 8, weightKg: 80, rir: 1, doneAt: now.toISOString() },
            ],
          },
        ],
      };

      const recoveries = calculateMuscleRecovery([session], now);
      const chest = recoveries.find((r) => r.zoneKey === 'chest');
      const quads = recoveries.find((r) => r.zoneKey === 'quads');

      expect(chest).toBeDefined();
      expect(quads).toBeDefined();

      // Chest should have reduced recovery
      expect(chest!.recoveryPercent).toBeLessThan(90);
      expect(chest!.hoursUntilFull).toBeGreaterThan(0);

      // Quads were not worked so should be 100% fresh
      expect(quads!.recoveryPercent).toBe(100);
      expect(quads!.status).toBe('fresh');
    });
  });

  describe('Hinge Health Prehab routines', () => {
    it('has complete prehab protocols for all major joints', () => {
      const joints = ['knees', 'shoulders', 'lowerBack', 'neck', 'wristsElbows'] as const;
      for (const joint of joints) {
        const routine = HINGE_JOINT_ROUTINES[joint];
        expect(routine).toBeDefined();
        expect(routine.exercises.length).toBeGreaterThanOrEqual(2);
        for (const ex of routine.exercises) {
          expect(ex.id).toBeTruthy();
          expect(ex.name).toBeTruthy();
          expect(ex.instructions).toBeTruthy();
        }
      }
    });
  });

  describe('Noom Caloric Density classification', () => {
    it('classifies fruits and vegetables as green', () => {
      expect(classifyFoodCaloricDensity('سیب قرمز')).toBe('green');
      expect(classifyFoodCaloricDensity('سالاد کاهو و خیار')).toBe('green');
      expect(classifyFoodCaloricDensity('اسفناج پخته')).toBe('green');
      expect(classifyFoodCaloricDensity('جو دوسر پرک')).toBe('green');
    });

    it('classifies lean proteins and staples as yellow', () => {
      expect(classifyFoodCaloricDensity('سینه مرغ گریل')).toBe('yellow');
      expect(classifyFoodCaloricDensity('فیله سالمون')).toBe('yellow');
      expect(classifyFoodCaloricDensity('نان سنگک')).toBe('yellow');
    });

    it('classifies calorie dense foods as red', () => {
      expect(classifyFoodCaloricDensity('شکلات تلخ')).toBe('red');
      expect(classifyFoodCaloricDensity('روغن زیتون')).toBe('red');
      expect(classifyFoodCaloricDensity('پیتزا مخصوص')).toBe('red');
      expect(classifyFoodCaloricDensity('آجیل مخلوط')).toBe('red');
    });

    it('has definitions for all three caloric categories', () => {
      expect(NOOM_CALORIC_CATEGORIES.green.color).toBeTruthy();
      expect(NOOM_CALORIC_CATEGORIES.yellow.color).toBeTruthy();
      expect(NOOM_CALORIC_CATEGORIES.red.color).toBeTruthy();
    });

    it('saves and deletes mindful nutrition logs', async () => {
      const { saveMindfulLog, deleteMindfulLog, getStoredMindfulLogs } = await import('./aiHealthEngine');
      const created = saveMindfulLog({
        foodName: 'سیب تست',
        trigger: 'physical_hunger',
        category: 'green',
      });

      expect(getStoredMindfulLogs().some((l) => l.id === created.id)).toBe(true);

      const remaining = deleteMindfulLog(created.id);
      expect(remaining.some((l) => l.id === created.id)).toBe(false);
      expect(getStoredMindfulLogs().some((l) => l.id === created.id)).toBe(false);
    });
  });
});
