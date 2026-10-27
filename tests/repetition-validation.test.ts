import { describe, expect, it } from 'vitest';
import { isValidReps, normalizeReps } from '../shared/repetitions';
import { parseReps } from '../src/lib/assignedProgram';
import { validateProgramme } from '../server/programs.ts';

const exercise = { exerciseId: 'push-up', name: 'شنا', muscle: 'سینه', sets: 3, reps: '۸-۱۲', restSeconds: 60 };
const program = { title: 'برنامه', days: [{ name: 'روز اول', exercises: [exercise] }] };

describe('Persian input and programme validation', () => {
  it('normalizes Persian and Arabic digits and dash variants consistently', () => {
    expect(normalizeReps(' ۸ – ۱۲ ')).toBe('8-12');
    expect(parseReps(' ٨ — ١٢ ')).toEqual({ minReps: 8, maxReps: 12 });
    expect(validateProgramme(program).days[0]?.exercises[0]?.reps).toBe('8-12');
  });

  it.each(['', '0', '۰-۸', '۱۲-۸', '100', 'x', '1.5'])('rejects invalid repetition input %s', (reps) => {
    expect(isValidReps(reps)).toBe(false);
    expect(() => validateProgramme({ ...program, days: [{ name: 'روز', exercises: [{ ...exercise, reps }] }] })).toThrow();
  });

  it.each([-1, 1.5, '50000', 2147483648, NaN])('does not silently convert invalid price %s into a free plan', (priceTomans) => {
    expect(() => validateProgramme({ ...program, priceTomans })).toThrow(/قیمت/);
  });

  it('keeps an omitted or zero price free', () => {
    expect(validateProgramme(program).priceTomans).toBe(0);
    expect(validateProgramme({ ...program, priceTomans: 0 }).priceTomans).toBe(0);
  });
});
