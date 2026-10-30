import { describe, expect, it } from 'vitest';
import { parseProgramFile, programFileText } from './programFile';
import type { WorkoutTemplate } from '../types';

const sample: WorkoutTemplate[] = [{
  id: 'day-1', name: 'روز نمونه', focus: 'تمرین نمونه', dayLabel: 'روز اول', durationMinutes: 40, description: '',
  exercises: [{ exerciseId: 'push-up', name: 'شنا', prescription: { sets: 3, minReps: 8, maxReps: 12, restSeconds: 60, targetRirLabel: '۲', minimumRir: 2 } }],
}];

describe('explicit personal programme files', () => {
  it('round-trips program data and ignores other data in a private file', () => {
    expect(parseProgramFile(programFileText(sample))).toEqual(sample);
    const withExtras = { programme: [{ ...sample[0], secret: 'not imported', exercises: [{ ...sample[0]!.exercises[0], privateField: 'ignored' }] }], profile: { age: 99 }, guidelines: ['not imported'] };
    expect(parseProgramFile(JSON.stringify(withExtras))).toEqual(sample);
  });
  it('rejects corrupt or incompatible files and never guesses a programme from another backup', () => {
    expect(() => parseProgramFile('{')).toThrow(/JSON/);
    expect(() => parseProgramFile(JSON.stringify({ profile: {}, sessions: [] }))).toThrow(/برنامه/);
    expect(() => parseProgramFile(JSON.stringify({ programme: [] }))).toThrow(/برنامه/);
    expect(() => parseProgramFile(JSON.stringify({ programme: [{ ...sample[0], exercises: [{}] }] }))).toThrow(/ساختار/);
    expect(() => parseProgramFile(JSON.stringify({ programme: [sample[0], sample[0]] }))).toThrow(/تکراری/);
    expect(() => parseProgramFile(JSON.stringify({ programme: [{ ...sample[0], exercises: [{ ...sample[0]!.exercises[0], prescription: { ...sample[0]!.exercises[0]!.prescription, sets: 0 } }] }] }))).toThrow(/تعداد ست/);
  });
});
