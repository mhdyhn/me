import { afterEach, describe, expect, it } from 'vitest';
import { personalDbName, LEGACY_DB_NAME } from '../src/lib/accountScope';
import { assignedToTemplates, parseReps } from '../src/lib/assignedProgram';

afterEach(() => {
  window.localStorage.removeItem('meety.account-scope');
});

describe('personal data per account', () => {
  it('gives every account its own database, and the developer keeps the original one', () => {
    window.localStorage.removeItem('meety.account-scope');
    expect(personalDbName()).toBe('meety-personal-signedout');
    window.localStorage.setItem('meety.account-scope', 'owner');
    expect(personalDbName()).toBe(LEGACY_DB_NAME);
    window.localStorage.setItem('meety.account-scope', 'user-5');
    expect(personalDbName()).toBe('meety-personal-user-5');
  });
});

describe('coach programme for students', () => {
  it('reads repetition ranges', () => {
    expect(parseReps('8-12')).toEqual({ minReps: 8, maxReps: 12 });
    expect(parseReps('10')).toEqual({ minReps: 10, maxReps: 10 });
    expect(parseReps('abc')).toEqual({ minReps: 8, maxReps: 12 });
  });

  it('maps the coach programme to the shape every screen already uses', () => {
    const [day] = assignedToTemplates({
      title: 'برنامهٔ تست',
      updatedAt: '2026-10-01T00:00:00Z',
      days: [{ name: 'روز اول', exercises: [{ exerciseId: 'barbell-bench-press', name: 'پرس سینه', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 }] }],
    });
    expect(day).toMatchObject({ id: 'assigned-day-1', name: 'روز اول', dayLabel: 'روز ۱'.replace('۱', '1'), focus: 'سینه' });
    expect(day!.exercises[0]).toMatchObject({ exerciseId: 'barbell-bench-press', prescription: { sets: 3, minReps: 8, maxReps: 12, restSeconds: 90 } });
  });
});
