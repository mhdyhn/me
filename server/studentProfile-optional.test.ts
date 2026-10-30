import { describe, expect, it } from 'vitest';
import { validateStudentProfile } from './studentProfile.ts';
import { sampleProfile } from '../tests/fixtures/profile';

describe('optional unsupplied training fields', () => {
  it('accepts an explicit missing value without supplying anyone else’s information', () => {
    expect(validateStudentProfile({ profile: { ...sampleProfile, trainingDays: 0, sessionMinutes: 0 } }))
      .toMatchObject({ trainingDays: 0, sessionMinutes: 0 });
  });
  it('still rejects invalid nonempty durations and negative training days', () => {
    expect(() => validateStudentProfile({ profile: { ...sampleProfile, sessionMinutes: 10 } })).toThrow();
    expect(() => validateStudentProfile({ profile: { ...sampleProfile, trainingDays: -1 } })).toThrow();
  });
});
