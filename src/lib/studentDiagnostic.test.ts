import { describe, expect, it } from 'vitest';
import { runStudentDiagnostic } from './studentDiagnostic';
import { calculateHeartRateZones } from './studentAiBiometrics';

describe('Coach Diagnostic Engine: چرا شاگرد جواب نگرفته؟', () => {
  it('detects when no sessions are logged', () => {
    const report = runStudentDiagnostic([]);
    expect(report.overallStatus).toBe('needs_attention');
    expect(report.issues[0]?.id).toBe('no_sessions');
  });

  it('detects stalled progressive overload when weights and volume do not increase', () => {
    const flatSessions = [
      {
        startedAt: '2026-09-01T10:00:00Z',
        exercises: [{ exerciseId: 'bench-press', sets: [{ weightKg: 80, reps: 10, rir: 2 }] }],
      },
      {
        startedAt: '2026-09-05T10:00:00Z',
        exercises: [{ exerciseId: 'bench-press', sets: [{ weightKg: 80, reps: 10, rir: 2 }] }],
      },
      {
        startedAt: '2026-09-12T10:00:00Z',
        exercises: [{ exerciseId: 'bench-press', sets: [{ weightKg: 80, reps: 10, rir: 2 }] }],
      },
      {
        startedAt: '2026-09-20T10:00:00Z',
        exercises: [{ exerciseId: 'bench-press', sets: [{ weightKg: 80, reps: 10, rir: 2 }] }],
      },
    ];

    const report = runStudentDiagnostic(flatSessions);
    expect(report.metrics.progressiveOverloadTrend).toBe('flat');
    const overloadIssue = report.issues.find((i) => i.category === 'overload');
    expect(overloadIssue).toBeDefined();
    expect(overloadIssue?.title).toContain('فلات و توقف اضافه‌بار تدریجی');
    expect(overloadIssue?.recommendation).toContain('Double Progression');
  });

  it('detects low intensity when sets have high RIR', () => {
    const easySessions = [
      {
        startedAt: '2026-09-01T10:00:00Z',
        exercises: [{ exerciseId: 'squat', sets: [{ weightKg: 60, reps: 8, rir: 4 }, { weightKg: 60, reps: 8, rir: 5 }] }],
      },
      {
        startedAt: '2026-09-08T10:00:00Z',
        exercises: [{ exerciseId: 'squat', sets: [{ weightKg: 60, reps: 8, rir: 4 }, { weightKg: 60, reps: 8, rir: 4 }] }],
      },
    ];

    const report = runStudentDiagnostic(easySessions);
    const rirIssue = report.issues.find((i) => i.category === 'intensity');
    expect(rirIssue).toBeDefined();
    expect(rirIssue?.title).toContain('شدت و تلاش ناکافی در ست‌ها');
  });

  it('detects elevated resting heart rate indicating systemic fatigue', () => {
    const mockBio = {
      studentId: 101,
      enabledModules: ['recovery'] as any,
      age: 26,
      restingHr: 82, // elevated > 78
      maxHr: 190,
      maxHrMethod: 'tanaka' as const,
      limitations: '',
      contraindicatedMovements: [],
      zones: calculateHeartRateZones(190, 82),
      updatedAt: null,
    };

    const sessions = [
      {
        startedAt: '2026-09-01T10:00:00Z',
        exercises: [{ exerciseId: 'row', sets: [{ weightKg: 50, reps: 10, rir: 2 }] }],
      },
    ];

    const report = runStudentDiagnostic(sessions, mockBio);
    const recoveryIssue = report.issues.find((i) => i.category === 'recovery');
    expect(recoveryIssue).toBeDefined();
    expect(recoveryIssue?.title).toContain('ضربان استراحت بالا');
    expect(recoveryIssue?.recommendation).toContain('دیلود');
  });

  it('identifies orthopedic constraints and warns coach', () => {
    const mockBio = {
      studentId: 102,
      enabledModules: ['hinge'] as any,
      age: 35,
      restingHr: 62,
      maxHr: 184,
      maxHrMethod: 'tanaka' as const,
      limitations: 'فتق دیسک کمری L5-S1 و منع اسکات سنگین',
      contraindicatedMovements: [],
      zones: calculateHeartRateZones(184, 62),
      updatedAt: null,
    };

    const report = runStudentDiagnostic(
      [{ startedAt: '2026-09-01T10:00:00Z', exercises: [{ exerciseId: 'lat-pulldown', sets: [{ weightKg: 40, reps: 10 }] }] }],
      mockBio,
    );

    const orthopedicIssue = report.issues.find((i) => i.category === 'orthopedic');
    expect(orthopedicIssue).toBeDefined();
    expect(orthopedicIssue?.explanation).toContain('فتق دیسک کمری');
  });
});
