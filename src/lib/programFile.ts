import type { WorkoutExercise, WorkoutTemplate } from '../types';
import { validateProgram } from './programRules';

// The account sync API accepts at most 200 KiB per programme record.
export const PROGRAM_FILE_MAX_BYTES = 200 * 1024;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Read only programme fields; never import unrelated account, workout, or profile data. */
export function parseProgramFile(raw: string): WorkoutTemplate[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('فایل JSON معتبر نیست.'); }
  const candidate = Array.isArray(parsed) ? parsed : object(parsed) ? parsed.programme : null;
  if (!Array.isArray(candidate) || !candidate.length || candidate.length > 40) throw new Error('فایل باید بین ۱ تا ۴۰ روز برنامهٔ شخصی داشته باشد.');
  const program: WorkoutTemplate[] = candidate.map((day: unknown) => {
    if (!object(day) || !text(day.id, 120) || !day.id || !text(day.name, 200) || !text(day.dayLabel, 200) ||
      !text(day.focus, 300) || !number(day.durationMinutes) || day.durationMinutes < 0 || !text(day.description, 2000) ||
      (day.optional !== undefined && typeof day.optional !== 'boolean') || !Array.isArray(day.exercises) || day.exercises.length > 100) {
      throw new Error('ساختار روزهای برنامه معتبر نیست.');
    }
    const exercises: WorkoutExercise[] = day.exercises.map((entry: unknown) => {
      if (!object(entry) || !text(entry.exerciseId, 120) || !entry.exerciseId || !text(entry.name, 200) || !object(entry.prescription)) throw new Error('ساختار حرکت‌های برنامه معتبر نیست.');
      const p = entry.prescription;
      if (!number(p.sets) || !number(p.minReps) || !number(p.maxReps) || !number(p.restSeconds) ||
        !text(p.targetRirLabel, 100) || !number(p.minimumRir) || p.minimumRir < 0 || p.minimumRir > 10 ||
        (p.note !== undefined && !text(p.note, 5000))) throw new Error('جزئیات حرکت‌های برنامه معتبر نیست.');
      return {
        exerciseId: entry.exerciseId, name: entry.name,
        prescription: { sets: p.sets, minReps: p.minReps, maxReps: p.maxReps, restSeconds: p.restSeconds,
          targetRirLabel: p.targetRirLabel, minimumRir: p.minimumRir, ...(p.note !== undefined ? { note: p.note } : {}) },
      };
    });
    return { id: day.id, name: day.name, dayLabel: day.dayLabel, focus: day.focus,
      durationMinutes: day.durationMinutes, description: day.description, ...(day.optional !== undefined ? { optional: day.optional } : {}), exercises };
  });
  if (new TextEncoder().encode(JSON.stringify(program)).byteLength > PROGRAM_FILE_MAX_BYTES) throw new Error('برنامه برای همگام‌سازی بیش از حد بزرگ است.');
  const errors = validateProgram(program);
  if (errors.length) throw new Error(errors[0]);
  return program;
}

export function programFileText(program: WorkoutTemplate[]): string {
  return JSON.stringify({ app: 'Meety', format: 'personal-program', version: 1, programme: program }, null, 2);
}
