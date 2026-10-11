import { describe, expect, it } from 'vitest';
import { workoutTemplates } from '../data/workouts';
import { finalizeProgram, newDay, newExercise, validateProgram } from './programRules';
import { originalProgramCopy } from './programStore';

describe('programme rules', () => {
  it('accepts the original RAGE programme', () => {
    expect(validateProgram(originalProgramCopy())).toEqual([]);
  });

  it('rejects an empty programme and a programme with only optional days', () => {
    expect(validateProgram([])).not.toEqual([]);
    const onlyOptional = originalProgramCopy().map((day) => ({ ...day, optional: true }));
    expect(validateProgram(onlyOptional)).toContain('برنامه باید حداقل یک روز اصلی (غیر اختیاری) داشته باشد.');
  });

  it('checks set, rep and rest ranges', () => {
    const program = originalProgramCopy();
    const exercise = program[0]!.exercises[0]!;
    exercise.prescription.sets = 0;
    exercise.prescription.minReps = 10;
    exercise.prescription.maxReps = 8;
    exercise.prescription.restSeconds = -5;
    const errors = validateProgram(program);
    expect(errors.some((message) => message.includes('تعداد ست'))).toBe(true);
    expect(errors.some((message) => message.includes('حداکثر تکرار'))).toBe(true);
    expect(errors.some((message) => message.includes('استراحت'))).toBe(true);
  });

  it('flags days without a name, focus or exercises', () => {
    const errors = validateProgram([{ ...newDay(), name: ' ', focus: '' }]);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('نام ندارد'),
      expect.stringContaining('بدون عضلهٔ هدف'),
      expect.stringContaining('هیچ حرکتی ندارد'),
    ]));
  });

  it('recalculates day labels and durations from order and contents', () => {
    const day = { ...newDay(), name: '  روز تست  ', focus: 'پا', exercises: [newExercise('custom-x', 'اسکوات')] };
    const [first] = finalizeProgram([day]);
    expect(first?.name).toBe('روز تست');
    expect(first?.dayLabel).toBe('روز ۰۱');
    expect(first?.durationMinutes).toBeGreaterThan(0);
    expect(validateProgram(finalizeProgram([day]))).toEqual([]);
  });

  it('keeps the original programme untouched when copies are edited', () => {
    const copy = originalProgramCopy();
    copy[0]!.name = 'تغییر یافته';
    expect(workoutTemplates[0]!.name).not.toBe('تغییر یافته');
  });
});
